import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db/database.js';
import crypto from 'node:crypto';
import { config } from '../security/config.js';
import { sunatService } from '../services/sunat.service.js';
import { PLANS, planOf, withIgv } from '../security/pricing.js';
import { RUC_IN_REVIEW, RUC_NOT_YOURS, rucOwnership } from '../security/rucOwnership.js';
import { getMerchantProfile } from '../security/merchantContext.js';
import { audit } from '../security/audit.js';
import { rateLimit } from '../security/guards.js';
import { clientIp } from '../security/http.js';
import { getNotificationState, markSeen, parsePreferences, savePreferences, unreadCount } from './notifications.js';

export const merchantRouter = Router();


// Planes de suscripción (Basic / Pro). El cobro de la suscripción se activa cuando haya banco real.
const planView = (id: unknown) => {
  const current = planOf(id);
  return {
    current: current.id,
    billing: 'PENDIENTE_BANCO',
    plans: Object.values(PLANS).map((p) => ({ ...p, price_with_igv_cents: withIgv(p.price_cents) }))
  };
};

merchantRouter.get('/plan', async (req, res) => {
  const merchant = await getMerchantProfile(req);
  res.json(planView(merchant.plan));
});

merchantRouter.post('/plan', async (req, res) => {
  const merchant = await getMerchantProfile(req);
  const wanted = req.body?.plan;
  if (wanted !== 'BASIC' && wanted !== 'PRO') {
    return res.status(422).json({ error: { code: 'PLAN_INVALID', message: 'Elige el plan Basic o Pro.' } });
  }
  await db.prepare('UPDATE merchant_profiles SET plan = ?, plan_changed_at = ? WHERE id = ?').run(wanted, new Date().toISOString(), merchant.id);
  res.json(planView(wanted));
});

// ── Perfiles: RUC verificado, activación de Kuota Payments (paywall) y perfil Provider ────────────────────────
const maskRuc = (v: unknown) => (typeof v === 'string' && v.length > 3 ? '•'.repeat(v.length - 3) + v.slice(-3) : null);
const lastNine = (v: unknown) => (typeof v === 'string' ? v.replace(/[^0-9]/g, '').slice(-9) : '');

// Qué puede hacer este usuario: vender exige RUC verificado y Kuota Payments activo.
merchantRouter.get('/profile-access', async (req, res) => {
  const m = (await getMerchantProfile(req)) as Record<string, any>;
  const phone = lastNine(m.phone);
  const prov = phone.length === 9
    ? ((await db.prepare(
        "SELECT id, legal_name, kyc_status FROM provider_profiles WHERE right(regexp_replace(coalesce(whatsapp, ''), '[^0-9]', '', 'g'), 9) = ? ORDER BY created_at DESC LIMIT 1"
      ).get(phone)) as { id: string; legal_name: string | null; kyc_status: string | null } | undefined)
    : undefined;
  const rucVerified = m.ruc_verified === true;
  res.json({
    business_name: m.business_name ?? null,
    ruc_verified: rucVerified,
    ruc_masked: rucVerified ? maskRuc(m.ruc) : null,
    payments_active: m.payments_active !== false,
    can_sell: rucVerified && m.payments_active !== false,
    next_step: !rucVerified ? (m.ruc_review_status === 'PENDING' ? 'RUC_IN_REVIEW' : 'ADD_RUC') : m.payments_active === false ? 'PAYWALL' : 'SELL',
    can_have_provider: rucVerified,
    provider: prov ? { id: prov.id, business_name: prov.legal_name, kyc_status: prov.kyc_status } : null
  });
});

