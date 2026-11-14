import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db/database.js';
import { getMerchantProfile } from '../security/merchantContext.js';
import { createOpenpayCharge } from '../integrations/openpay.js';
import { computeScore, persistScore } from '../services/scoring.service.js';
import { config } from '../security/config.js';
import { verifyIntegrityToken } from '../security/playIntegrity.js';
import { checkPin } from '../security/auth.js';
import { audit } from '../security/audit.js';
import { clientIp, headerString } from '../security/http.js';

// Pagar una cuota o liquidar una compra solo marca la deuda como pagada: no mueve dinero. Con dinero real eso regalaría
// crédito (pedir, "pagar" sin pagar y volver a pedir), así que solo se permite en modo simulado, hasta que el pago lo confirme el banco.
const paymentNotConfirmable = (res: import('express').Response) =>
  res.status(409).json({ error: { code: 'PAYMENT_GATEWAY_REQUIRED', message: 'El pago de cuotas se activa cuando conectemos el banco. Aún no se puede registrar un pago sin confirmación.' } });

export const creditRouter = Router();

/**
 * Interés plano sobre el saldo financiado. 5,5 % en 3 cuotas quincenales equivale a una TEA ≈ 102 %,
 * por debajo del tope de referencia del BCRP (114,13 % anual, may–oct 2026). Si se cambia, revisar la TEA
 * que informa la simulación y la opinión legal sobre usura (docs/CUMPLIMIENTO-REGULATORIO.md §4).
 */
export const INTEREST_RATE = 0.055;

/**
 * Tasa efectiva anual (TEA) implícita de un cronograma: resuelve la tasa por periodo que iguala el
 * capital financiado con el valor presente de las cuotas (pagos cada 14 días) y la anualiza (365 días).
 * Sin comisiones ni seguros, TCEA = TEA. Devuelve porcentaje con un decimal; null si no hay financiamiento.
 */
export function effectiveAnnualRatePct(financedCents: number, installmentAmounts: number[], periodDays = 14): number | null {
  if (financedCents <= 0 || installmentAmounts.length === 0) return null;
  const pv = (r: number) => installmentAmounts.reduce((sum, a, i) => sum + a / Math.pow(1 + r, i + 1), 0);
  if (pv(0) <= financedCents) return 0;
  let lo = 0;
  let hi = 1;
  while (pv(hi) > financedCents && hi < 1e6) hi *= 2;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    if (pv(mid) > financedCents) lo = mid;
    else hi = mid;
  }
  const annual = Math.pow(1 + (lo + hi) / 2, 365 / periodDays) - 1;
  return Math.round(annual * 1000) / 10;
}

const MAX_PURCHASE_CENTS = 100_000_000;
const MAX_INSTALLMENTS = 12;


const AFFILIATED_PROVIDERS: Record<string, { name: string; address: string; phone: string }> = {
  prov_donlucho: { name: 'Confecciones Don Lucho & Hnos. S.A.C.', address: 'Galería Santa Rosa, Tda. 204 – Jr. Gamarra 840, La Victoria', phone: '+51 984 521 893' },
  prov_distlima: { name: 'Distribuidora Lima Mayorista S.R.L.', address: 'Pab. B, Stand 112 – Mercado Central de Lima, Cercado de Lima', phone: '+51 976 112 340' },
  prov_alicorp: { name: 'Alicorp Distribución Directa S.A.', address: 'Av. Argentina 4793, Callao', phone: '+51 1 315 0800' },
  prov_textilnorte: { name: 'Textiles del Norte E.I.R.L.', address: 'Av. Aviación 2345, San Borja', phone: '+51 981 445 220' }
};

function resolveProviderInfo(purchase: any) {
  const known = AFFILIATED_PROVIDERS[purchase.provider_id];
  return {
    id: purchase.provider_id,
    name: purchase.provider_name || known?.name || 'Proveedor Kuota Aliado',
    address: purchase.address_line ? `${purchase.address_line}, ${purchase.district || ''}` : (known?.address || 'Lima, Perú'),
    phone: purchase.whatsapp || known?.phone || '+51 999 000 000'
  };
}

