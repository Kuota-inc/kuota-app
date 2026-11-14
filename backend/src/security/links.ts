// Links de cobro firmados.
//
// - Token opaco de 128 bits (no predecible ni enumerable).
// - La URL pública lleva además un MAC corto: un código inventado se rechaza
//   antes de tocar la base (anti-enumeración).
// - La fila guarda una firma HMAC de titular, monto, moneda y vencimiento: si
//   alguien altera el monto en la base, el link deja de ser pagable.
import { paymentsDb as db } from '../db/client.js';
import { config, secrets } from './config.js';
import { hmac, safeEqual } from './crypto.js';
import { paymentEvent } from './events.js';

export interface LinkRow {
  id: string;
  merchant_id: string;
  token: string;
  amount_cents: number;
  fee_cents: number;
  net_cents: number;
  fee_bps: number;
  currency: string | null;
  concept: string | null;
  product_id: string | null;
  quantity: number | null;
  customer_name: string | null;
  customer_phone: string | null;
  customer_email: string | null;
  status: string;
  expires_at: string;
  paid_at: string | null;
  gateway_ref: string | null;
  sig: string | null;
  device_id: string | null;
  issued_at: string | null;
  cancelled_at: string | null;
  settled_at: string | null;
  risk_decision_id: string | null;
  pay360_coupon_id: string | null;
  pay360_coupon_code: string | null;
  created_at: string;
}

type SignedFields = Pick<LinkRow, 'id' | 'merchant_id' | 'token' | 'amount_cents' | 'fee_cents' | 'net_cents' | 'currency' | 'expires_at'>;

export function signLink(l: SignedFields): string {
  return hmac(
    secrets.linkSigningKey,
    ['kl1', l.id, l.merchant_id, l.token, l.amount_cents, l.fee_cents, l.net_cents, l.currency ?? 'PEN', l.expires_at].join('|')
  );
}

export function linkSignatureValid(l: LinkRow): boolean {
  return !!l.sig && safeEqual(l.sig, signLink(l));
}

const TOKEN = /^[A-Za-z0-9_-]{22}$/;
const urlMac = (token: string) => hmac(secrets.linkSigningKey, `url|${token}`, 'base64url').slice(0, 12);

/** Código público que viaja en la URL y el QR: <token>.<mac>. */
export const publicCode = (token: string) => `${token}.${urlMac(token)}`;

/** Devuelve el token si el código es auténtico; null si fue inventado o alterado. */
export function tokenFromPublicCode(code: unknown): string | null {
  if (typeof code !== 'string' || code.length > 64) return null;
  const [token, mac, extra] = code.split('.');
  if (extra !== undefined || !TOKEN.test(token ?? '') || !mac) return null;
  return safeEqual(mac, urlMac(token)) ? token : null;
}

export const payUrl = (token: string) => `${config.payBaseUrl}/${publicCode(token)}`;

export const getLinkByToken = async (token: string) =>
  (await db.prepare('SELECT * FROM payment_links WHERE token = ?').get(token) as LinkRow | undefined) ?? null;

export const getLinkById = async (id: string) => (await db.prepare('SELECT * FROM payment_links WHERE id = ?').get(id) as LinkRow | undefined) ?? null;

const OPEN = new Set(['DRAFT', 'ACTIVE', 'ON_HOLD']);

/**
 * Determina si un link pertenece a pruebas en sandbox (nunca en producción ni con referencias reales live_).
 */
export function isSandboxTestableLink(link: Pick<LinkRow, 'gateway_ref'>): boolean {
  const sandboxEnv =
    !config.isProd &&
    process.env.NODE_ENV !== 'production' &&
    process.env.KUOTA_SANDBOX !== '0' &&
    config.sandboxEnabled;
  const isTestRef = !link.gateway_ref || !link.gateway_ref.startsWith('live_');
  return sandboxEnv && isTestRef;
}

/**
 * Marca como vencido un link abierto cuyo plazo ya pasó y, únicamente en sandbox con datos de prueba,
 * simula la confirmación de liquidación cuando transcurre la ventana configurable (por defecto 5 min).
 * En producción NUNCA confirma una liquidación por tiempo: espera evidencia firmada de 360pay.
 */
