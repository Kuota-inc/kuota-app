// Kuota Payments: links de cobro (PRD 08) con los controles del plan de seguridad:
// sesión ligada al dispositivo, dueño verificado en cada operación, monto fijo
// firmado, vencimiento y uso único, límites por nivel, antifraude graduado,
// confirmación con PIN, idempotencia, eventos inmutables y bitácora.
import { Router } from 'express';
import { db } from '../db/database.js';
import { config } from '../security/config.js';
import { randomId, randomToken } from '../security/crypto.js';
import { audit } from '../security/audit.js';
import { consumeStepUp, getMerchant, requireMerchant, stepUpRequired } from '../security/auth.js';
import { alertMerchant, paymentEvent, requireFeature } from '../security/events.js';
import { idempotent, rateLimit } from '../security/guards.js';
import { clientIp, fail } from '../security/http.js';
import { checkLinkLimits } from '../security/limits.js';
import {
  getLinkById,
  getLinkByToken,
  linkSignatureValid,
  merchantPublicIdentity,
  ownerView,
  payUrl,
  publicCode,
  refreshStatus,
  signLink,
  tokenFromPublicCode
} from '../security/links.js';
import { evaluateRisk } from '../security/risk.js';
import { addHours, formatSoles, nowIso } from '../security/time.js';

export const paymentLinkRouter = Router();

const FEE_BPS = 100; // 1.00 %
const MIN_AMOUNT = 100; // S/ 1.00
const MAX_AMOUNT = 10_000_000; // S/ 100 000.00 (techo técnico; rigen los límites del comercio)

function parseAmount(v: unknown): number | null {
  return Number.isInteger(v) && (v as number) >= MIN_AMOUNT && (v as number) <= MAX_AMOUNT ? (v as number) : null;
}

/** Texto libre sin caracteres de control ni marcado, recortado. */
function cleanText(v: unknown, max: number): string | null {
  if (typeof v !== 'string') return null;
  const s = v.replace(/[\u0000-\u001f\u007f<>]/g, '').trim().slice(0, max);
  return s || null;
}

const fees = (amount: number) => {
  const fee = Math.ceil((amount * FEE_BPS) / 10_000);
  return { fee, net: amount - fee };
};

// PRD 08: cotización (sin efectos; no requiere sesión)
paymentLinkRouter.post('/quote', (req, res) => {
  const amount = parseAmount(req.body?.amount_cents);
  if (!amount) return fail(res, 422, 'AMOUNT_INVALID', 'Ingresa un monto desde S/ 1.00.');
  const { fee, net } = fees(amount);
  res.json({
    amount_cents: amount,
    fee_cents: fee,
    fee_pct: FEE_BPS / 100,
    net_cents: net,
    estimated_points: Math.max(1, Math.floor(amount / 1000))
  });
});

// El endpoint anterior aceptaba pagos sin firma: queda retirado.
paymentLinkRouter.post('/webhook', (_req, res) =>
  fail(res, 410, 'ENDPOINT_RETIRED', 'Los pagos se notifican solo por el webhook firmado de 360pay (/api/v1/webhooks/360pay).')
);

// Consulta pública del link (pantalla previa al pago). Código con MAC: los
// códigos inventados se rechazan sin consultar la base.
paymentLinkRouter.get(
  '/public/:code',
  rateLimit({ name: 'public-link', windowMs: 60_000, max: 30 }),
  requireFeature('PUBLIC_PAY'),
  (req, res) => {
    const notFound = () => fail(res, 404, 'LINK_NOT_FOUND', 'Este link de pago no existe o caducó.');
    const token = tokenFromPublicCode(req.params.code);
    if (!token) return notFound();
    const found = getLinkByToken(token);
    if (!found) return notFound();
    if (!linkSignatureValid(found)) {
      paymentEvent(found.id, 'TAMPER_DETECTED', { via: 'public_view' });
      audit({ actorType: 'PAYER', action: 'LINK_TAMPER_DETECTED', target: found.id, result: 'DENIED', ip: clientIp(req) });
      return notFound();
    }
    const link = refreshStatus(found);
    if (link.status === 'PAID') return fail(res, 409, 'LINK_ALREADY_PAID', 'Este cobro ya fue pagado.');
    if (link.status !== 'ACTIVE') return fail(res, 410, 'LINK_UNAVAILABLE', 'Este link de pago ya no está disponible.');
    const merchant = getMerchant(link.merchant_id);
    res.json({
      code: publicCode(link.token),
      merchant: merchantPublicIdentity(merchant ?? { business_name: null, kyc_status: null, ruc: null, city: null }),
      concept: link.concept,
      amount_cents: link.amount_cents,
      currency: link.currency ?? 'PEN',
      expires_at: link.expires_at
    });
  }
);

// ---------------------------------------------------------- rutas del comercio
paymentLinkRouter.use(requireMerchant);

