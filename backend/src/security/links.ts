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

/** Marca como vencido un link abierto cuyo plazo ya pasó y devuelve su estado actual. */
export async function refreshStatus(link: LinkRow): Promise<LinkRow> {
  if (OPEN.has(link.status) && new Date(link.expires_at) <= new Date()) {
    const changed = (await db
      .prepare("UPDATE payment_links SET status = 'EXPIRED' WHERE id = ? AND status IN ('DRAFT', 'ACTIVE', 'ON_HOLD')")
      .run(link.id)).changes;
    if (changed) await paymentEvent(link.id, 'EXPIRED', { expires_at: link.expires_at });
    return { ...link, status: 'EXPIRED' };
  }
  return link;
}

/** Vista del link para su dueño (sin firma ni datos internos). */
export async function ownerView(l: LinkRow) {
  const link = await refreshStatus(l);
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
