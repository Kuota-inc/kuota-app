// Motor de decisión antifraude en tiempo real. Reglas explicables (risk_rules,
// editables sin redeploy) y listas negra/gris/blanca. Respuesta graduada:
// APPROVE < STEP_UP (pedir PIN) < REVIEW (retener) < BLOCK.
import { performance } from 'node:perf_hooks';
import { db } from '../db/database.js';
import { randomId } from './crypto.js';
import type { MerchantRow } from './auth.js';
import type { EffectiveLimits } from './limits.js';
import { usageToday } from './limits.js';
import type { RiskAction } from './riskRules.js';
import { formatSoles, limaHour, nowIso, sqlTime } from './time.js';

export type Decision = 'APPROVE' | RiskAction;
const RANK: Record<Decision, number> = { APPROVE: 0, STEP_UP: 1, REVIEW: 2, BLOCK: 3 };

export interface LinkCreateInput {
  kind: 'LINK_CREATE';
  merchant: MerchantRow;
  deviceId: string;
  ip: string;
  amountCents: number;
  limits: EffectiveLimits;
}

export interface PayAttemptInput {
  kind: 'PAY_ATTEMPT';
  merchant: MerchantRow;
  linkId: string;
  payerFingerprint: string;
  ip: string;
}

type Input = LinkCreateInput | PayAttemptInput;

interface Rule {
  id: string;
  context: string;
  action: RiskAction;
  params: Record<string, number>;
}

export interface Reason {
  rule: string;
  action: RiskAction;
  detail: string;
}

const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000);
const count = (sql: string, ...args: unknown[]) => (db.prepare(sql).get(...args) as { n: number }).n;

function merchantAgeDays(m: MerchantRow): number {
  const row = db
    .prepare(`
      SELECT COALESCE(
        (SELECT created_at FROM users WHERE id = ?),
        (SELECT created_at FROM onboarding_sessions WHERE id = ?),
        (SELECT MIN(first_seen_at) FROM merchant_devices WHERE merchant_id = ?)
      ) AS since
    `)
    .get(m.user_id, m.session_id, m.id) as { since: string | null };
  if (!row.since) return 0; // sin historial: se trata como nuevo
  const since = new Date(row.since.includes('T') ? row.since : `${row.since.replace(' ', 'T')}Z`);
  return (Date.now() - since.getTime()) / 86_400_000;
}

type Evaluator = (p: Record<string, number>, input: Input) => string | null;