// Valida el RUC en SUNAT y devuelve la razón social para que el usuario confirme que es su negocio.
merchantRouter.get('/ruc/lookup/:ruc', async (req, res) => {
  const m = (await getMerchantProfile(req)) as Record<string, any>;
  const ruc = String(req.params.ruc || '').replace(/\D/g, '');
  if (ruc.length !== 11) return res.status(422).json({ error: { code: 'RUC_INVALID', message: 'El RUC tiene 11 dígitos. Revísalo y vuelve a intentar.' } });
  const r = await sunatService.buscarPorRuc(ruc);
  if (!r.success || !r.data) {
    return res.status(404).json({ error: { code: 'RUC_NOT_FOUND', message: r.error || 'No pudimos validar ese RUC en SUNAT. Revisa que esté activo y sea el tuyo.' } });
  }
  const dup = await db.prepare('SELECT id FROM merchant_profiles WHERE ruc = ? AND ruc_verified = TRUE AND id <> ?').get(ruc, m.id);
  if (dup) {
    return res.status(409).json({ error: { code: 'RUC_ALREADY_REGISTERED', message: 'Este RUC ya está registrado con otro teléfono. Recupera el acceso a tu cuenta original.' } });
  }
  res.json({ ruc, razon_social: r.data.razon_social, direccion: (r.data as any).direccion_fiscal ?? null });
});

// Agrega el RUC al mismo usuario (mismo teléfono, clave e historial).
merchantRouter.post('/ruc', async (req, res) => {
  const m = (await getMerchantProfile(req)) as Record<string, any>;
  const ruc = String(req.body?.ruc || '').replace(/\D/g, '');
  if (ruc.length !== 11) return res.status(422).json({ error: { code: 'RUC_INVALID', message: 'El RUC tiene 11 dígitos. Revísalo y vuelve a intentar.' } });
  const r = await sunatService.buscarPorRuc(ruc);
  if (!r.success || !r.data) {
    return res.status(404).json({ error: { code: 'RUC_NOT_FOUND', message: r.error || 'No pudimos validar ese RUC en SUNAT.' } });
  }
  const dup = await db.prepare('SELECT id FROM merchant_profiles WHERE ruc = ? AND ruc_verified = TRUE AND id <> ?').get(ruc, m.id);
  if (dup) {
    return res.status(409).json({ error: { code: 'RUC_ALREADY_REGISTERED', message: 'Este RUC ya está registrado con otro teléfono. Recupera el acceso a tu cuenta original.' } });
  }
  const ownership = rucOwnership(ruc, m.dni, m.doc_type ?? 'DNI');
  if (ownership === 'MISMATCH') {
    return res.status(403).json({ error: { code: 'RUC_NOT_YOURS', message: RUC_NOT_YOURS } });
  }
  if (ownership === 'NEEDS_REVIEW') {
    // Empresa: se guarda el RUC pero no se habilita vender hasta la revisión KYB (no se muestra su nombre en cobros).
    await db.prepare("UPDATE merchant_profiles SET ruc = ?, ruc_verified = FALSE, ruc_review_status = 'PENDING', ruc_review_at = ?, updated_at = utc_now_text() WHERE id = ?").run(ruc, new Date().toISOString(), m.id);
    return res.status(202).json({ ruc_verified: false, review: 'PENDING', ruc_masked: maskRuc(ruc), business_name: r.data.razon_social, message: RUC_IN_REVIEW });
  }
  await db.prepare("UPDATE merchant_profiles SET ruc = ?, ruc_verified = TRUE, ruc_review_status = 'APPROVED', business_name = ?, updated_at = utc_now_text() WHERE id = ?").run(ruc, r.data.razon_social, m.id);
  res.json({ ruc_verified: true, ruc_masked: maskRuc(ruc), business_name: r.data.razon_social });
});

// Paywall de Kuota Payments: aceptar activa vender. En pruebas no se cobra la suscripción (ver /plan).
merchantRouter.post('/sales/activate', async (req, res) => {
  const m = (await getMerchantProfile(req)) as Record<string, any>;
  if (m.ruc_verified !== true) {
    return res.status(409).json({ error: { code: 'RUC_REQUIRED', message: 'Agrega tu RUC para poder vender.' } });
  }
  const wanted = req.body?.plan === 'PRO' ? 'PRO' : 'BASIC';
  await db.prepare('UPDATE merchant_profiles SET payments_active = TRUE, plan = ?, plan_changed_at = ? WHERE id = ?').run(wanted, new Date().toISOString(), m.id);
  res.json({ payments_active: true, ...planView(wanted) });
});