// PRD 10: Mi línea de crédito
creditRouter.get('/line', async (req, res) => {
  const merchant = await getMerchantProfile(req);
  const line = await db.prepare('SELECT * FROM credit_lines WHERE merchant_id = ?').get(merchant.id) as any;
  const level = await db.prepare('SELECT * FROM credit_levels WHERE level = ?').get(line?.level || 1) as any;
  const nextLevel = await db.prepare('SELECT * FROM credit_levels WHERE level = ?').get((line?.level || 1) + 1) as any;

  const totalLimit = line?.total_limit_cents || 140000;
  const used = line?.used_cents || 0;
  const available = Math.max(0, totalLimit - used);

  const pendingCount = await db.prepare(`
    SELECT count(*) as count FROM installments i
    JOIN credit_purchases p ON i.purchase_id = p.id
    WHERE p.merchant_id = ? AND i.status = 'PENDING'
  `).get(merchant.id) as any;

  res.json({
    line: {
      id: line?.id,
      status: line?.status || 'ACTIVE',
      total_limit_cents: totalLimit,
      used_cents: used,
      available_cents: available
    },
    level: {
      level: level?.level || 1,
      name: level?.name || 'Brote',
      down_payment_pct: level?.down_payment_pct || 50
    },
    next_level: nextLevel ? {
      level: nextLevel.level,
      name: nextLevel.name,
      down_payment_pct: nextLevel.down_payment_pct,
      max_line_cents: nextLevel.max_line_cents,
      progress: {
        current: line?.consecutive_on_time || 0,
        target: 3
      }
    } : null,
    pending_installments_count: pendingCount.count || 0
  });
});

// PRD 10: Catálogo canónico de 6 niveles
creditRouter.get('/levels', async (req, res) => {
  const levels = await db.prepare('SELECT * FROM credit_levels ORDER BY level ASC').all();
  res.json(levels);
});

// PRD 07: Simulador de cuotas
creditRouter.post('/simulations', async (req, res) => {
  const { purchase_cents, installments = 3, level = 1 } = req.body ?? {};

  if (!Number.isInteger(purchase_cents) || purchase_cents <= 0 || purchase_cents > MAX_PURCHASE_CENTS) {
    return res.status(422).json({ error: { code: 'AMOUNT_INVALID', message: 'Ingresa un monto de compra válido.' } });
  }
  if (!Number.isInteger(installments) || installments < 1 || installments > MAX_INSTALLMENTS) {
    return res.status(422).json({ error: { code: 'INSTALLMENTS_INVALID', message: 'El número de cuotas no es válido.' } });
  }
  if (!Number.isInteger(level) || level < 1 || level > 6) {
    return res.status(422).json({ error: { code: 'LEVEL_INVALID', message: 'Nivel no válido.' } });
  }

  const levelInfo = await db.prepare('SELECT * FROM credit_levels WHERE level = ?').get(level) as any;
  const downPaymentPct = levelInfo?.down_payment_pct ?? 50;

  const downPaymentCents = Math.round((purchase_cents * downPaymentPct) / 100);
  const financedCents = purchase_cents - downPaymentCents;

  const interestRate = INTEREST_RATE;
  const totalInterestCents = Math.round(financedCents * interestRate);
  const totalToPayCents = financedCents + totalInterestCents;
  const installmentCents = Math.round(totalToPayCents / installments);

  const schedule: { number: number; due_date: string; amount_cents: number }[] = [];
  const today = new Date();
  for (let i = 1; i <= installments; i++) {
    const dueDate = new Date(today);
    dueDate.setDate(today.getDate() + i * 14); // Quincenal
    schedule.push({
      number: i,
      due_date: dueDate.toISOString().split('T')[0],
      amount_cents: i === installments ? totalToPayCents - installmentCents * (installments - 1) : installmentCents
    });
  }

  res.json({
    purchase_cents,
    down_payment_cents: downPaymentCents,
    down_payment_pct: downPaymentPct,
    financed_cents: financedCents,
    installments_count: installments,
    installment_cents: installmentCents,
    total_repayment_cents: totalToPayCents,
    interest_cents: totalInterestCents,
    // TEA/TCEA reales calculadas del cronograma (sin comisiones ni seguros: ambas coinciden).
    tea_pct: effectiveAnnualRatePct(financedCents, schedule.map((s) => s.amount_cents)),
    tcea_pct: effectiveAnnualRatePct(financedCents, schedule.map((s) => s.amount_cents)),
    schedule
  });
});

