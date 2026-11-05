// Límites de cobro escalonados: por operación, por día y por número de cobros,
// según el nivel de verificación del comercio. Siempre rige el más restrictivo
// entre: nivel, límite propio del comercio, tope de 360pay y enfriamiento.
import { paymentsDb as db } from '../db/client.js';
import { config } from './config.js';
import { audit } from './audit.js';
import { alertMerchant } from './events.js';
import type { MerchantRow } from './auth.js';
import { formatSoles, limaDayStart, nowIso, sqlTime } from './time.js';

export const TIERS = {
  // DNI o RUC, teléfono verificado y cuenta de abono.
  BASIC: { label: 'Básico', perTxCents: 100_000, dailyCents: 300_000, dailyCount: 50, stepUpOverCents: 50_000 },
  // Además: documento con prueba de vida, RUC validado y titularidad de la cuenta de abono.
  EXTENDED: { label: 'Ampliado', perTxCents: 500_000, dailyCents: 2_000_000, dailyCount: 200, stepUpOverCents: 200_000 }
} as const;

export type Tier = keyof typeof TIERS;
export const tierOf = (m: MerchantRow): Tier => (m.kyc_status === 'APPROVED' ? 'EXTENDED' : 'BASIC');

export interface LimitValues {
  per_tx_cents: number;
  daily_cents: number;
  daily_count: number;
}

interface SettingsRow {
  per_tx_cents: number | null;
  daily_cents: number | null;
  daily_count: number | null;
  pending_json: string | null;
  pending_effective_at: string | null;
}

const getSettings = async (merchantId: string) =>
  (await db.prepare('SELECT * FROM merchant_limit_settings WHERE merchant_id = ?').get(merchantId) as SettingsRow | undefined) ?? null;

/** Aplica una subida de límites pendiente cuyo plazo de espera ya se cumplió. */
async function applyDuePending(merchantId: string) {
  const s = await getSettings(merchantId);
  if (!s?.pending_json || !s.pending_effective_at || new Date(s.pending_effective_at) > new Date()) return;
  const p = JSON.parse(s.pending_json) as LimitValues;
  await db.prepare(`
    UPDATE merchant_limit_settings
    SET per_tx_cents = ?, daily_cents = ?, daily_count = ?, pending_json = NULL, pending_effective_at = NULL, updated_at = ?
    WHERE merchant_id = ?
  `).run(p.per_tx_cents, p.daily_cents, p.daily_count, nowIso(), merchantId);
  await audit({ actorType: 'SYSTEM', actorId: merchantId, action: 'LIMITS_RAISE_APPLIED', target: merchantId, result: 'OK', details: { ...p } });
  await alertMerchant(merchantId, 'LIMITS_CHANGED', 'Tus nuevos límites de cobro ya están activos', `${formatSoles(p.per_tx_cents)} por cobro y ${formatSoles(p.daily_cents)} por día.`);
}

/** Fin del enfriamiento vigente (dispositivo nuevo o PIN recién cambiado), o null. */
export async function cooldownUntil(merchantId: string, deviceId?: string): Promise<string | null> {
  const now = new Date();
  const candidates: (string | null | undefined)[] = [
    (await db.prepare('SELECT cooldown_until FROM merchant_credentials WHERE merchant_id = ?').get(merchantId) as { cooldown_until: string | null } | undefined)
      ?.cooldown_until
  ];
  if (deviceId) {
    candidates.push(
      (await db.prepare('SELECT cooldown_until FROM merchant_devices WHERE merchant_id = ? AND device_id = ?').get(merchantId, deviceId) as
        | { cooldown_until: string | null }
        | undefined)?.cooldown_until
    );
  }
  const active = candidates.filter((c): c is string => !!c && new Date(c) > now).sort();
  return active.length ? active[active.length - 1] : null;
}

