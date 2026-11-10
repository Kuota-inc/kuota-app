// Comisión por cobro que se muestra en la app. Debe coincidir con KUOTA_FEE_BPS del backend (100 = 1 %).
const RAW = Number(import.meta.env.VITE_FEE_PCT);
export const FEE_PCT: number = Number.isFinite(RAW) && RAW > 0 ? RAW : 1;
/** "1" -> "1 %" ; "1.5" -> "1.5 %" */
export const feeLabel = `${FEE_PCT} %`;

/** Comisión mínima por cobro sin IGV (S/ 4.50) e IGV (18 %). Debe coincidir con backend/src/security/pricing.ts. */
export const MIN_FEE_CENTS = 450;
export const MIN_AMOUNT_CENTS = 1000;
export function localQuote(amountCents: number) {
  const base = Math.max(Math.ceil((amountCents * FEE_PCT) / 100), MIN_FEE_CENTS);
  const igv = Math.ceil(base * 0.18);
  return { amount_cents: amountCents, fee_base_cents: base, igv_cents: igv, fee_cents: base + igv, net_cents: amountCents - base - igv };
}
