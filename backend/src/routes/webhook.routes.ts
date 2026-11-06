// Entrada de webhooks de 360pay y simulador del pago del cliente (solo desarrollo).
import { Router } from 'express';
import { config } from '../security/config.js';
import { randomId, randomToken, sha256Hex } from '../security/crypto.js';
import { audit } from '../security/audit.js';
import { getMerchant } from '../security/auth.js';
import { alertMerchant, requireFeature } from '../security/events.js';
import { rateLimit } from '../security/guards.js';
import { clientIp, fail, headerString } from '../security/http.js';
import { getLinkByToken, publicCode, refreshStatus, tokenFromPublicCode } from '../security/links.js';
import { evaluateRisk } from '../security/risk.js';
import { handleGatewayWebhook, signWebhookBody } from '../security/webhook.js';
import { paymentsDb as db, db as coreDb } from '../db/client.js';
import { verifyDiditWebhook } from '../integrations/didit.js';
import { createOpenpayCharge, verifyOpenpaySignature } from '../integrations/openpay.js';
import { applyDecision } from '../services/kyc.service.js';
import { formatSoles, nowIso } from '../security/time.js';

export const webhookRouter = Router();
export const sandboxRouter = Router();

webhookRouter.post('/360pay', rateLimit({ name: 'webhook', windowMs: 60_000, max: 600 }), async (req, res) => {
  if (!req.rawBody) return fail(res, 415, 'JSON_REQUIRED', 'Se espera un cuerpo application/json.');
  const result = await handleGatewayWebhook({
    rawBody: req.rawBody,
    signature: headerString(req, 'x-360pay-signature'),
    timestamp: headerString(req, 'x-360pay-timestamp'),
    eventId: headerString(req, 'x-360pay-event-id'),
    hookId: headerString(req, 'x-360pay-hook-id'),
    ip: clientIp(req)
  });
  res.status(result.status).json(result.body);
});

// Webhook de Didit (decisión de la verificación de identidad).
webhookRouter.post('/didit', rateLimit({ name: 'webhook-didit', windowMs: 60_000, max: 300 }), async (req, res) => {
  const raw = req.rawBody?.toString('utf8') ?? '';
  const headers = {
    'x-timestamp': headerString(req, 'x-timestamp'),
    'x-signature': headerString(req, 'x-signature'),
    'x-signature-v2': headerString(req, 'x-signature-v2'),
    'x-signature-previous': headerString(req, 'x-signature-previous'),
    'x-signature-v2-previous': headerString(req, 'x-signature-v2-previous')
  };
  if (!raw || !verifyDiditWebhook(raw, headers)) {
    await audit({ actorType: 'GATEWAY', actorId: 'didit', action: 'KYC_WEBHOOK_REJECTED', result: 'DENIED', ip: clientIp(req) });
    return fail(res, 401, 'INVALID_SIGNATURE', 'Firma inválida.');
  }
  const body = req.body ?? {};
  const eventId = typeof body.event_id === 'string' ? body.event_id : `${body.session_id}:${body.status}:${body.timestamp}`;
  // Didit reintenta con el mismo event_id: se procesa una sola vez.
  const fresh = await coreDb.run(
    'INSERT INTO kyc_webhook_events (event_id, session_id, status, received_at) VALUES (?, ?, ?, ?) ON CONFLICT (event_id) DO NOTHING',
    eventId,
    body.session_id ?? null,
    body.status ?? null,
    nowIso()
  );
  if (fresh.changes === 0) return res.json({ received: true, duplicate: true });
  if (body.webhook_type && body.webhook_type !== 'status.updated') return res.json({ received: true, ignored: body.webhook_type });
  const result = typeof body.session_id === 'string' && typeof body.status === 'string' ? await applyDecision(body.session_id, body.status, body.decision ?? null) : null;
  await audit({ actorType: 'GATEWAY', actorId: 'didit', action: 'KYC_DECISION', target: result?.publicId ?? null, result: 'OK', ip: clientIp(req), details: { status: body.status, outcome: result?.outcome ?? null, reason: result?.reason ?? null } });
  res.json({ received: true, outcome: result?.outcome ?? null });
});

/**
 * Simula la página de pago alojada de 360pay: evalúa el riesgo del intento y
 * entrega a Kuota un webhook firmado, por la misma ruta de verificación que en
 * producción. Deshabilitado en producción (NODE_ENV=production o KUOTA_SANDBOX=0).
 */