export async function effectiveLimits(m: MerchantRow, deviceId?: string) {
  await applyDuePending(m.id);
  const tierName = tierOf(m);
  const tier = TIERS[tierName];
  const s = await getSettings(m.id);
  const cd = await cooldownUntil(m.id, deviceId);
  const reduce = (v: number) => (cd ? Math.floor(v * config.cooldownFactor) : Infinity);
  const perTx = Math.min(tier.perTxCents, s?.per_tx_cents ?? Infinity, config.partnerLimits.perTxCents, reduce(tier.perTxCents));
  const daily = Math.min(tier.dailyCents, s?.daily_cents ?? Infinity, config.partnerLimits.dailyCents, reduce(tier.dailyCents));
  const count = Math.min(tier.dailyCount, s?.daily_count ?? Infinity, config.partnerLimits.dailyCount);
  return {
    tier: tierName,
    tier_label: tier.label,
    tier_max: { per_tx_cents: tier.perTxCents, daily_cents: tier.dailyCents, daily_count: tier.dailyCount },
    own: {
      per_tx_cents: s?.per_tx_cents ?? tier.perTxCents,
      daily_cents: s?.daily_cents ?? tier.dailyCents,
      daily_count: s?.daily_count ?? tier.dailyCount
    },
    per_tx_cents: perTx,
    daily_cents: daily,
    daily_count: count,
    step_up_over_cents: Math.min(tier.stepUpOverCents, perTx),
    cooldown_until: cd,
    pending: s?.pending_json ? { ...(JSON.parse(s.pending_json) as LimitValues), effective_at: s.pending_effective_at } : null
  };
}

export type EffectiveLimits = Awaited<ReturnType<typeof effectiveLimits>>;

/** Uso del día de Lima: cantidad de links creados y monto comprometido (sin cancelados). */
export async function usageToday(merchantId: string) {
  const row = await db
    .prepare(`
      SELECT COUNT(*) AS n,
             COALESCE(SUM(CASE WHEN status != 'CANCELLED' THEN amount_cents ELSE 0 END), 0) AS amount
      FROM payment_links WHERE merchant_id = ? AND created_at >= ?
    `)
    .get(merchantId, sqlTime(limaDayStart())) as { n: number; amount: number };
  return { count: row.n, amount_cents: row.amount };
}

export async function checkLinkLimits(m: MerchantRow, deviceId: string, amountCents: number) {
  const limits = await effectiveLimits(m, deviceId);
  const usage = await usageToday(m.id);
  const cooldownNote = limits.cooldown_until ? ' Tus límites están reducidos temporalmente por un cambio de seguridad reciente.' : '';
  let problem: { code: string; message: string } | null = null;
  if (amountCents > limits.per_tx_cents) {
    problem = { code: 'LIMIT_PER_TX', message: `El monto supera tu límite por cobro de ${formatSoles(limits.per_tx_cents)}.${cooldownNote}` };
  } else if (usage.amount_cents + amountCents > limits.daily_cents) {
    const left = Math.max(0, limits.daily_cents - usage.amount_cents);
    problem = { code: 'LIMIT_DAILY_AMOUNT', message: `Superarías tu límite diario. Hoy puedes cobrar hasta ${formatSoles(left)} más.${cooldownNote}` };
  } else if (usage.count + 1 > limits.daily_count) {
    problem = { code: 'LIMIT_DAILY_COUNT', message: `Llegaste a tu máximo de ${limits.daily_count} cobros por día.` };
  }
  return { problem, limits, usage };
}

export function validLimitValues(body: unknown): LimitValues | null {
  if (!body || typeof body !== 'object') return null;
  const b = body as Record<string, unknown>;
  const ok = (v: unknown, max: number) => Number.isInteger(v) && (v as number) > 0 && (v as number) <= max;
  if (!ok(b.per_tx_cents, 100_000_000) || !ok(b.daily_cents, 1_000_000_000) || !ok(b.daily_count, 10_000)) return null;
  return { per_tx_cents: b.per_tx_cents as number, daily_cents: b.daily_cents as number, daily_count: b.daily_count as number };
}