export async function refreshStatus(link: LinkRow): Promise<LinkRow> {
  if (OPEN.has(link.status) && new Date(link.expires_at) <= new Date()) {
    const changed = (await db
      .prepare("UPDATE payment_links SET status = 'EXPIRED' WHERE id = ? AND status IN ('DRAFT', 'ACTIVE', 'ON_HOLD')")
      .run(link.id)).changes;
    if (changed) await paymentEvent(link.id, 'EXPIRED', { expires_at: link.expires_at });
    return { ...link, status: 'EXPIRED' };
  }
  if (link.status === 'PAID' && !link.settled_at && link.paid_at && isSandboxTestableLink(link)) {
    const windowMs = Number(process.env.KUOTA_SETTLEMENT_WINDOW_MS ?? config.sandboxSettlementWindowMs);
    const paidMs = Date.parse(link.paid_at);
    if (Number.isFinite(windowMs) && windowMs >= 0 && Number.isFinite(paidMs) && Date.now() - paidMs >= windowMs) {
      const settledAt = new Date(paidMs + windowMs).toISOString();
      const changed = (await db
        .prepare("UPDATE payment_links SET settled_at = ? WHERE id = ? AND status = 'PAID' AND settled_at IS NULL")
        .run(settledAt, link.id)).changes;
      if (changed) {
        await paymentEvent(link.id, 'SETTLED', { simulated: true, window_ms: windowMs, settled_at: settledAt });
      }
      return { ...link, settled_at: settledAt };
    }
  }
  return link;
}

export type SettlementStatus =
  | 'SETTLED'
  | 'PENDING_SETTLEMENT'
  | 'CANCELLED'
  | 'FAILED'
  | 'EXPIRED'
  | 'UNPAID';

/** Vista del link para su dueño (sin firma ni datos internos). */
export async function ownerView(l: LinkRow) {
  const link = await refreshStatus(l);
  const failedAttempt =
    link.status !== 'PAID'
      ? ((await db
          .prepare(
            "SELECT result, reason, created_at FROM payment_attempts WHERE link_id = ? AND result IN ('FAILED', 'BLOCKED') ORDER BY created_at DESC LIMIT 1"
          )
          .get(link.id)) as { result: string; reason: string | null; created_at: string } | undefined)
      : undefined;

  const sandboxSim = isSandboxTestableLink(link);
  const windowMs = sandboxSim
    ? Number(process.env.KUOTA_SETTLEMENT_WINDOW_MS ?? config.sandboxSettlementWindowMs)
    : Number(process.env.KUOTA_SETTLEMENT_ESTIMATED_HOURS ?? config.settlementEstimatedHours) * 3_600_000;
  const paidMs = link.paid_at ? Date.parse(link.paid_at) : NaN;
  const settlementEtaAt =
    link.status === 'PAID' && Number.isFinite(paidMs) ? new Date(paidMs + windowMs).toISOString() : null;
  const settlementOverdue = Boolean(
    link.status === 'PAID' && !link.settled_at && settlementEtaAt && Date.now() >= Date.parse(settlementEtaAt)
  );
  const settlementStatus: SettlementStatus =
    link.status === 'PAID' && link.settled_at
      ? 'SETTLED'
      : link.status === 'PAID'
      ? 'PENDING_SETTLEMENT'
      : link.status === 'CANCELLED'
      ? 'CANCELLED'
      : failedAttempt
      ? 'FAILED'
      : link.status === 'EXPIRED'
      ? 'EXPIRED'
      : 'UNPAID';

  return {
    id: link.id,
    amount_cents: link.amount_cents,
    fee_cents: link.fee_cents,
    net_cents: link.net_cents,
    currency: link.currency ?? 'PEN',
    concept: link.concept,
    status: link.status,
    expires_at: link.expires_at,
    created_at: link.created_at,
    paid_at: link.paid_at,
    settled_at: link.settled_at,
    settlement_status: settlementStatus,
    settlement_eta_at: settlementEtaAt,
    settlement_overdue: settlementOverdue,
    settlement_window_ms: windowMs,
    settlement_calendar_mode: config.settlementCalendarMode,
    settlement_sla_note: 'Plazo real y cómputo (horas hábiles o calendario) pendientes de validar con 360pay.',
    last_attempt_failed: Boolean(failedAttempt),
    last_attempt_reason: failedAttempt?.reason ?? null,
    url: link.status === 'ACTIVE' ? payUrl(link.token) : null,
    // Código de 360pay para pagar en bancos y agentes (si la integración está activa).
    payment_code: link.pay360_coupon_code
  };
}

/** Datos verificados del comercio que ve el pagador antes de pagar. */
export const avatarUrl = (token: string | null | undefined) => (token ? `/api/v1/public/avatar/${token}` : null);

export function merchantPublicIdentity(m: { business_name: string | null; kyc_status: string | null; ruc: string | null; city: string | null; avatar_token?: string | null }) {
  const ruc = m.ruc && /^\d{11}$/.test(m.ruc) ? `${m.ruc.slice(0, 4)}•••${m.ruc.slice(-3)}` : null;
  return {
    name: m.business_name ?? 'Comercio Kuota',
    verification: m.kyc_status === 'APPROVED' ? 'VERIFIED' : 'BASIC',
    ruc_masked: ruc,
    city: m.city ?? null,
    avatar_url: avatarUrl(m.avatar_token)
  };
}