const EVALUATORS: Record<string, Evaluator> = {
  high_amount: (_p, i) =>
    i.kind === 'LINK_CREATE' && i.amountCents >= i.limits.step_up_over_cents
      ? `monto desde ${formatSoles(i.limits.step_up_over_cents)} requiere confirmación`
      : null,

  amount_vs_history: (p, i) => {
    if (i.kind !== 'LINK_CREATE') return null;
    const row = db
      .prepare(`SELECT COUNT(*) AS n, AVG(amount_cents) AS avg FROM payment_links WHERE merchant_id = ? AND status = 'PAID' AND created_at >= ?`)
      .get(i.merchant.id, sqlTime(new Date(Date.now() - p.lookback_days * 86_400_000))) as { n: number; avg: number | null };
    if (row.n < p.min_paid || !row.avg) return null;
    return i.amountCents > p.multiplier * row.avg ? `monto ${(i.amountCents / row.avg).toFixed(1)}× el promedio cobrado` : null;
  },

  link_velocity_review: (p, i) => velocity(p, i),
  link_velocity_block: (p, i) => velocity(p, i),

  new_merchant_volume: (p, i) => {
    if (i.kind !== 'LINK_CREATE' || merchantAgeDays(i.merchant) >= p.max_age_days) return null;
    const total = usageToday(i.merchant.id).amount_cents + i.amountCents;
    return total > p.daily_cents ? `comercio con menos de ${p.max_age_days} días y ${formatSoles(total)} hoy` : null;
  },

  structuring: (p, i) => {
    if (i.kind !== 'LINK_CREATE') return null;
    const threshold = Math.floor((i.limits.per_tx_cents * p.pct_of_limit) / 100);
    if (i.amountCents < threshold) return null;
    const near = count(
      'SELECT COUNT(*) AS n FROM payment_links WHERE merchant_id = ? AND created_at >= ? AND amount_cents >= ?',
      i.merchant.id,
      sqlTime(minutesAgo(p.window_min)),
      threshold
    );
    return near + 1 >= p.min_links ? `${near + 1} cobros cerca del límite en ${p.window_min} min` : null;
  },

  unpaid_spike: (p, i) => {
    if (i.kind !== 'LINK_CREATE') return null;
    const active = count(
      "SELECT COUNT(*) AS n FROM payment_links WHERE merchant_id = ? AND status = 'ACTIVE' AND expires_at > ?",
      i.merchant.id,
      nowIso()
    );
    return active >= p.max_active_unpaid ? `${active} links activos sin pagar` : null;
  },

  night_high_amount: (p, i) => {
    if (i.kind !== 'LINK_CREATE') return null;
    const h = limaHour();
    return h >= p.from_hour && h < p.to_hour && i.amountCents >= p.min_cents ? `monto alto a las ${h}:00 (Lima)` : null;
  },

  device_cooldown: (p, i) =>
    i.kind === 'LINK_CREATE' && i.limits.cooldown_until && i.amountCents >= p.min_cents
      ? 'dispositivo o PIN cambiados en las últimas horas'
      : null,

  shared_device: (p, i) => {
    if (i.kind !== 'LINK_CREATE') return null;
    const merchants = count('SELECT COUNT(DISTINCT merchant_id) AS n FROM merchant_devices WHERE device_id = ? AND revoked_at IS NULL', i.deviceId);
    return merchants > p.max_merchants ? `el dispositivo opera ${merchants} comercios` : null;
  },

  card_testing: (p, i) => {
    if (i.kind !== 'PAY_ATTEMPT') return null;
    const since = minutesAgo(p.window_min).toISOString();
    const byLink = count("SELECT COUNT(*) AS n FROM payment_attempts WHERE link_id = ? AND result = 'FAILED' AND created_at >= ?", i.linkId, since);
    const byPayer = count(
      "SELECT COUNT(*) AS n FROM payment_attempts WHERE payer_fingerprint = ? AND result = 'FAILED' AND created_at >= ?",
      i.payerFingerprint,
      since
    );
    return Math.max(byLink, byPayer) >= p.max_failed ? `${Math.max(byLink, byPayer)} pagos fallidos en ${p.window_min} min` : null;
  },

  payer_velocity: (p, i) => {
    if (i.kind !== 'PAY_ATTEMPT') return null;
    const n = count(
      'SELECT COUNT(*) AS n FROM payment_attempts WHERE payer_fingerprint = ? AND created_at >= ?',
      i.payerFingerprint,
      minutesAgo(p.window_min).toISOString()
    );
    return n >= p.max_attempts ? `${n} intentos del mismo pagador en ${p.window_min} min` : null;
  }
};

function velocity(p: Record<string, number>, i: Input): string | null {
  if (i.kind !== 'LINK_CREATE') return null;
  const n = count('SELECT COUNT(*) AS n FROM payment_links WHERE merchant_id = ? AND created_at >= ?', i.merchant.id, sqlTime(minutesAgo(p.window_min)));
  return n >= p.max_links ? `${n + 1} links en ${p.window_min} min` : null;
}

export const KNOWN_RULES = new Set([...Object.keys(EVALUATORS), 'list_black', 'list_gray']);

function listHits(subjects: { kind: 'MERCHANT' | 'DEVICE' | 'IP'; value: string }[]) {
  const hits = { black: [] as string[], gray: [] as string[], white: false };
  for (const s of subjects) {
    const row = db.prepare('SELECT list FROM risk_lists WHERE kind = ? AND value = ?').get(s.kind, s.value) as { list: string } | undefined;
    if (row?.list === 'BLACK') hits.black.push(s.kind);
    if (row?.list === 'GRAY') hits.gray.push(s.kind);
    if (row?.list === 'WHITE' && s.kind !== 'IP') hits.white = true;
  }
  return hits;
}

