import { config } from './config.js';

/** IGV (18 %) en puntos básicos. */
export const IGV_BPS = 1800;
/** Comisión mínima por cobro, sin IGV: S/ 4.50 (el costo de 360pay es S/ 3.82 fijos por transacción). */
export const MIN_FEE_CENTS = 450;

export interface Fees {
  /** Comisión de Kuota sin IGV. */
  base: number;
  igv: number;
  /** Total que se descuenta al comercio (comisión + IGV). */
  fee: number;
  net: number;
}

export function computeFees(amountCents: number, feeBps: number = config.feeBps): Fees {
  const base = Math.max(Math.ceil((amountCents * feeBps) / 10_000), MIN_FEE_CENTS);
  const igv = Math.ceil((base * IGV_BPS) / 10_000);
  const fee = base + igv;
  return { base, igv, fee, net: amountCents - fee };
}

export type PlanId = 'BASIC' | 'PRO';
export interface Plan {
  id: PlanId;
  name: string;
  /** Suscripción mensual sin IGV. */
  price_cents: number;
  /** Tope por transacción (null = sin tope). */
  max_tx_cents: number | null;
  users: number;
  features: string[];
}

export const PLANS: Record<PlanId, Plan> = {
  BASIC: { id: 'BASIC', name: 'Basic', price_cents: 8000, max_tx_cents: 500_000, users: 1, features: ['Cobros por link y QR', 'Hasta S/ 5,000 por transacción'] },
  PRO: { id: 'PRO', name: 'Pro', price_cents: 12000, max_tx_cents: null, users: 5, features: ['Cobros por link y QR', 'Más de S/ 5,000 por transacción', 'Cobranza masiva', '5 usuarios'] }
};

export const planOf = (id: unknown): Plan => (id === 'PRO' ? PLANS.PRO : PLANS.BASIC);
export const withIgv = (cents: number) => cents + Math.ceil((cents * IGV_BPS) / 10_000);
