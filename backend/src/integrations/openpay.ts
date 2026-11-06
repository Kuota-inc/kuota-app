// Openpay (https://github.com/open-pay) — integración de pagos para conformidad del enganche.
// En sandbox (sin OPENPAY_MERCHANT_ID): devuelve un cargo simulado inmediatamente.
// En producción: llama a la API REST de Openpay Perú con fetch + HTTP Basic Auth.
import crypto from 'node:crypto';

const OPENPAY_BASE = 'https://sandbox-api.openpay.pe/v1';

export interface OpenpayCharge {
  id: string;
  status: 'completed' | 'in_progress' | 'failed';
  amount: number;
  currency: string;
  order_id: string;
  description: string;
}

function mockChargeId(): string {
  return 'op_sbx_' + crypto.randomBytes(6).toString('hex');
}

/** Crea un cargo Openpay para el enganche. En sandbox devuelve un cargo ficticio. */
export async function createOpenpayCharge(params: {
  amountCents: number;
  description: string;
  orderId: string;
}): Promise<OpenpayCharge> {
  const merchantId = process.env.OPENPAY_MERCHANT_ID;
  const privateKey = process.env.OPENPAY_PRIVATE_KEY;

  if (!merchantId || !privateKey) {
    return {
      id: mockChargeId(),
      status: 'in_progress',
      amount: params.amountCents / 100,
      currency: 'PEN',
      order_id: params.orderId,
      description: params.description
    };
  }

  const auth = Buffer.from(`${privateKey}:`).toString('base64');
  const body = {
    method: 'bank_account',
    amount: params.amountCents / 100,
    currency: 'PEN',
    description: params.description,
    order_id: params.orderId
  };
  const res = await fetch(`${OPENPAY_BASE}/${merchantId}/charges`, {
    method: 'POST',
    headers: { 'Authorization': `Basic ${auth}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    const err = await res.text().catch(() => '');
    throw new Error(`Openpay error ${res.status}: ${err}`);
  }
  return res.json() as Promise<OpenpayCharge>;
}

/**
 * Verifica la firma HMAC-SHA1 que Openpay envía en el header
 * `Openpay-Event-Signature` (Base64 de HMAC-SHA1 del cuerpo crudo con la
 * private key). En sandbox sin credenciales: devuelve true siempre.
 */
export function verifyOpenpaySignature(raw: string, signature: string): boolean {
  const privateKey = process.env.OPENPAY_PRIVATE_KEY;
  if (!privateKey) return true;
  const expected = crypto.createHmac('sha1', privateKey).update(raw).digest('base64');
  return expected === signature;
}
