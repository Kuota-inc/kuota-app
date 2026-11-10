// Comisión por cobro que se muestra en la app. Debe coincidir con KUOTA_FEE_BPS del backend (100 = 1 %).
const RAW = Number(import.meta.env.VITE_FEE_PCT);
export const FEE_PCT: number = Number.isFinite(RAW) && RAW > 0 ? RAW : 1;
/** "1" -> "1 %" ; "1.5" -> "1.5 %" */
export const feeLabel = `${FEE_PCT} %`;
