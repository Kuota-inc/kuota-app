// Webhooks de 360pay (https://api.360pay.pe/docs/webhooks), hook PAYMENT_PAID:
//   X-360Pay-Signature: sha256=<hex HMAC-SHA256(signing_secret, "<timestamp>.<cuerpo crudo>")>
//   X-360Pay-Timestamp: fecha ISO usada en la firma (ventana de 5 min contra repeticiones)
//   X-360Pay-Event-Id:  id estable del evento (entrega at-least-once: se procesa una vez)
//   X-360Pay-Hook-Id:   hook que lo envió (si se configura KUOTA_360PAY_HOOK_ID, debe coincidir)
//
// El cuerpo SIEMPRE es un array de cupones pagados:
//   [{ "event": "ticket.paid", "_id": "<cupón>", "external_ref": "<id del link>", "payment_reference": "…",
//      "amount": 50, "status": "paid", "paid_at": "…", "operation_number": "…", "bank_tx_id": "BCP" }]
// `amount` está en soles. KUOTA_WEBHOOK_SECRET es el signing_secret (whsec_…) del hook.
import { paymentsDb as db } from '../db/client.js';
import { config, secrets } from './config.js';
import { hmac, randomId, safeEqual, sha256Hex } from './crypto.js';
import { audit } from './audit.js';
import { alertMerchant, featureEnabled, paymentEvent } from './events.js';
import { getLinkById, getLinkByToken, linkSignatureValid, refreshStatus, tokenFromPublicCode, type LinkRow } from './links.js';
import { formatSoles, nowIso } from './time.js';
import { solesToCents } from '../integrations/pay360.js';

export const signWebhookBody = (rawBody: string, timestamp: string) =>
  `sha256=${hmac(secrets.webhookSecret, `${timestamp}.${rawBody}`)}`;

export interface WebhookInput {
  rawBody: Buffer | string;
  signature?: string;
  timestamp?: string;
  eventId?: string;
  hookId?: string;
  ip: string;
}

export interface WebhookResult {
  status: number;
  body: Record<string, unknown>;
}

const EVENT_ID = /^[A-Za-z0-9_.:-]{6,100}$/;
const GATEWAY_REF = /^[A-Za-z0-9_-]{6,64}$/;
const METHODS = new Set(['YAPE', 'PLIN', 'CARD', 'BANK']);

/** Cupón pagado tal como lo manda 360pay. */
export interface Pay360PaidItem {
  event?: unknown;
  _id?: unknown;
  external_ref?: unknown;
  payment_reference?: unknown;
  amount?: unknown;
  status?: unknown;
  paid_at?: unknown;
  operation_number?: unknown;
  bank_tx_id?: unknown;
  payment_method?: unknown; // solo lo envía el simulador local
}

/** Evento normalizado que procesa Kuota. */
interface NormalizedEvent {
  type: 'payment_captured' | 'payment_rejected' | 'unknown';
  payment: Record<string, unknown>;
}

function normalize(item: Pay360PaidItem): NormalizedEvent {
  const paid = item.status === 'paid' || item.event === 'ticket.paid';
  const amount = typeof item.amount === 'number' && Number.isFinite(item.amount) ? solesToCents(item.amount) : null;
  return {
    type: paid ? 'payment_captured' : 'unknown',
    payment: {
      link_id: typeof item.external_ref === 'string' ? item.external_ref : null,
      amount_minor: amount,
      currency: 'PEN',
      method: typeof item.payment_method === 'string' && METHODS.has(item.payment_method) ? item.payment_method : 'BANK',
      gateway_ref: typeof item._id === 'string' ? item._id : null,
      payment_reference: typeof item.payment_reference === 'string' ? item.payment_reference.slice(0, 64) : null,
      operation_number: typeof item.operation_number === 'string' ? item.operation_number.slice(0, 64) : null,
      bank: typeof item.bank_tx_id === 'string' ? item.bank_tx_id.slice(0, 32) : null
    }
  };
}

async function deny(status: number, code: string, message: string, ip: string, details: Record<string, unknown> = {}): Promise<WebhookResult> {
  await audit({ actorType: 'GATEWAY', actorId: '360pay', action: 'WEBHOOK_REJECTED', result: 'DENIED', ip, details: { code, ...details } });
  return { status, body: { error: { code, message } } };
}