// Crea el perfil Provider reutilizando el RUC verificado, el teléfono y la clave de este usuario.
merchantRouter.post('/provider-profile', async (req, res) => {
  const m = (await getMerchantProfile(req)) as Record<string, any>;
  if (m.ruc_verified !== true) {
    return res.status(409).json({ error: { code: 'RUC_REQUIRED', message: 'Agrega tu RUC para abrir tu perfil Proveedor.' } });
  }
  const phone = lastNine(m.phone);
  const cred = (await db.prepare('SELECT pin_hash FROM merchant_credentials WHERE merchant_id = ?').get(m.id)) as { pin_hash: string } | undefined;
  if (!cred?.pin_hash) return res.status(409).json({ error: { code: 'PIN_NOT_CONFIGURED', message: 'Primero crea tu PIN.' } });
  const token = crypto.randomBytes(32).toString('base64url');
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const existing = (await db.prepare('SELECT id, whatsapp FROM provider_profiles WHERE ruc = ?').get(m.ruc)) as { id: string; whatsapp: string | null } | undefined;
  let providerId: string;
  if (existing) {
    if (lastNine(existing.whatsapp) !== phone) {
      return res.status(409).json({ error: { code: 'RUC_ALREADY_REGISTERED', message: 'Este RUC ya tiene un perfil Proveedor con otro teléfono.' } });
    }
    providerId = existing.id;
    await db.prepare('UPDATE provider_profiles SET access_token_hash = ? WHERE id = ?').run(tokenHash, providerId);
  } else {
    providerId = 'prov_' + uuidv4().substring(0, 10);
    await db.prepare(
      "INSERT INTO provider_profiles (id, ruc, legal_name, whatsapp, category, seniority_range, kyc_status, fee_bps, pin_hash, access_token_hash) VALUES (?, ?, ?, ?, ?, ?, 'IN_REVIEW', ?, ?, ?)"
    ).run(providerId, m.ruc, m.business_name ?? 'Mi empresa', phone, m.category ?? 'OTHER', m.seniority_range ?? '1Y_3Y', config.feeBps, cred.pin_hash, tokenHash);
  }
  res.status(201).json({ provider_id: providerId, provider_token: token, business_name: m.business_name ?? null });
});

// PRD 05: Inicio (Home agregado p95 < 400ms)
merchantRouter.get('/home', async (req, res) => {
  const merchant = await getMerchantProfile(req);
  if (!merchant) {
    return res.status(404).json({ error: { code: 'MERCHANT_NOT_FOUND', message: 'Comercio no encontrado.' } });
  }

  const user = await db.prepare('SELECT * FROM users WHERE id = ?').get(merchant.user_id) as any;
  const line = await db.prepare('SELECT * FROM credit_lines WHERE merchant_id = ?').get(merchant.id) as any;
  const level = await db.prepare('SELECT * FROM credit_levels WHERE level = ?').get(line?.level || 1) as any;

  const totalLimit = line?.total_limit_cents || 140000;
  const used = line?.used_cents || 0;
  const available = Math.max(0, totalLimit - used);
  const downPaymentPct = level?.down_payment_pct || 50;
  const purchasingPower = downPaymentPct > 0 ? Math.round((available * 100) / downPaymentPct) : available;

  // Next pending installment
  const nextInstallment = await db.prepare(`
    SELECT i.*, p.plan_code, p.provider_id, prov.legal_name as provider_name
    FROM installments i
    JOIN credit_purchases p ON i.purchase_id = p.id
    JOIN provider_profiles prov ON p.provider_id = prov.id
    WHERE p.merchant_id = ? AND i.status = 'PENDING'
    ORDER BY i.due_date ASC
    LIMIT 1
  `).get(merchant.id) as any;

  // Active Promotions
  const promotions = await db.prepare(`
    SELECT * FROM promotions WHERE active = 1 ORDER BY ends_in_days ASC LIMIT 3
  `).all();

  // Dynamic greeting based on Lima time
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Buenos días' : hour < 19 ? 'Buenas tardes' : 'Buenas noches';

  res.json({
    greeting_name: user?.first_name || String(merchant.full_name || '').split(' ')[0] || '',
    greeting_prefix: greeting,
    credit: {
      total_limit_cents: totalLimit,
      used_cents: used,
      available_cents: available,
      purchasing_power_cents: purchasingPower,
      level: line?.level || 1,
      level_name: level?.name || 'Brote',
      down_payment_pct: downPaymentPct,
      revolving: true,
      status: line?.status || 'ACTIVE'
    },
    next_installment: nextInstallment ? {
      installment_id: nextInstallment.id,
      merchant_name: nextInstallment.provider_name || 'Confecciones Don Lucho & Hnos.',
      number: nextInstallment.number,
      total: 3,
      due_date: nextInstallment.due_date,
      amount_cents: nextInstallment.amount_cents
    } : null,
    level_progress: {
      consecutive_on_time: line?.consecutive_on_time || 0,
      target: 3,
      next_level: (line?.level || 1) < 6 ? (line?.level || 1) + 1 : null,
      next_down_payment_pct: (line?.level || 1) === 1 ? 40 : 30
    },
    promotions,
    unread_notifications: await unreadCount(merchant.id)
  });
});