// PRD 08: crear link (borrador). Límites, antifraude y PIN antes de crear.
paymentLinkRouter.post('/', requireFeature('LINK_CREATE'), idempotent, (req, res) => {
  const auth = req.auth!;
  const merchant = getMerchant(auth.merchantId);
  if (!merchant) return fail(res, 404, 'MERCHANT_NOT_FOUND', 'Comercio no encontrado.');
  const amount = parseAmount(req.body?.amount_cents);
  if (!amount) return fail(res, 422, 'AMOUNT_INVALID', 'Ingresa un monto desde S/ 1.00.');
  const concept = cleanText(req.body?.concept, 80) ?? 'Cobro Kuota';
  const productId = cleanText(req.body?.product_id, 40);
  const quantity = Number.isInteger(req.body?.quantity) && req.body.quantity > 0 && req.body.quantity <= 999 ? req.body.quantity : 1;
  const ip = clientIp(req);

  const { problem, limits } = checkLinkLimits(merchant, auth.deviceId, amount);
  if (problem) {
    audit({ actorType: 'MERCHANT', actorId: merchant.id, action: 'LINK_CREATE', result: 'DENIED', ip, deviceId: auth.deviceId, details: { reason: problem.code, amount_cents: amount } });
    return fail(res, 422, problem.code, problem.message, { limits });
  }

  const risk = evaluateRisk({ kind: 'LINK_CREATE', merchant, deviceId: auth.deviceId, ip, amountCents: amount, limits });
  if (risk.decision === 'BLOCK') {
    audit({ actorType: 'MERCHANT', actorId: merchant.id, action: 'LINK_CREATE', result: 'DENIED', ip, deviceId: auth.deviceId, details: { risk_decision_id: risk.id } });
    // Sin detallar la regla: no se le enseña al atacante qué evitar.
    return fail(res, 403, 'RISK_BLOCKED', 'No pudimos crear este cobro. Si crees que es un error, escríbenos por el WhatsApp oficial de Kuota.');
  }
  let consentId: string | null = null;
  if (risk.decision === 'STEP_UP') {
    consentId = consumeStepUp(req, 'CREATE_LINK', { amount_cents: amount });
    if (!consentId) return stepUpRequired(res, 'CREATE_LINK', { amount_cents: amount }, risk.reasons[0]?.rule);
  }

  const { fee, net } = fees(amount);
  const fields = {
    id: randomId('lnk', 8),
    merchant_id: merchant.id,
    token: randomToken(16),
    amount_cents: amount,
    fee_cents: fee,
    net_cents: net,
    currency: 'PEN',
    expires_at: addHours(new Date(), config.linkTtlHours).toISOString()
  };
  const status = risk.decision === 'REVIEW' ? 'ON_HOLD' : 'DRAFT';

  db.transaction(() => {
    db.prepare(`
      INSERT INTO payment_links (id, merchant_id, token, amount_cents, fee_cents, net_cents, fee_bps, currency, concept, product_id,
                                 quantity, status, expires_at, sig, device_id, risk_decision_id)
      VALUES (@id, @merchant_id, @token, @amount_cents, @fee_cents, @net_cents, ${FEE_BPS}, @currency, @concept, @product_id,
              @quantity, @status, @expires_at, @sig, @device_id, @risk_decision_id)
    `).run({ ...fields, concept, product_id: productId, quantity, status, sig: signLink(fields), device_id: auth.deviceId, risk_decision_id: risk.id });
    paymentEvent(fields.id, 'CREATED', { amount_cents: amount, risk: risk.decision, consent_id: consentId });
    if (status === 'ON_HOLD') {
      db.prepare('INSERT INTO risk_reviews (link_id, decision_id, merchant_id, opened_at) VALUES (?, ?, ?, ?)').run(fields.id, risk.id, merchant.id, nowIso());
      paymentEvent(fields.id, 'HELD_FOR_REVIEW', { reasons: risk.reasons.map((r) => r.rule) });
      alertMerchant(merchant.id, 'LINK_HELD', `Revisamos tu cobro de ${formatSoles(amount)}`, 'Por seguridad lo validamos antes de activarlo. Te avisaremos en minutos.', fields.id);
    }
    audit({
      actorType: 'MERCHANT',
      actorId: merchant.id,
      action: 'LINK_CREATED',
      target: fields.id,
      result: 'OK',
      ip,
      deviceId: auth.deviceId,
      details: { amount_cents: amount, status, risk_decision_id: risk.id, consent_id: consentId }
    });
  })();

  res.status(201).json({
    ...ownerView(getLinkById(fields.id)!),
    risk: { decision: risk.decision === 'STEP_UP' ? 'APPROVE' : risk.decision }
  });
});

/** Link del comercio autenticado; para otro comercio responde como inexistente. */
function ownedLink(id: string, merchantId: string) {
  const link = getLinkById(id);
  return link && link.merchant_id === merchantId ? link : null;
}