// P2P aKuotas: crear nueva compra al crédito
creditRouter.post('/purchases', async (req, res) => {
  const merchant = await getMerchantProfile(req);
  const { provider_id, total_cents, installments = 3, integrity_token, integrity_nonce, pin, idempotency_key } = req.body ?? {};

  // Idempotency key: required, opaque string ≤ 64 chars from the client.
  if (typeof idempotency_key !== 'string' || idempotency_key.length < 1 || idempotency_key.length > 64) {
    return res.status(422).json({ error: { code: 'IDEMPOTENCY_KEY_REQUIRED', message: 'Se requiere una clave de idempotencia para crear una compra.' } });
  }

  // Verificar integridad del APK antes de crear una compra.
  const integrity = await verifyIntegrityToken(integrity_token, integrity_nonce ?? '');
  if (!integrity.ok) {
    return res.status(403).json({ error: { code: 'INTEGRITY_FAILED', message: 'No se pudo verificar la integridad del dispositivo.', reason: integrity.reason } });
  }

  // Step-up PIN: confirmar identidad del comerciante antes de comprometer crédito.
  const ip = clientIp(req);
  const deviceId = headerString(req, 'x-device-id') || undefined;
  const pinCheck = await checkPin(merchant.id, pin, { ip, deviceId, purpose: 'PURCHASE_STEP_UP' });
  if (!pinCheck.ok) {
    return res.status(pinCheck.status).json({ error: { code: pinCheck.code, message: pinCheck.message, ...pinCheck.extra } });
  }

  if (typeof provider_id !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(provider_id)) {
    return res.status(422).json({ error: { code: 'PROVIDER_INVALID', message: 'Proveedor no válido.' } });
  }
  if (!Number.isInteger(total_cents) || total_cents <= 0 || total_cents > MAX_PURCHASE_CENTS) {
    return res.status(422).json({ error: { code: 'AMOUNT_INVALID', message: 'Ingresa un monto de compra válido.' } });
  }
  if (!Number.isInteger(installments) || installments < 1 || installments > MAX_INSTALLMENTS) {
    return res.status(422).json({ error: { code: 'INSTALLMENTS_INVALID', message: 'El número de cuotas no es válido.' } });
  }
  // El proveedor debe existir y no estar rechazado (o ser uno de los afiliados fijos de la lista de recomendados).
  if (!(provider_id in AFFILIATED_PROVIDERS)) {
    const prov = (await db.prepare('SELECT kyc_status FROM provider_profiles WHERE id = ?').get(provider_id)) as { kyc_status: string | null } | undefined;
    if (!prov || prov.kyc_status === 'REJECTED') {
      return res.status(422).json({ error: { code: 'PROVIDER_INVALID', message: 'Proveedor no disponible.' } });
    }
  }

  const created = await db.tx(async () => {
    await db.lock('purchase:' + merchant.id);

    // Idempotency: return existing purchase for this key instead of creating a duplicate.
    const existing = await db.prepare(
      'SELECT id, receipt_number, down_payment_pct, down_payment_cents, financed_cents FROM credit_purchases WHERE merchant_id = ? AND idempotency_key = ?'
    ).get(merchant.id, idempotency_key) as { id: string; receipt_number: string; down_payment_pct: number; down_payment_cents: number; financed_cents: number } | undefined;
    if (existing) {
      return { purchaseId: existing.id, receiptNumber: existing.receipt_number, downPaymentPct: existing.down_payment_pct, downPaymentCents: existing.down_payment_cents, financedCents: existing.financed_cents, idempotent: true };
    }

    // Regla 3.2: solo 1 compra activa a la vez
    const activePurchase = await db.prepare(`
      SELECT id FROM credit_purchases WHERE merchant_id = ? AND status IN ('ACTIVE_ON_TIME', 'ACTIVE_OVERDUE')
    `).get(merchant.id) as any;

    if (activePurchase) {
      res.status(422).json({ error: { code: 'RULE_3_2', message: 'Regla 3.2: Ya tienes una compra activa. Debes saldarla para comprar de nuevo.' } });
      return null;
    }

    // Verificar línea de crédito
    let line = await db.prepare('SELECT * FROM credit_lines WHERE merchant_id = ?').get(merchant.id) as any;
    if (!line) {
      // Crear línea si no existe
      const lineId = 'lin_' + uuidv4().substring(0, 10);
      await db.prepare(`
        INSERT INTO credit_lines (id, merchant_id, level, total_limit_cents, used_cents, status)
        VALUES (?, ?, 1, 140000, 0, 'ACTIVE')
      `).run(lineId, merchant.id);
      line = await db.prepare('SELECT * FROM credit_lines WHERE merchant_id = ?').get(merchant.id) as any;
    }

    const available = line.total_limit_cents - line.used_cents;
    if (available < total_cents) {
      res.status(422).json({ error: { code: 'INSUFFICIENT_CREDIT', message: `Crédito insuficiente. Disponible: S/ ${(available / 100).toFixed(2)}` } });
      return null;
    }

    const levelInfo = await db.prepare('SELECT * FROM credit_levels WHERE level = ?').get(line.level || 1) as any;
    const downPaymentPct = levelInfo?.down_payment_pct ?? 50;
    const downPaymentCents = Math.round((total_cents * downPaymentPct) / 100);
    const financedCents = total_cents - downPaymentCents;

    const interestRate = INTEREST_RATE;
    const totalInterestCents = Math.round(financedCents * interestRate);
    const totalToPayCents = financedCents + totalInterestCents;
    const installmentCents = Math.round(totalToPayCents / installments);
    const principalPerInstallment = Math.round(financedCents / installments);
    const interestPerInstallment = Math.round(totalInterestCents / installments);

    const purchaseId = 'pur_' + uuidv4().substring(0, 10);
    const receiptNumber = 'KT-' + Date.now().toString().slice(-6);

    await db.prepare(`
      INSERT INTO credit_purchases (id, merchant_id, line_id, provider_id, plan_code, total_cents,
        down_payment_pct, down_payment_cents, financed_cents, installments_count, receipt_number, status, idempotency_key)
      VALUES (?, ?, ?, ?, 'KUOTA_3X', ?, ?, ?, ?, ?, ?, 'ACTIVE_ON_TIME', ?)
    `).run(purchaseId, merchant.id, line.id, provider_id, total_cents, downPaymentPct, downPaymentCents, financedCents, installments, receiptNumber, idempotency_key);

    const today = new Date();
    for (let i = 1; i <= installments; i++) {
      const dueDate = new Date(today);
      dueDate.setDate(today.getDate() + i * 14);
      const amount = i === installments ? totalToPayCents - installmentCents * (installments - 1) : installmentCents;
      const instId = 'ins_' + uuidv4().substring(0, 10);
      await db.prepare(`
        INSERT INTO installments (id, purchase_id, number, amount_cents, principal_cents, interest_cents, due_date, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDING')
      `).run(instId, purchaseId, i, amount, principalPerInstallment, interestPerInstallment, dueDate.toISOString().split('T')[0]);
    }

    // Usar el crédito financiado en la línea
    await db.prepare(`
      UPDATE credit_lines SET used_cents = used_cents + ?, updated_at = utc_now_text() WHERE id = ?
    `).run(financedCents, line.id);

    await db.prepare(`
      INSERT INTO score_events (id, merchant_id, type, points, ref_id)
      VALUES (?, ?, 'NEW_PURCHASE', 0, ?)
    `).run('sev_' + uuidv4().substring(0, 10), merchant.id, purchaseId);


    return { purchaseId, receiptNumber, downPaymentPct, downPaymentCents, financedCents, idempotent: false };
  });
  if (!created) return;
  const { purchaseId, receiptNumber, downPaymentPct, downPaymentCents, financedCents, idempotent } = created;

  // Cargo Openpay para el enganche (sandbox: mock inmediato).
  // En replay idempotente el cargo ya existe; no volvemos a crearlo.
  let openpayChargeId: string | null = null;
  if (!idempotent) {
    try {
      const charge = await createOpenpayCharge({
        amountCents: downPaymentCents,
        description: `Kuota enganche ${receiptNumber}`,
        orderId: purchaseId
      });
      openpayChargeId = charge.id;
      if (charge.status === 'completed') {
        await db.prepare("UPDATE credit_purchases SET openpay_charge_id = ?, down_payment_status = 'CONFIRMED' WHERE id = ?")
          .run(charge.id, purchaseId);
      } else {
        await db.prepare("UPDATE credit_purchases SET openpay_charge_id = ? WHERE id = ?")
          .run(charge.id, purchaseId);
      }
    } catch (err) {
      // No bloquear la compra si Openpay falla: el webhook confirmará el pago luego.
      await audit({
        actorType: 'SYSTEM',
        actorId: merchant.id,
        action: 'OPENPAY_CHARGE_FAILED',
        target: purchaseId,
        result: 'FAILED',
        ip,
        deviceId: deviceId ?? null,
        details: { receipt_number: receiptNumber, error: err instanceof Error ? err.message : String(err) }
      });
    }
  }

  res.status(201).json({
    purchase_id: purchaseId,
    receipt_number: receiptNumber,
    total_cents,
    down_payment_cents: downPaymentCents,
    down_payment_pct: downPaymentPct,
    financed_cents: financedCents,
    installments_count: installments,
    status: 'ACTIVE_ON_TIME',
    openpay: { charge_id: openpayChargeId, down_payment_status: openpayChargeId ? 'pending_confirmation' : 'pending' },
    message: `¡Compra creada! Cuota inicial S/ ${(downPaymentCents / 100).toFixed(2)} procesada. Tu mercadería está en camino.`
  });
});

