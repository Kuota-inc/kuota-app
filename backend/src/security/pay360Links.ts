// Respaldo de cada link de cobro con un cupón de 360pay (solo si KUOTA_360PAY_API_KEY).
// El cupón lleva external_ref = id del link: así el webhook PAYMENT_PAID lo encuentra.
import { paymentsDb as db } from '../db/client.js';
import { centsToSoles, pay360, pay360Enabled } from '../integrations/pay360.js';
import { audit } from './audit.js';
import type { MerchantRow } from './auth.js';
import { sha256Hex } from './crypto.js';
import type { LinkRow } from './links.js';
import { nowIso } from './time.js';

/** Cliente 360pay del comercio (uno por comercio; agrupa sus cupones). */
async function customerFor(merchant: MerchantRow): Promise<string> {
  const known = await db.get<{ customer_id: string }>('SELECT customer_id FROM pay360_customers WHERE merchant_id = ?', merchant.id);
  if (known) return known.customer_id;
  const prefix = (process.env.KUOTA_360PAY_CODE_PREFIX || 'KTA').toUpperCase();
  const couponCode = `${prefix}${sha256Hex(merchant.id).slice(0, 8).toUpperCase()}`;
  const ruc = merchant.ruc && /^\d{11}$/.test(merchant.ruc) ? merchant.ruc : undefined;
  const created = await pay360.createCustomer({
    name: merchant.business_name || 'Comercio Kuota',
    coupon_code: couponCode,
    ...(ruc ? { document_type: 'RUC', document_number: ruc } : {})
  });
  await db.run(
    'INSERT INTO pay360_customers (merchant_id, customer_id, coupon_code, created_at) VALUES (?, ?, ?, ?) ON CONFLICT (merchant_id) DO NOTHING',
    merchant.id,
    created._id,
    created.coupon_code ?? couponCode,
    nowIso()
  );
  return created._id;
}

/** Crea el cupón del link si falta. Lanza Pay360Error si 360pay no responde. */
export async function ensureCoupon(link: LinkRow, merchant: MerchantRow): Promise<void> {
  if (!pay360Enabled() || link.pay360_coupon_id) return;
  const customerId = await customerFor(merchant);
  const coupon = await pay360.createCoupon({
    customer_id: customerId,
    amount: centsToSoles(link.amount_cents),
    external_ref: link.id,
    description: (link.concept ?? 'Cobro Kuota').slice(0, 80),
    expiry_date: link.expires_at
  });
  await db.run('UPDATE payment_links SET pay360_coupon_id = ?, pay360_coupon_code = ? WHERE id = ? AND pay360_coupon_id IS NULL', coupon._id, coupon.coupon_code, link.id);
  await audit({ actorType: 'SYSTEM', action: 'PAY360_COUPON_CREATED', target: link.id, result: 'OK', details: { coupon_id: coupon._id, coupon_code: coupon.coupon_code } });
}

/** Anula el cupón al cancelar el link. Si 360pay falla, queda en la bitácora para reintentar. */
export async function annulCoupon(link: LinkRow): Promise<void> {
  if (!pay360Enabled() || !link.pay360_coupon_id) return;
  try {
    await pay360.annulCoupon(link.pay360_coupon_id);
    await audit({ actorType: 'SYSTEM', action: 'PAY360_COUPON_ANNULLED', target: link.id, result: 'OK', details: { coupon_id: link.pay360_coupon_id } });
  } catch (e) {
    await audit({ actorType: 'SYSTEM', action: 'PAY360_COUPON_ANNULLED', target: link.id, result: 'FAILED', details: { coupon_id: link.pay360_coupon_id, error: (e as Error).message } });
  }
}