// Notificaciones (campana del Home)
merchantRouter.get('/notifications/preferences', async (req, res) => {
  const merchant = await getMerchantProfile(req);
  res.json(await getNotificationState(merchant.id));
});

merchantRouter.put('/notifications/preferences', async (req, res) => {
  const merchant = await getMerchantProfile(req);
  const input = parsePreferences(req.body);
  if (typeof input === 'string') {
    return res.status(400).json({ error: { code: 'INVALID_PREFERENCES', message: input } });
  }
  res.json(await savePreferences(merchant.id, input));
});

// Abrir el sheet marca las notificaciones como vistas (apaga el punto rojo).
merchantRouter.post('/notifications/seen', async (req, res) => {
  const merchant = await getMerchantProfile(req);
  await markSeen(merchant.id);
  res.json({ unread_count: 0 });
});

// PRD 07: Modal Kuotear
merchantRouter.get('/kuotear', async (req, res) => {
  const merchant = await getMerchantProfile(req);
  const line = await db.prepare('SELECT * FROM credit_lines WHERE merchant_id = ?').get(merchant.id) as any;
  const level = await db.prepare('SELECT * FROM credit_levels WHERE level = ?').get(line?.level || 1) as any;
  const score = await db.prepare('SELECT * FROM credit_scores WHERE merchant_id = ?').get(merchant.id) as any;

  // Active purchase verification for Rule 3.2
  const activePurchase = await db.prepare(`
    SELECT id FROM credit_purchases
    WHERE merchant_id = ? AND status IN ('ACTIVE_ON_TIME', 'ACTIVE_OVERDUE')
  `).get(merchant.id);

  const nextInstallment = await db.prepare(`
    SELECT i.*, prov.legal_name as provider_name
    FROM installments i
    JOIN credit_purchases p ON i.purchase_id = p.id
    JOIN provider_profiles prov ON p.provider_id = prov.id
    WHERE p.merchant_id = ? AND i.status = 'PENDING'
    ORDER BY i.due_date ASC
    LIMIT 1
  `).get(merchant.id) as any;

  res.json({
    credit: {
      available_cents: Math.max(0, (line?.total_limit_cents || 140000) - (line?.used_cents || 0)),
      level: line?.level || 1,
      level_name: level?.name || 'Brote'
    },
    next_installment: nextInstallment ? {
      due_date: nextInstallment.due_date,
      amount_cents: nextInstallment.amount_cents
    } : null,
    score: {
      value: score?.score || 720,
      label: (score?.score || 720) >= 750 ? 'Excelente' : 'Bueno'
    },
    actions: {
      buy_on_credit: {
        enabled: !activePurchase && line?.status === 'ACTIVE',
        reason: activePurchase ? 'Ya tienes una compra a crédito activa (Regla 3.2).' : null
      },
      collect: {
        enabled: true,
        fee_pct: config.feeBps / 100
      },
      simulate: {
        enabled: true
      }
    }
  });
});