sandboxRouter.post(
  '/360pay/pay',
  rateLimit({ name: 'sandbox-pay', windowMs: 60_000, max: 30 }),
  requireFeature('PUBLIC_PAY'),
  async (req, res) => {
    if (!config.sandboxEnabled) return fail(res, 404, 'NOT_FOUND', 'No disponible.');
    const ip = clientIp(req);
    const token = tokenFromPublicCode(req.body?.code);
    const link = token ? await getLinkByToken(token) : null;
    if (!link) return fail(res, 404, 'LINK_NOT_FOUND', 'Este link de pago no existe o caducó.');
    const current = await refreshStatus(link);
    if (current.status !== 'ACTIVE') {
      return fail(res, current.status === 'PAID' ? 409 : 410, current.status === 'PAID' ? 'LINK_ALREADY_PAID' : 'LINK_UNAVAILABLE', current.status === 'PAID' ? 'Este cobro ya fue pagado.' : 'Este link de pago ya no está disponible.');
    }
    const method = ['YAPE', 'PLIN', 'CARD'].includes(req.body?.method) ? req.body.method : 'YAPE';
    const outcome = req.body?.outcome === 'reject' ? 'reject' : 'success';
    // Huella del pagador: en producción la calcula 360pay (dispositivo/tarjeta).
    const payer = sha256Hex(`${ip}|${headerString(req, 'user-agent') ?? ''}`).slice(0, 32);

    const merchant = (await getMerchant(link.merchant_id))!;
    const risk = await evaluateRisk({ kind: 'PAY_ATTEMPT', merchant, linkId: link.id, payerFingerprint: payer, ip });
    if (risk.decision === 'BLOCK') {
      await db.prepare('INSERT INTO payment_attempts (id, link_id, payer_fingerprint, result, reason, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(
        randomId('att', 8),
        link.id,
        payer,
        'BLOCKED',
        'RISK_BLOCKED',
        nowIso()
      );
      await audit({ actorType: 'PAYER', actorId: payer, action: 'PAY_ATTEMPT', target: link.id, result: 'DENIED', ip, details: { risk_decision_id: risk.id } });
      return fail(res, 403, 'RISK_BLOCKED', 'No pudimos procesar este pago. Inténtalo más tarde.');
    }

    if (outcome === 'reject') {
      // 360pay solo notifica pagos confirmados: un intento fallido queda registrado aquí.
      await db.prepare('INSERT INTO payment_attempts (id, link_id, payer_fingerprint, result, reason, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(
        randomId('att', 8),
        link.id,
        payer,
        'FAILED',
        'INSUFFICIENT_FUNDS',
        nowIso()
      );
      return res.json({ sandbox: true, webhook: { status: 'REJECTED', reason: 'INSUFFICIENT_FUNDS' } });
    }

    // Mismo formato y firma que el webhook PAYMENT_PAID real de 360pay.
    const items = [
      {
        event: 'ticket.paid',
        _id: link.pay360_coupon_id ?? `sbx${randomToken(12)}`,
        external_ref: link.id,
        payment_reference: link.pay360_coupon_code ?? publicCode(link.token),
        amount: link.amount_cents / 100,
        status: 'paid',
        paid_at: nowIso(),
        operation_number: `SBX-${randomToken(6)}`,
        bank_tx_id: 'SANDBOX',
        payment_method: method
      }
    ];
    const raw = JSON.stringify(items);
    const ts = new Date().toISOString();
    const result = await handleGatewayWebhook({
      rawBody: raw,
      signature: signWebhookBody(raw, ts),
      timestamp: ts,
      eventId: `evt_${randomToken(12)}`,
      hookId: process.env.KUOTA_360PAY_HOOK_ID,
      ip
    });
    const first = Array.isArray(result.body.results) ? (result.body.results[0] as Record<string, unknown>) : result.body;
    res.status(result.status).json({ sandbox: true, webhook: first });
  }
);

// ─── Openpay: conformidad del enganche ────────────────────────────────────────

/**
 * Webhook de Openpay (charge.succeeded / charge.failed).
 * Cuando Openpay confirma el cargo del enganche, registra la conformidad y
 * emite la alerta al comercio.
 */
