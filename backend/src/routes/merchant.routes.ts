import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db/database.js';
import { getMerchantProfile } from '../security/merchantContext.js';
import { getNotificationState, markSeen, parsePreferences, savePreferences, unreadCount } from './notifications.js';

export const merchantRouter = Router();


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
        fee_pct: 1.0
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