// PRD 04: Welcome Summary
merchantRouter.get('/welcome-summary', async (req, res) => {
  const merchant = await getMerchantProfile(req);
  const line = await db.prepare('SELECT * FROM credit_lines WHERE merchant_id = ?').get(merchant.id) as any;
  const level = await db.prepare('SELECT * FROM credit_levels WHERE level = ?').get(line?.level || 1) as any;

  res.json({
    business: {
      name: merchant.business_name,
      ruc: merchant.ruc,
      city: merchant.city || 'Lima',
      category: merchant.category || null,
      district: merchant.district || null,
      status: 'ACTIVE'
    },
    credit_line: {
      total_limit_cents: line?.total_limit_cents || 140000,
      level: line?.level || 1,
      level_name: level?.name || 'Brote',
      down_payment_pct: level?.down_payment_pct || 50
    },
    next_level: {
      level: 2,
      limit_cents: 350000,
      hint: 'en 60 días con pagos puntuales'
    }
  });
});

// PRD 03: CRUD de Productos
merchantRouter.get('/products', async (req, res) => {
  const merchant = await getMerchantProfile(req);
  const products = await db.prepare(`
    SELECT * FROM products
    WHERE merchant_id = ? AND deleted_at IS NULL
    ORDER BY sort_order ASC
  `).all(merchant.id);
  res.json(products);
});

merchantRouter.post('/products', async (req, res) => {
  const merchant = await getMerchantProfile(req);
  const { name, price_cents, is_frequent } = req.body;

  if (!name || name.trim().length < 2) {
    return res.status(422).json({ error: { code: 'PRODUCT_NAME_REQUIRED', message: 'Escribe el nombre del producto.' } });
  }
  if (!price_cents || price_cents <= 0) {
    return res.status(422).json({ error: { code: 'PRODUCT_PRICE_INVALID', message: 'Ingresa un precio mayor a S/ 0.' } });
  }

  const id = 'prod_' + uuidv4().substring(0, 10);
  await db.prepare(`
    INSERT INTO products (id, merchant_id, name, price_cents, is_frequent, sort_order)
    VALUES (?, ?, ?, ?, ?, (SELECT coalesce(max(sort_order), 0) + 1 FROM products WHERE merchant_id = ?))
  `).run(id, merchant.id, name.trim(), Math.round(price_cents), is_frequent ? 1 : 0, merchant.id);

  res.status(201).json({ id, name, price_cents, is_frequent });
});

// PRD 06: Ventas de mi negocio
merchantRouter.get('/sales/summary', async (req, res) => {
  const merchant = await getMerchantProfile(req);
  const verified = await db.prepare(`
    SELECT count(*) as count, coalesce(sum(amount_cents), 0) as total_cents
    FROM sales WHERE merchant_id = ? AND verified = 1
  `).get(merchant.id) as any;

  const declared = await db.prepare(`
    SELECT count(*) as count, coalesce(sum(amount_cents), 0) as total_cents
    FROM sales WHERE merchant_id = ? AND verified = 0
  `).get(merchant.id) as any;

  const totalCents = (verified.total_cents || 0) + (declared.total_cents || 0);

  res.json({
    total_revenue_cents: totalCents,
    verified: {
      count: verified.count || 0,
      total_cents: verified.total_cents || 0,
      label: 'Comprobadas (Yape / Plin / Link)'
    },
    declared: {
      count: declared.count || 0,
      total_cents: declared.total_cents || 0,
      label: 'Declaradas manual'
    }
  });
});

merchantRouter.get('/sales', async (req, res) => {
  const merchant = await getMerchantProfile(req);
  const { source, q } = req.query;

  let query = 'SELECT * FROM sales WHERE merchant_id = ?';
  const params: any[] = [merchant.id];

  if (source === 'VERIFIED') {
    query += ' AND verified = 1';
  } else if (source === 'DECLARED') {
    query += ' AND verified = 0';
  }

  if (typeof q === 'string' && q.trim()) {
    // Sin NUL (Postgres lo rechaza) y con %, _ y ! literales: el texto buscado no actúa como comodín.
    const needle = q.split(String.fromCharCode(0)).join("").slice(0, 80).replace(/[!%_]/g, (c) => "!" + c);
    query += " AND (concept ILIKE ? ESCAPE '!' OR operation_ref ILIKE ? ESCAPE '!')";
    params.push(`%${needle}%`, `%${needle}%`);
  }

  query += ' ORDER BY occurred_at DESC LIMIT 50';

  const sales = await db.prepare(query).all(...params);
  res.json(sales);
});