// PRD 09: Compra activa en curso
creditRouter.get('/purchases/active', async (req, res) => {
  const merchant = await getMerchantProfile(req);

  let purchase = await db.prepare(`
    SELECT p.*, prov.legal_name as provider_name, prov.whatsapp, loc.address_line, loc.district, loc.city
    FROM credit_purchases p
    LEFT JOIN provider_profiles prov ON p.provider_id = prov.id
    LEFT JOIN provider_locations loc ON prov.id = loc.provider_id AND loc.is_primary = 1
    WHERE p.merchant_id = ? AND p.status IN ('ACTIVE_ON_TIME', 'ACTIVE_OVERDUE')
    ORDER BY p.issued_at DESC
    LIMIT 1
  `).get(merchant.id) as any;

  // Sin compra activa (nunca se muestra una ya liquidada como "En curso").
  if (!purchase) return res.json(null);

  const installments = await db.prepare(`
    SELECT * FROM installments WHERE purchase_id = ? ORDER BY number ASC
  `).all(purchase.id) as any[];

  const paidCount = installments.filter(i => i.status === 'PAID').length;
  const paidCents = installments.filter(i => i.status === 'PAID').reduce((sum, i) => sum + i.principal_cents, 0);
  const totalAmortizedCents = purchase.down_payment_cents + paidCents;
  const amortizedPct = Math.min(100, Math.round((totalAmortizedCents * 100) / purchase.total_cents));

  const nextInstallment = installments.find(i => i.status === 'PENDING') || (installments.length > 0 ? installments[installments.length - 1] : null);

  res.json({
    id: purchase.id,
    plan: purchase.plan_code === 'KUOTA_3X' ? 'Plan 3X' : (purchase.plan_code || 'Plan 3X'),
    status: purchase.status,
    provider: resolveProviderInfo(purchase),
    total_cents: purchase.total_cents,
    down_payment_cents: purchase.down_payment_cents,
    down_payment_pct: purchase.down_payment_pct,
    financed_cents: purchase.financed_cents,
    installments_count: purchase.installments_count,
    amortized_pct: amortizedPct,
    installments,
    next_installment: nextInstallment ? {
      id: nextInstallment.id,
      number: nextInstallment.number,
      total: purchase.installments_count,
      due_date: nextInstallment.due_date,
      amount_cents: nextInstallment.amount_cents
    } : null,
    receipt_number: purchase.receipt_number,
    issued_at: purchase.issued_at
  });
});

