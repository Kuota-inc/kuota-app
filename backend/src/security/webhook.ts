// Webhooks de 360pay. Mismo esquema que el sandbox de 360pay (rail-go):
//   X-Signature-256:    sha256=<hex HMAC-SHA256(secreto, "<timestamp>.<cuerpo>")>
//   X-360pay-Timestamp: segundos Unix (ventana de 300 s contra repeticiones)
//   X-360pay-Event-ID:  id único del evento (idempotencia: se procesa una vez)
//
// Cuerpo: { "type": "payment_captured" | "payment_rejected",
//           "payment": { "reference": "<código público del link>", "amount_minor": 5000,
//                        "currency": "PEN", "method": "YAPE", "gateway_ref": "GW-…",
//                        "payer_fingerprint": "…" } }
import { paymentsDb as db } from '../db/client.js';
import { config, secrets } from './config.js';
import { hmac, randomId, safeEqual, sha256Hex } from './crypto.js';
import { audit } from './audit.js';
import { alertMerchant, featureEnabled, paymentEvent } from './events.js';
import { getLinkByToken, linkSignatureValid, refreshStatus, tokenFromPublicCode, type LinkRow } from './links.js';
import { formatSoles, nowIso } from './time.js';

export const signWebhookBody = (rawBody: string, timestamp: number | string) =>
  `sha256=${hmac(secrets.webhookSecret, `${timestamp}.${rawBody}`)}`;

export interface WebhookInput {
  rawBody: Buffer | string;
  signature?: string;
  timestamp?: string;
  eventId?: string;
  ip: string;
}

export interface WebhookResult {
  status: number;
  body: Record<string, unknown>;
}

const EVENT_ID = /^[A-Za-z0-9_.:-]{8,100}$/;
const GATEWAY_REF = /^[A-Za-z0-9_-]{6,64}$/;
const METHODS = new Set(['YAPE', 'PLIN', 'CARD']);

async function deny(status: number, code: string, message: string, ip: string, details: Record<string, unknown> = {}): Promise<WebhookResult> {
  await audit({ actorType: 'GATEWAY', actorId: '360pay', action: 'WEBHOOK_REJECTED', result: 'DENIED', ip, details: { code, ...details } });
  return { status, body: { error: { code, message } } };
}

export async function handleGatewayWebhook(input: WebhookInput): Promise<WebhookResult> {
  if (!await featureEnabled('WEBHOOK_PROCESSING')) {
    // 503: 360pay reintenta más tarde; no se pierde el evento.
    return { status: 503, body: { error: { code: 'FEATURE_DISABLED', message: 'Procesamiento de webhooks pausado.' } } };
  }
  const raw = typeof input.rawBody === 'string' ? input.rawBody : input.rawBody.toString('utf8');

  const ts = input.timestamp ?? '';
  if (!/^\d{1,12}$/.test(ts) || Math.abs(Date.now() / 1000 - Number(ts)) > config.webhookToleranceSec) {
    return deny(401, 'STALE_OR_INVALID_TIMESTAMP', 'Firma fuera de la ventana temporal.', input.ip);
  }
  if (!input.signature || !safeEqual(input.signature, signWebhookBody(raw, ts))) {
    return deny(401, 'INVALID_SIGNATURE', 'Firma inválida.', input.ip);
  }
  const eventId = input.eventId ?? '';
  if (!EVENT_ID.test(eventId)) return deny(400, 'EVENT_ID_REQUIRED', 'Falta X-360pay-Event-ID.', input.ip);

  const payloadHash = sha256Hex(raw);
  let event: { type?: unknown; payment?: Record<string, unknown> };
  try {
    event = JSON.parse(raw);
  } catch {
    event = {};
  }

  // Todo el evento en una transacción, serializado por id de evento: dos entregas
  // simultáneas del mismo evento no se procesan dos veces.
  const result = await db.tx(async () => {
    await db.lock(`webhook:${eventId}`);
    const prior = await db.get<{ payload_sha256: string; response_json: string }>(
      'SELECT payload_sha256, response_json FROM webhook_events WHERE event_id = ?',
      eventId
    );
    if (prior) {
      if (prior.payload_sha256 !== payloadHash) return 'REUSED' as const;
      return { status: 200, body: { ...JSON.parse(prior.response_json), duplicate: true } };
    }
    return processEvent(eventId, payloadHash, event, input.ip);
  });
  if (result === 'REUSED') {
    return deny(409, 'EVENT_ID_REUSED', 'El id de evento ya se usó con otro contenido.', input.ip, { event_id: eventId });
  }
  return result;
}