merchantRouter.post('/sales', async (req, res) => {
  const merchant = await getMerchantProfile(req);
  const { amount_cents, concept } = req.body ?? {};
  // Una venta escrita a mano siempre es declarada: solo el webhook de pago marca ventas verificadas.
  const source = 'MANUAL';

  if (!Number.isFinite(amount_cents) || amount_cents <= 0 || amount_cents > 100_000_000) {
    return res.status(422).json({ error: { code: 'SALE_AMOUNT_INVALID', message: 'Ingresa un monto válido.' } });
  }

  const id = 'sale_' + uuidv4().substring(0, 10);
  const verified = 0;

  await db.prepare(`
    INSERT INTO sales (id, merchant_id, source, amount_cents, concept, verified, occurred_at)
    VALUES (?, ?, ?, ?, ?, ?, utc_now_text())
  `).run(id, merchant.id, source, Math.round(amount_cents), (typeof concept === 'string' && concept.trim() ? concept.trim().slice(0, 200) : 'Venta manual'), verified);

  // Increase score points (+2 for declared, +5 for verified)
  const points = verified ? 5 : 2;
  await db.prepare(`
    INSERT INTO score_events (id, merchant_id, type, points, ref_id)
    VALUES (?, ?, ?, ?, ?)
  `).run('sev_' + uuidv4().substring(0, 10), merchant.id, verified ? 'VERIFIED_SALE' : 'DECLARED_SALE', points, id);

  await db.prepare('UPDATE credit_scores SET score = LEAST(850, score + ?) WHERE merchant_id = ?').run(points, merchant.id);

  res.status(201).json({ id, amount_cents, verified, points_earned: points });
});

// PRD 06: OCR Comprobante Processing & Verification
merchantRouter.post('/sales/ocr', async (req, res) => {
  const merchant = await getMerchantProfile(req);
  const amountCents = req.body?.amount_cents && Number(req.body.amount_cents) > 0
    ? Math.round(Number(req.body.amount_cents))
    : Math.floor(25 + Math.random() * 250) * 100;

  const source = req.body?.source && ['YAPE', 'PLIN', 'MANUAL', 'OCR', 'PAYMENT_LINK'].includes(req.body.source)
    ? req.body.source
    : 'OCR';

  const concept = req.body?.concept || (source === 'YAPE' ? 'Comprobante Yape verificado' : source === 'PLIN' ? 'Comprobante Plin verificado' : 'Comprobante OCR verificado');
  const opRef = req.body?.operation_ref || ('OP-' + Math.floor(100000 + Math.random() * 900000));

  const id = 'sale_' + uuidv4().substring(0, 10);
  await db.prepare(`
    INSERT INTO sales (id, merchant_id, source, amount_cents, concept, operation_ref, verified, occurred_at)
    VALUES (?, ?, ?, ?, ?, ?, 0, utc_now_text())
  `).run(id, merchant.id, source, amountCents, String(concept).slice(0, 200), opRef);

  // No hay lectura real del comprobante: queda como venta declarada (+2), nunca verificada.
  await db.prepare('UPDATE credit_scores SET score = LEAST(850, score + 2) WHERE merchant_id = ?').run(merchant.id);
  const updatedScore = await db.prepare('SELECT score FROM credit_scores WHERE merchant_id = ?').get(merchant.id) as any;

  res.json({
    id,
    operation_ref: opRef,
    amount_cents: amountCents,
    concept,
    source,
    verified: false,
    confidence: 0,
    points_earned: 2,
    new_score: updatedScore?.score || 728,
    message: 'Venta registrada. Queda como declarada hasta que se pueda verificar el comprobante.'
  });
});