// PRD 09: Pagar cuota (solo del comercio de la petición; atómico e idempotente)
creditRouter.post('/installments/:id/pay', async (req, res) => {
  if (!config.sandboxEnabled) return paymentNotConfirmable(res);
  const merchant = await getMerchantProfile(req);
  const installmentId = req.params.id;
  const inst = await db.prepare(`
    SELECT i.* FROM installments i JOIN credit_purchases p ON p.id = i.purchase_id
    WHERE i.id = ? AND p.merchant_id = ?
  `).get(installmentId, merchant.id) as any;
  if (!inst) return res.status(404).json({ error: { code: 'INSTALLMENT_NOT_FOUND', message: 'Cuota no encontrada.' } });
  if (inst.status === 'PAID') {
    return res.status(200).json({ success: true, already_paid: true, message: 'Esta cuota ya se encuentra pagada.' });
  }

  const result = await db.tx(async () => {
    const claimed = await db.prepare(`
      UPDATE installments SET status = 'PAID', paid_at = utc_now_text() WHERE id = ? AND status = 'PENDING'
    `).run(installmentId);
    if (claimed.changes === 0) return null;

    const purchase = await db.prepare('SELECT * FROM credit_purchases WHERE id = ?').get(inst.purchase_id) as any;
    const line = await db.prepare('SELECT * FROM credit_lines WHERE id = ?').get(purchase.line_id) as any;
    const newUsed = Math.max(0, line.used_cents - inst.principal_cents);
    const newConsecutive = (line.consecutive_on_time || 0) + 1;
    await db.prepare(`
      UPDATE credit_lines SET used_cents = ?, consecutive_on_time = ?, updated_at = utc_now_text() WHERE id = ?
    `).run(newUsed, newConsecutive, line.id);

    const pending = await db.prepare(`
      SELECT count(*) as count FROM installments WHERE purchase_id = ? AND status = 'PENDING'
    `).get(purchase.id) as any;
    const purchaseFinished = Number(pending.count) === 0;
    if (purchaseFinished) {
      await db.prepare(`UPDATE credit_purchases SET status = 'PAID', settled_at = utc_now_text() WHERE id = ?`).run(purchase.id);
    }

    await db.prepare(`
      INSERT INTO score_events (id, merchant_id, type, points, ref_id) VALUES (?, ?, 'ON_TIME_PAYMENT', 15, ?)
    `).run('sev_' + uuidv4().substring(0, 10), merchant.id, installmentId);
    await db.prepare('UPDATE credit_scores SET score = LEAST(850, score + 15) WHERE merchant_id = ?').run(merchant.id);
    return { line, newUsed, newConsecutive, purchaseFinished };
  });

  if (!result) return res.status(200).json({ success: true, already_paid: true, message: 'Esta cuota ya se encuentra pagada.' });
  res.json({
    success: true,
    installment_id: installmentId,
    amount_paid_cents: inst.amount_cents,
    credit_line_available_cents: Math.max(0, result.line.total_limit_cents - result.newUsed),
    consecutive_on_time: result.newConsecutive,
    purchase_settled: result.purchaseFinished,
    rule_3_2_freed: result.purchaseFinished
  });
});