async function processEvent(
  eventId: string,
  payloadHash: string,
  event: { type?: unknown; payment?: Record<string, unknown> },
  ip: string
): Promise<WebhookResult> {
  const p = event.payment ?? {};
  const type = typeof event.type === 'string' ? event.type : 'unknown';
  const amount = Number.isInteger(p.amount_minor) ? (p.amount_minor as number) : null;
  const gatewayRef = typeof p.gateway_ref === 'string' && GATEWAY_REF.test(p.gateway_ref) ? p.gateway_ref : null;

  const record = async (status: 'PROCESSED' | 'REJECTED' | 'IGNORED', reason: string | null, link: LinkRow | null, extra: Record<string, unknown> = {}) => {
    const response = { received: true, event_id: eventId, status, reason, ...extra };
    await db.prepare(`
      INSERT INTO webhook_events (event_id, type, status, reason, link_id, gateway_ref, amount_minor, payload_sha256, response_json, received_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(eventId, type, status, reason, link?.id ?? null, gatewayRef, amount, payloadHash, JSON.stringify(response), nowIso());
    if (status !== 'PROCESSED') {
      await audit({ actorType: 'GATEWAY', actorId: '360pay', action: 'WEBHOOK_EVENT', target: link?.id ?? null, result: 'DENIED', ip, details: { event_id: eventId, status, reason } });
    }
    return { status: 200, body: response };
  };

  if (type !== 'payment_captured' && type !== 'payment_rejected') return record('IGNORED', 'UNSUPPORTED_TYPE', null);

  const token = tokenFromPublicCode(p.reference);
  const found = token ? await getLinkByToken(token) : null;
  if (!found) return record('REJECTED', 'UNKNOWN_LINK', null);
  if (!linkSignatureValid(found)) {
    await paymentEvent(found.id, 'TAMPER_DETECTED', { event_id: eventId });
    await alertMerchant(found.merchant_id, 'SECURITY', 'Bloqueamos un cobro con datos alterados', 'Nuestro equipo lo está revisando. No necesitas hacer nada.', found.id);
    return record('REJECTED', 'LINK_TAMPERED', found);
  }

  const payer = typeof p.payer_fingerprint === 'string' ? p.payer_fingerprint.slice(0, 64) : null;
  const attempt = (result: 'SUCCESS' | 'FAILED', reason: string | null) =>
    db.prepare('INSERT INTO payment_attempts (id, link_id, payer_fingerprint, result, reason, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(
      randomId('att', 8),
      found.id,
      payer,
      result,
      reason,
      nowIso()
    );

  if (type === 'payment_rejected') {
    await attempt('FAILED', typeof p.reason === 'string' ? p.reason.slice(0, 60) : 'REJECTED');
    await paymentEvent(found.id, 'PAYMENT_REJECTED', { event_id: eventId });
    return record('PROCESSED', 'PAYMENT_REJECTED', found);
  }

  if (!gatewayRef || !METHODS.has(String(p.method))) return record('REJECTED', 'INVALID_PAYLOAD', found);
  if (await db.prepare('SELECT 1 FROM payments WHERE gateway_ref = ?').get(gatewayRef)) return record('IGNORED', 'DUPLICATE_GATEWAY_REF', found);

  const link = await refreshStatus(found);
  if (link.status === 'PAID') {
    // Segundo cobro sobre un link de uso único: excepción de conciliación (devolver).
    return record('REJECTED', 'ALREADY_PAID', link);
  }
  if (link.status !== 'ACTIVE') return record('REJECTED', `LINK_${link.status}`, link);
  if (amount !== link.amount_cents || p.currency !== (link.currency ?? 'PEN')) {
    await alertMerchant(link.merchant_id, 'SECURITY', 'Rechazamos un pago con monto distinto al del link', `El link era por ${formatSoles(link.amount_cents)}.`, link.id);
    return record('REJECTED', 'AMOUNT_MISMATCH', link, { expected_minor: link.amount_cents });
  }

  const paidAt = nowIso();
  const updated = (await db
    .prepare("UPDATE payment_links SET status = 'PAID', paid_at = ?, gateway_ref = ? WHERE id = ? AND status = 'ACTIVE'")
    .run(paidAt, gatewayRef, link.id)).changes;
  if (updated !== 1) return record('REJECTED', 'LINK_NOT_ACTIVE', link);

  const paymentId = randomId('pay', 10);
  await db.prepare(`
    INSERT INTO payments (id, payment_link_id, method, gateway_ref, amount_cents, status, raw_webhook_json)
    VALUES (?, ?, ?, ?, ?, 'SUCCESS', ?)
  `).run(paymentId, link.id, p.method, gatewayRef, link.amount_cents, JSON.stringify({ event_id: eventId, payload_sha256: payloadHash }));

  // Doble partida: entra el cobro bruto; se reparte en abono neto al comercio y comisión.
  const ledger = db.prepare('INSERT INTO ledger_entries (id, payment_id, account, type, amount_cents, description) VALUES (?, ?, ?, ?, ?, ?)');
  await ledger.run(randomId('led', 8), paymentId, 'GATEWAY_CLEARING', 'DEBIT', link.amount_cents, 'Cobro ingresado');
  await ledger.run(randomId('led', 8), paymentId, 'MERCHANT_WALLET', 'CREDIT', link.net_cents, 'Abono neto a comercio');
  await ledger.run(randomId('led', 8), paymentId, 'KUOTA_FEE_REVENUE', 'CREDIT', link.fee_cents, `Comisión ${(link.fee_bps / 100).toFixed(2)}%`);

  const saleId = randomId('sale', 8);
  await db.prepare(`
    INSERT INTO sales (id, merchant_id, source, amount_cents, concept, operation_ref, verified, occurred_at)
    VALUES (?, ?, 'PAYMENT_LINK', ?, ?, ?, 1, utc_now_text())
  `).run(saleId, link.merchant_id, link.amount_cents, link.concept, gatewayRef);

  const points = Math.max(5, Math.floor(link.amount_cents / 1000));
  await db.prepare("INSERT INTO score_events (id, merchant_id, type, points, ref_id) VALUES (?, ?, 'VERIFIED_SALE', ?, ?)").run(
    randomId('sev', 8),
    link.merchant_id,
    points,
    saleId
  );
  await db.prepare('UPDATE credit_scores SET score = LEAST(850, score + ?) WHERE merchant_id = ?').run(points, link.merchant_id);

  await attempt('SUCCESS', null);
  await paymentEvent(link.id, 'PAID', { payment_id: paymentId, gateway_ref: gatewayRef, method: p.method, event_id: eventId });
  await audit({ actorType: 'GATEWAY', actorId: '360pay', action: 'PAYMENT_CAPTURED', target: link.id, result: 'OK', ip, details: { payment_id: paymentId, amount_minor: amount, event_id: eventId } });
  await alertMerchant(link.merchant_id, 'PAYMENT_RECEIVED', `Recibiste ${formatSoles(link.amount_cents)}`, `${link.concept ?? 'Cobro Kuota'} · abono neto ${formatSoles(link.net_cents)}.`, link.id);

  return record('PROCESSED', null, link, {
    payment_id: paymentId,
    link_id: link.id,
    net_credited_cents: link.net_cents,
    fee_charged_cents: link.fee_cents,
    points_awarded: points
  });
}
