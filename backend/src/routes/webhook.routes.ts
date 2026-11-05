// Entrada de webhooks de 360pay y simulador del pago del cliente (solo desarrollo).
import { Router } from 'express';
import { config } from '../security/config.js';
import { randomId, randomToken, sha256Hex } from '../security/crypto.js';
import { audit } from '../security/audit.js';
import { getMerchant } from '../security/auth.js';
import { requireFeature } from '../security/events.js';
import { rateLimit } from '../security/guards.js';
import { clientIp, fail, headerString } from '../security/http.js';
import { getLinkByToken, publicCode, refreshStatus, tokenFromPublicCode } from '../security/links.js';
import { evaluateRisk } from '../security/risk.js';
import { handleGatewayWebhook, signWebhookBody } from '../security/webhook.js';
import { paymentsDb as db } from '../db/client.js';
import { nowIso } from '../security/time.js';

export const webhookRouter = Router();
export const sandboxRouter = Router();

webhookRouter.post('/360pay', rateLimit({ name: 'webhook', windowMs: 60_000, max: 600 }), async (req, res) => {
  if (!req.rawBody) return fail(res, 415, 'JSON_REQUIRED', 'Se espera un cuerpo application/json.');
  const result = await handleGatewayWebhook({
    rawBody: req.rawBody,
    signature: headerString(req, 'x-signature-256'),
    timestamp: headerString(req, 'x-360pay-timestamp'),
    eventId: headerString(req, 'x-360pay-event-id'),
    ip: clientIp(req)
  });
  res.status(result.status).json(result.body);
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

    const event = {
      type: outcome === 'reject' ? 'payment_rejected' : 'payment_captured',
      payment: {
        reference: publicCode(link.token),
        amount_minor: link.amount_cents,
        currency: link.currency ?? 'PEN',
        method,
        gateway_ref: `GW-${randomToken(9)}`,
        payer_fingerprint: payer,
        ...(outcome === 'reject' ? { reason: 'INSUFFICIENT_FUNDS' } : {})
      }
    };
    const raw = JSON.stringify(event);
    const ts = String(Math.floor(Date.now() / 1000));
    const result = await handleGatewayWebhook({
      rawBody: raw,
      signature: signWebhookBody(raw, ts),
      timestamp: ts,
      eventId: `evt_${randomToken(12)}`,
      ip
    });
    res.status(result.status).json({ sandbox: true, webhook: result.body });
  }
);