// PRD 09: Liquidación anticipada (solo compras activas del comercio de la petición)
creditRouter.post('/purchases/:id/settle', async (req, res) => {
  if (!config.sandboxEnabled) return paymentNotConfirmable(res);
  const merchant = await getMerchantProfile(req);
  const purchaseId = req.params.id;
  const purchase = await db.prepare('SELECT * FROM credit_purchases WHERE id = ? AND merchant_id = ?').get(purchaseId, merchant.id) as any;
  if (!purchase) return res.status(404).json({ error: { code: 'PURCHASE_NOT_FOUND', message: 'Compra no encontrada.' } });
  if (purchase.status === 'PAID') {
    return res.status(200).json({ success: true, already_paid: true, purchase_id: purchaseId, status: 'PAID', message: 'Esta compra ya está liquidada.' });
  }

  const settled = await db.tx(async () => {
    const claimed = await db.prepare(`
      UPDATE credit_purchases SET status = 'PAID', settled_at = utc_now_text()
      WHERE id = ? AND status IN ('ACTIVE_ON_TIME', 'ACTIVE_OVERDUE')
    `).run(purchaseId);
    if (claimed.changes === 0) return false;
    // Se libera exactamente lo financiado menos el capital ya pagado (sin dejar centavos de redondeo).
    const paid = await db.prepare(`
      SELECT coalesce(sum(principal_cents), 0) AS principal FROM installments WHERE purchase_id = ? AND status = 'PAID'
    `).get(purchaseId) as any;
    const pend = { principal: Math.max(0, Number(purchase.financed_cents) - Number(paid.principal)) };
    await db.prepare(`
      UPDATE installments SET status = 'PAID', paid_at = utc_now_text() WHERE purchase_id = ? AND status = 'PENDING'
    `).run(purchaseId);
    await db.prepare(`
      UPDATE credit_lines SET used_cents = GREATEST(0, used_cents - ?), consecutive_on_time = consecutive_on_time + 1, updated_at = utc_now_text() WHERE id = ?
    `).run(Number(pend.principal), purchase.line_id);
    return true;
  });
  if (!settled) return res.status(200).json({ success: true, already_paid: true, purchase_id: purchaseId, status: 'PAID', message: 'Esta compra ya está liquidada.' });

  res.json({
    success: true,
    purchase_id: purchaseId,
    status: 'PAID',
    message: 'Compra liquidada anticipadamente con éxito. Regla 3.2 liberada para nuevas compras.'
  });
});

