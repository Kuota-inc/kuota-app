// Cliente de la API pública de 360pay (https://api.360pay.pe/docs).
//   Sandbox:    https://sandbox.api.360pay.pe/v1
//   Producción: https://api.360pay.pe/v1
// Autenticación: cabecera x-api-key. Montos en soles (decimal), no en céntimos.
// Se activa solo si hay KUOTA_360PAY_API_KEY; si no, Kuota usa su simulador local.

const BASE = (process.env.KUOTA_360PAY_BASE_URL || 'https://sandbox.api.360pay.pe/v1').replace(/\/+$/, '');
const TIMEOUT_MS = 10_000;

export const pay360Enabled = () => !!process.env.KUOTA_360PAY_API_KEY;

export class Pay360Error extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly body: unknown = null
  ) {
    super(message);
    this.name = 'Pay360Error';
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const key = process.env.KUOTA_360PAY_API_KEY;
  if (!key) throw new Pay360Error(0, '360pay no está configurado (KUOTA_360PAY_API_KEY).');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${process.env.KUOTA_360PAY_BASE_URL?.replace(/\/+$/, '') || BASE}${path}`, {
      method,
      headers: { 'x-api-key': key, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal
    });
    const json = (await res.json().catch(() => null)) as { success?: boolean; data?: T; message?: string } | null;
    if (!res.ok || json?.success === false) {
      throw new Pay360Error(res.status, json?.message || `360pay respondió ${res.status}`, json);
    }
    return (json?.data ?? json) as T;
  } catch (e) {
    if (e instanceof Pay360Error) throw e;
    throw new Pay360Error(0, `No se pudo conectar con 360pay: ${(e as Error).name === 'AbortError' ? 'tiempo agotado' : (e as Error).message}`);
  } finally {
    clearTimeout(timer);
  }
}

export const centsToSoles = (cents: number) => Math.round(cents) / 100;
export const solesToCents = (soles: number) => Math.round(soles * 100);

export interface Pay360Customer {
  _id: string;
  name: string;
  coupon_code: string;
}

export interface Pay360Coupon {
  _id: string;
  customer_id: string;
  coupon_code: string;
  external_ref: string;
  amount: number;
  status: string;
  expiry_date?: string;
}

export interface Pay360SettlementCoupon {
  _id: string;
  external_ref?: string;
  amount: number;
  status?: string;
  paid_at?: string;
}

export const pay360 = {
  createCustomer: (input: { name: string; coupon_code: string; email?: string; phone?: string; document_type?: string; document_number?: string }) =>
    request<Pay360Customer>('POST', '/customers', input),
  createCoupon: (input: { customer_id: string; amount: number; external_ref: string; description?: string; expiry_date?: string }) =>
    request<Pay360Coupon>('POST', '/coupons', input),
  getCoupon: (id: string) => request<Pay360Coupon>('GET', `/coupons/${encodeURIComponent(id)}`),
  annulCoupon: (id: string) => request<Pay360Coupon>('PUT', `/coupons/${encodeURIComponent(id)}/annul`),
  listSettlements: (page = 1, limit = 50) => request<{ _id: string; [k: string]: unknown }[]>('GET', `/settlements?page=${page}&limit=${limit}`),
  settlementCoupons: (id: string) => request<Pay360SettlementCoupon[]>('GET', `/settlements/${encodeURIComponent(id)}/coupons`)
};