export function evaluateRisk(input: Input) {
  const started = performance.now();
  const rules = (
    db.prepare("SELECT id, context, action, params_json FROM risk_rules WHERE enabled = 1 AND context IN (?, 'ANY')").all(input.kind) as {
      id: string;
      context: string;
      action: RiskAction;
      params_json: string;
    }[]
  ).map((r): Rule => ({ id: r.id, context: r.context, action: r.action, params: JSON.parse(r.params_json) }));

  const subjects: { kind: 'MERCHANT' | 'DEVICE' | 'IP'; value: string }[] = [
    { kind: 'MERCHANT', value: input.merchant.id },
    { kind: 'IP', value: input.ip }
  ];
  if (input.kind === 'LINK_CREATE') subjects.push({ kind: 'DEVICE', value: input.deviceId });
  const lists = listHits(subjects);

  const reasons: Reason[] = [];
  for (const rule of rules) {
    let detail: string | null = null;
    if (rule.id === 'list_black') detail = lists.black.length ? `en lista negra: ${lists.black.join(', ')}` : null;
    else if (rule.id === 'list_gray') detail = lists.gray.length ? `en lista gris: ${lists.gray.join(', ')}` : null;
    else detail = EVALUATORS[rule.id]?.(rule.params, input) ?? null;
    if (!detail) continue;
    // Lista blanca: exime de retenciones por reglas blandas, nunca de un bloqueo.
    if (lists.white && rule.action === 'REVIEW' && rule.id !== 'list_gray') continue;
    reasons.push({ rule: rule.id, action: rule.action, detail });
  }

  const decision = reasons.reduce<Decision>((d, r) => (RANK[r.action] > RANK[d] ? r.action : d), 'APPROVE');
  const id = randomId('rsk', 10);
  const latency = performance.now() - started;
  db.prepare(`
    INSERT INTO risk_decisions (id, context, merchant_id, subject_id, decision, reasons_json, latency_ms, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    input.kind,
    input.merchant.id,
    input.kind === 'PAY_ATTEMPT' ? input.linkId : input.deviceId,
    decision,
    JSON.stringify(reasons),
    latency,
    nowIso()
  );
  return { id, decision, reasons, latencyMs: latency };
}

/** Tasa de fraude, falsos positivos y tiempo de decisión (últimos 30 días). */
export function riskMetrics() {
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const decisions = db
    .prepare('SELECT decision, COUNT(*) AS n FROM risk_decisions WHERE created_at >= ? GROUP BY decision')
    .all(since) as { decision: string; n: number }[];
  const latencies = (
    db.prepare('SELECT latency_ms FROM risk_decisions WHERE created_at >= ? ORDER BY latency_ms').all(since) as { latency_ms: number }[]
  ).map((r) => r.latency_ms);
  const reviews = db
    .prepare(`
      SELECT COUNT(*) AS total,
             SUM(CASE WHEN resolved_at IS NULL THEN 1 ELSE 0 END) AS open,
             SUM(CASE WHEN label = 'FRAUD' THEN 1 ELSE 0 END) AS fraud,
             SUM(CASE WHEN label = 'LEGIT' THEN 1 ELSE 0 END) AS legit
      FROM risk_reviews WHERE opened_at >= ?
    `)
    .get(since) as { total: number; open: number | null; fraud: number | null; legit: number | null };
  const resolved = (reviews.fraud ?? 0) + (reviews.legit ?? 0);
  const total = decisions.reduce((s, d) => s + d.n, 0);
  const pct = (p: number) => (latencies.length ? latencies[Math.min(latencies.length - 1, Math.floor(p * latencies.length))] : 0);
  return {
    window_days: 30,
    decisions_total: total,
    decisions: Object.fromEntries(decisions.map((d) => [d.decision, d.n])),
    latency_ms: { p50: +pct(0.5).toFixed(2), p95: +pct(0.95).toFixed(2) },
    reviews: { total: reviews.total, open: reviews.open ?? 0, fraud_confirmed: reviews.fraud ?? 0, legit: reviews.legit ?? 0 },
    false_positive_rate: resolved ? +((reviews.legit ?? 0) / resolved).toFixed(3) : null,
    confirmed_fraud_rate: total ? +((reviews.fraud ?? 0) / total).toFixed(4) : null
  };
}