// GET /credit/score/me — Bloque 1: score calculado desde datos de la app
creditRouter.get('/score/me', async (req, res) => {
  const merchant = await getMerchantProfile(req);
  const breakdown = await computeScore(merchant.id);
  await persistScore(merchant.id, breakdown);
  res.json(breakdown);
});

// POST /scoring/signals — registra una señal de comportamiento
creditRouter.post('/scoring/signals', async (req, res) => {
  const merchant = await getMerchantProfile(req);
  const { type, ref_id, metadata } = req.body as { type: string; ref_id?: string; metadata?: Record<string, unknown> };
  if (!type) return res.status(400).json({ error: { code: 'MISSING_TYPE', message: 'El campo type es requerido.' } });

  const SIGNAL_POINTS: Record<string, number> = {
    NOTIFICATION_READ: 1,
    APP_OPEN: 0,
    SALE_REGISTERED: 2,
    LOCATION_SHARED: 3,
  };
  if (typeof type !== 'string' || !(type in SIGNAL_POINTS)) {
    return res.status(422).json({ error: { code: 'SIGNAL_INVALID', message: 'Tipo de señal no válido.' } });
  }
  const points = SIGNAL_POINTS[type];
  // Una señal con puntos se cuenta una sola vez por referencia: repetirla no infla el score.
  if (points > 0) {
    const refKey = typeof ref_id === 'string' ? ref_id.slice(0, 100) : null;
    const dup = await db.prepare('SELECT 1 FROM score_events WHERE merchant_id = ? AND type = ? AND ref_id IS NOT DISTINCT FROM ?').get(merchant.id, type, refKey);
    if (dup) return res.status(200).json({ type, points: 0, duplicate: true });
  }
  const eventId = 'sev_' + uuidv4().substring(0, 10);

  await db.prepare(`
    INSERT INTO score_events (id, merchant_id, type, points, ref_id)
    VALUES (?, ?, ?, ?, ?)
  `).run(eventId, merchant.id, type, points, ref_id ?? null);

  const breakdown = await computeScore(merchant.id);
  await persistScore(merchant.id, breakdown);

  res.status(201).json({ event_id: eventId, type, points, new_score: breakdown.total });
});