merchantRouter.get('/score', async (req, res) => {
  const merchant = await getMerchantProfile(req);
  const score = await db.prepare('SELECT * FROM credit_scores WHERE merchant_id = ?').get(merchant.id) as any;
  res.json({
    score: score?.score || 720,
    level: score?.level || 1,
    last_validated_at: score?.last_calculated_at || new Date().toISOString()
  });
});

// ── Contactos: ¿este celular ya tiene cuenta Kuota? ─────────────────────────────────────────────
// Sirve para cobrar sin pedir datos bancarios. También podría usarse para averiguar quién usa Kuota, así que:
// exige sesión del dispositivo, se limita por minuto y por hora, se anota en la bitácora (sin el número) y solo
// devuelve lo que ya es público en una página de cobro (nombre del negocio) o nombre con apellidos abreviados.
const lookupKey = (req: any) => `${clientIp(req)}:${req.headers['x-merchant-id'] ?? ''}`;
const lookupPerMinute = rateLimit({ name: 'contact-lookup-min', windowMs: 60_000, max: 15, key: lookupKey });
const lookupPerHour = rateLimit({ name: 'contact-lookup-hour', windowMs: 3_600_000, max: 120, key: lookupKey });

/** Celular peruano de 9 dígitos (acepta +51 / 51 y separadores) o null. */
export function phone9(v: unknown): string | null {
  const d = typeof v === 'string' ? v.replace(/\D/g, '') : '';
  const n = d.length === 11 && d.startsWith('51') ? d.slice(2) : d;
  return /^9\d{8}$/.test(n) ? n : null;
}

/** "HUAMANI LOVATON JOSUE" -> "Huamani L*** J***". */
export function maskedName(full: string | null | undefined): string | null {
  const parts = (full ?? '').trim().split(/\s+/).filter(Boolean).slice(0, 3);
  if (!parts.length) return null;
  const cap = (w: string) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
  return [cap(parts[0]), ...parts.slice(1).map((w) => w.charAt(0).toUpperCase() + '***')].join(' ');
}

merchantRouter.post('/contacts/lookup', lookupPerMinute, lookupPerHour, async (req, res) => {
  const me = await getMerchantProfile(req);
  const phone = phone9(req.body?.phone);
  if (!phone) {
    return res.status(422).json({ error: { code: 'PHONE_INVALID', message: 'Ingresa un celular peruano de 9 dígitos (empieza con 9).' } });
  }
  const digits = (col: string) => `right(regexp_replace(coalesce(${col}, ''), '[^0-9]', '', 'g'), 9)`;
  const m = (await db
    .prepare(`SELECT id, user_id, business_name, full_name, ruc_verified FROM merchant_profiles WHERE ${digits('phone')} = ? ORDER BY updated_at DESC LIMIT 1`)
    .get(phone)) as { id: string; user_id: string | null; business_name: string | null; full_name: string | null; ruc_verified: number | boolean | null } | undefined;
  const p = m
    ? undefined
    : ((await db
        .prepare(`SELECT id, user_id, legal_name FROM provider_profiles WHERE ${digits('whatsapp')} = ? ORDER BY created_at DESC LIMIT 1`)
        .get(phone)) as { id: string; user_id: string | null; legal_name: string | null } | undefined);
  const found = !!(m || p);
  const isSelf = (!!m && m.id === me.id) || (!!p && !!p.user_id && p.user_id === me.user_id);
  await audit({ actorType: 'MERCHANT', actorId: me.id, action: 'CONTACT_LOOKUP', result: 'OK', ip: clientIp(req), details: { found } });
  res.json({
    phone_masked: `+51 ••• ••• ${phone.slice(-3)}`,
    registered: found,
    is_self: isSelf,
    kind: m ? 'EMPRENDEDOR' : p ? 'PROVEEDOR' : null,
    display_name: m ? m.business_name?.trim() || maskedName(m.full_name) : p ? p.legal_name?.trim() || null : null,
    verified: !!m?.ruc_verified
  });
});