paymentLinkRouter.get('/', (req, res) => {
  const rows = db
    .prepare('SELECT * FROM payment_links WHERE merchant_id = ? ORDER BY created_at DESC LIMIT 20')
    .all(req.auth!.merchantId) as Parameters<typeof ownerView>[0][];
  res.json({ data: rows.map(ownerView) });
});

paymentLinkRouter.get('/:id', (req, res) => {
  const link = ownedLink(req.params.id, req.auth!.merchantId);
  if (!link) return fail(res, 404, 'LINK_NOT_FOUND', 'Link no encontrado.');
  res.json(ownerView(link));
});

// PRD 08: datos del cliente (solo en borrador y solo el dueño)
paymentLinkRouter.patch('/:id/customer', (req, res) => {
  const link = ownedLink(req.params.id, req.auth!.merchantId);
  if (!link) return fail(res, 404, 'LINK_NOT_FOUND', 'Link no encontrado.');
  if (refreshStatus(link).status !== 'DRAFT') return fail(res, 409, 'LINK_NOT_EDITABLE', 'Solo se editan links en borrador.');
  const name = cleanText(req.body?.customer_name, 80);
  const phone = typeof req.body?.customer_phone === 'string' ? req.body.customer_phone.replace(/[\s-]/g, '') : null;
  const email = typeof req.body?.customer_email === 'string' ? req.body.customer_email.trim().toLowerCase() : null;
  if (phone && !/^\+?\d{9,12}$/.test(phone)) return fail(res, 422, 'PHONE_INVALID', 'Teléfono inválido.');
  if (email && (email.length > 120 || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))) return fail(res, 422, 'EMAIL_INVALID', 'Correo inválido.');
  db.prepare('UPDATE payment_links SET customer_name = ?, customer_phone = ?, customer_email = ? WHERE id = ?').run(name, phone, email, link.id);
  res.json({ success: true, id: link.id });
});

// PRD 08: emitir (activar). Repetirlo sobre un link activo devuelve lo mismo.
paymentLinkRouter.post('/:id/issue', (req, res) => {
  const auth = req.auth!;
  const found = ownedLink(req.params.id, auth.merchantId);
  if (!found) return fail(res, 404, 'LINK_NOT_FOUND', 'Link no encontrado.');
  if (!linkSignatureValid(found)) return fail(res, 409, 'LINK_INVALID', 'Este link no es válido. Genera uno nuevo.');
  const link = refreshStatus(found);
  if (link.status === 'ON_HOLD') {
    return fail(res, 409, 'LINK_ON_HOLD', 'Este cobro está en revisión de seguridad. Te avisaremos cuando se active.');
  }
  if (link.status === 'DRAFT') {
    db.prepare("UPDATE payment_links SET status = 'ACTIVE', issued_at = ? WHERE id = ? AND status = 'DRAFT'").run(nowIso(), link.id);
    paymentEvent(link.id, 'ISSUED');
    audit({ actorType: 'MERCHANT', actorId: auth.merchantId, action: 'LINK_ISSUED', target: link.id, result: 'OK', ip: clientIp(req), deviceId: auth.deviceId });
    alertMerchant(auth.merchantId, 'LINK_CREATED', `Generaste un link de cobro por ${formatSoles(link.amount_cents)}`, 'Si no fuiste tú, cancélalo y cambia tu PIN.', link.id);
  } else if (link.status !== 'ACTIVE') {
    return fail(res, 409, 'LINK_UNAVAILABLE', `Este link está ${link.status === 'PAID' ? 'pagado' : 'cerrado'}.`);
  }
  const fresh = getLinkById(link.id)!;
  res.json({ ...ownerView(fresh), url: payUrl(fresh.token), code: publicCode(fresh.token) });
});

paymentLinkRouter.post('/:id/cancel', (req, res) => {
  const auth = req.auth!;
  const found = ownedLink(req.params.id, auth.merchantId);
  if (!found) return fail(res, 404, 'LINK_NOT_FOUND', 'Link no encontrado.');
  const link = refreshStatus(found);
  if (link.status === 'CANCELLED') return res.json(ownerView(link));
  if (!['DRAFT', 'ACTIVE', 'ON_HOLD'].includes(link.status)) {
    return fail(res, 409, 'LINK_NOT_CANCELLABLE', link.status === 'PAID' ? 'Un cobro pagado no se cancela; solicita un reembolso.' : 'Este link ya está cerrado.');
  }
  db.prepare("UPDATE payment_links SET status = 'CANCELLED', cancelled_at = ? WHERE id = ? AND status IN ('DRAFT', 'ACTIVE', 'ON_HOLD')").run(nowIso(), link.id);
  paymentEvent(link.id, 'CANCELLED', { by: 'MERCHANT' });
  audit({ actorType: 'MERCHANT', actorId: auth.merchantId, action: 'LINK_CANCELLED', target: link.id, result: 'OK', ip: clientIp(req), deviceId: auth.deviceId });
  res.json(ownerView(getLinkById(link.id)!));
});