export async function handleGatewayWebhook(input: WebhookInput): Promise<WebhookResult> {
  if (!(await featureEnabled('WEBHOOK_PROCESSING'))) {
    // 503: 360pay reintenta más tarde; no se pierde el evento.
    return { status: 503, body: { error: { code: 'FEATURE_DISABLED', message: 'Procesamiento de webhooks pausado.' } } };
  }
  const raw = typeof input.rawBody === 'string' ? input.rawBody : input.rawBody.toString('utf8');

  const ts = input.timestamp ?? '';
  const tsMs = Date.parse(ts);
  if (!ts || Number.isNaN(tsMs) || Math.abs(Date.now() - tsMs) > config.webhookToleranceSec * 1000) {
    return deny(401, 'STALE_OR_INVALID_TIMESTAMP', 'Firma fuera de la ventana temporal.', input.ip);
  }
  if (!input.signature || !safeEqual(input.signature, signWebhookBody(raw, ts))) {
    return deny(401, 'INVALID_SIGNATURE', 'Firma inválida.', input.ip);
  }
  const expectedHook = process.env.KUOTA_360PAY_HOOK_ID;
  if (expectedHook && input.hookId !== expectedHook) {
    return deny(401, 'UNKNOWN_HOOK', 'Hook no reconocido.', input.ip, { hook_id: input.hookId ?? null });
  }
  const eventId = input.eventId ?? '';
  if (!EVENT_ID.test(eventId)) return deny(400, 'EVENT_ID_REQUIRED', 'Falta X-360Pay-Event-Id.', input.ip);

  const payloadHash = sha256Hex(raw);
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = [];
  }
  const items = (Array.isArray(parsed) ? parsed : [parsed]).filter((x) => x && typeof x === 'object') as Pay360PaidItem[];
  if (!items.length || items.length > 200) return deny(400, 'INVALID_PAYLOAD', 'Se espera un array de cupones pagados.', input.ip);

  // Todo el evento en una transacción, serializado por id de evento: dos entregas
  // simultáneas del mismo evento no se procesan dos veces. Cada cupón del array
  // queda en webhook_events como "<eventId>:<nnn>".
  const itemId = (i: number) => `${eventId}:${String(i).padStart(3, '0')}`;
  const result = await db.tx(async () => {
    await db.lock(`webhook:${eventId}`);
    const prior = await db.all<{ payload_sha256: string; response_json: string }>(
      'SELECT payload_sha256, response_json FROM webhook_events WHERE event_id LIKE ? ORDER BY event_id',
      `${eventId}:%`
    );
    if (prior.length) {
      if (prior[0].payload_sha256 !== payloadHash) return 'REUSED' as const;
      return { status: 200, body: { received: true, event_id: eventId, duplicate: true, results: prior.map((r) => JSON.parse(r.response_json)) } };
    }
    const results: Record<string, unknown>[] = [];
    for (let i = 0; i < items.length; i++) {
      results.push((await processEvent(itemId(i), payloadHash, normalize(items[i]), input.ip)).body);
    }
    return { status: 200, body: { received: true, event_id: eventId, results } };
  });
  if (result === 'REUSED') {
    return deny(409, 'EVENT_ID_REUSED', 'El id de evento ya se usó con otro contenido.', input.ip, { event_id: eventId });
  }
  return result;
}

async function processEvent(
  eventId: string,
  payloadHash: string,
  event: NormalizedEvent,
  ip: string
): Promise<WebhookResult> {
  const p = event.payment ?? {};
  const type = event.type;
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

  // 360pay identifica el link por external_ref (= id del link); el simulador puede usar el código público.
  const token = p.link_id ? null : tokenFromPublicCode(p.reference);
  const found = typeof p.link_id === 'string' ? await getLinkById(p.link_id) : token ? await getLinkByToken(token) : null;
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
  `).run(
    paymentId,
    link.id,
    p.method,
    gatewayRef,
    link.amount_cents,
    JSON.stringify({ event_id: eventId, payload_sha256: payloadHash, payment_reference: p.payment_reference, operation_number: p.operation_number, bank: p.bank })
  );

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