webhookRouter.post('/openpay', rateLimit({ name: 'webhook-openpay', windowMs: 60_000, max: 300 }), async (req, res) => {
  const raw = req.rawBody?.toString('utf8') ?? '';
  if (!raw) return fail(res, 415, 'JSON_REQUIRED', 'Se espera un cuerpo application/json.');

  const signature = headerString(req, 'openpay-event-signature') ?? '';
  if (!verifyOpenpaySignature(raw, signature)) {
    await audit({ actorType: 'GATEWAY', actorId: 'openpay', action: 'OPENPAY_WEBHOOK_REJECTED', result: 'DENIED', ip: clientIp(req) });
    return fail(res, 401, 'INVALID_SIGNATURE', 'Firma Openpay inválida.');
  }

  let body: Record<string, unknown>;
  try { body = JSON.parse(raw); } catch { return fail(res, 400, 'INVALID_JSON', 'JSON inválido.'); }

  const eventId = typeof body.id === 'string' ? body.id : `op:${Date.now()}:${Math.random()}`;
  const eventType = typeof body.type === 'string' ? body.type : 'unknown';
  const tx = (body.transaction ?? body) as Record<string, unknown>;
  const chargeId = typeof tx.id === 'string' ? tx.id : null;
  const orderId = typeof tx.order_id === 'string' ? tx.order_id : null;

  // Idempotencia: at-least-once delivery de Openpay → se procesa una vez.
  const inserted = await db.run(
    `INSERT INTO openpay_webhook_events (event_id, type, charge_id, purchase_id, status)
     VALUES (?, ?, ?, ?, 'received')
     ON CONFLICT (event_id) DO NOTHING`,
    eventId, eventType, chargeId, orderId
  );
  if (!inserted.changes) return res.json({ received: true, duplicate: true });

  if (eventType === 'charge.succeeded' && orderId) {
    const purchase = await coreDb.get<{ id: string; merchant_id: string; down_payment_cents: number }>(
      "SELECT id, merchant_id, down_payment_cents FROM credit_purchases WHERE id = ? AND down_payment_status = 'PENDING'",
      orderId
    );
    if (purchase) {
      await coreDb.run(
        "UPDATE credit_purchases SET down_payment_status = 'CONFIRMED', openpay_charge_id = ? WHERE id = ?",
        chargeId, purchase.id
      );
      await coreDb.run(
        "INSERT INTO score_events (id, merchant_id, type, points, ref_id) VALUES (?, ?, 'DOWN_PAYMENT_CONFIRMED', 10, ?)",
        randomId('sev', 8), purchase.merchant_id, purchase.id
      );
      await coreDb.run(
        'UPDATE credit_scores SET score = LEAST(850, score + 10) WHERE merchant_id = ?',
        purchase.merchant_id
      );
      await alertMerchant(
        purchase.merchant_id,
        'PAYMENT_RECEIVED',
        'Conformidad registrada',
        `Openpay confirmó tu enganche de ${formatSoles(purchase.down_payment_cents)}. Tu crédito Kuota está activo.`,
        purchase.id
      );
      await audit({ actorType: 'GATEWAY', actorId: 'openpay', action: 'DOWN_PAYMENT_CONFIRMED', target: purchase.id, result: 'OK', ip: clientIp(req), details: { charge_id: chargeId, event_id: eventId } });
    }
  }

  res.json({ received: true, event_id: eventId, type: eventType });
});

/**
 * Simulador Openpay: dispara un charge.succeeded para el enganche de una compra.
 * Deshabilitado en producción.
 */
sandboxRouter.post(
  '/openpay/pay',
  rateLimit({ name: 'sandbox-openpay', windowMs: 60_000, max: 30 }),
  requireFeature('PUBLIC_PAY'),
  async (req, res) => {
    if (!config.sandboxEnabled) return fail(res, 404, 'NOT_FOUND', 'No disponible.');
    const { purchase_id } = req.body ?? {};
    if (!purchase_id) return fail(res, 422, 'MISSING_PURCHASE_ID', 'Falta purchase_id.');

    const purchase = await coreDb.get<{ id: string; merchant_id: string; down_payment_cents: number; down_payment_status: string }>(
      'SELECT id, merchant_id, down_payment_cents, down_payment_status FROM credit_purchases WHERE id = ?',
      purchase_id
    );
    if (!purchase) return fail(res, 404, 'PURCHASE_NOT_FOUND', 'Compra no encontrada.');
    if (purchase.down_payment_status === 'CONFIRMED') return fail(res, 409, 'ALREADY_CONFIRMED', 'El enganche ya fue confirmado.');

    const chargeId = `op_sbx_${randomToken(10)}`;
    const eventId = `evtsbx_${randomToken(12)}`;

    // Construir un payload Openpay realista y enviarlo al handler real.
    const payload = JSON.stringify({
      id: eventId,
      type: 'charge.succeeded',
      transaction: { id: chargeId, order_id: purchase.id, status: 'completed', amount: purchase.down_payment_cents / 100 }
    });

    // Invocar el handler directamente (sin firma en sandbox).
    const inserted = await db.run(
      `INSERT INTO openpay_webhook_events (event_id, type, charge_id, purchase_id, status)
       VALUES (?, 'charge.succeeded', ?, ?, 'received')
       ON CONFLICT (event_id) DO NOTHING`,
      eventId, chargeId, purchase.id
    );
    if (inserted.changes) {
      await coreDb.run(
        "UPDATE credit_purchases SET down_payment_status = 'CONFIRMED', openpay_charge_id = ? WHERE id = ?",
        chargeId, purchase.id
      );
      await coreDb.run(
        "INSERT INTO score_events (id, merchant_id, type, points, ref_id) VALUES (?, ?, 'DOWN_PAYMENT_CONFIRMED', 10, ?)",
        randomId('sev', 8), purchase.merchant_id, purchase.id
      );
      await coreDb.run(
        'UPDATE credit_scores SET score = LEAST(850, score + 10) WHERE merchant_id = ?',
        purchase.merchant_id
      );
      await alertMerchant(
        purchase.merchant_id,
        'PAYMENT_RECEIVED',
        'Conformidad registrada',
        `Openpay confirmó tu enganche de ${formatSoles(purchase.down_payment_cents)}. Tu crédito Kuota está activo.`,
        purchase.id
      );
    }

    res.json({ sandbox: true, event_id: eventId, charge_id: chargeId, purchase_id: purchase.id, payload: JSON.parse(payload) });
  }
);
