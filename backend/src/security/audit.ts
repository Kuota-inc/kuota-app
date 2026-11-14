// Bitácora inmutable: cada fila guarda el hash SHA-256 de la anterior (cadena
// pública) y además un HMAC-SHA256 keyed con sessionSecret (cadena privada).
// La tabla rechaza UPDATE/DELETE por trigger. verifyAuditChain() verifica ambas.
// P1-6: anchorAuditChain() congela el HMAC tail en audit_anchors (también WORM).
import { paymentsDb as db } from '../db/client.js';
import { hmac, sha256Hex } from './crypto.js';
import { secrets } from './config.js';

export type ActorType = 'MERCHANT' | 'PAYER' | 'GATEWAY' | 'ADMIN' | 'SYSTEM';
export type AuditResult = 'OK' | 'DENIED' | 'FAILED';

export interface AuditEntry {
  actorType: ActorType;
  actorId?: string | null;
  action: string;
  target?: string | null;
  result: AuditResult;
  ip?: string | null;
  deviceId?: string | null;
  details?: Record<string, unknown>;
}

const GENESIS = '0'.repeat(64);
// Génesis para la cadena HMAC (distinto del SHA-256 para evitar colisión accidental).
const HMAC_GENESIS = 'h:' + '0'.repeat(62);
// Nunca deben llegar a la bitácora, aunque un llamador los pase por error.
const REDACT = new Set(['pin', 'current_pin', 'new_pin', 'access_token', 'step_up_token', 'token', 'secret']);

function redact(details: Record<string, unknown> | undefined): string | null {
  if (!details) return null;
  const clean = Object.fromEntries(Object.entries(details).map(([k, v]) => [k, REDACT.has(k) ? '[redacted]' : v]));
  return JSON.stringify(clean);
}

type Row = {
  seq: number;
  ts: string;
  actor_type: string;
  actor_id: string | null;
  action: string;
  target: string | null;
  result: string;
  ip: string | null;
  device_id: string | null;
  details_json: string | null;
  prev_hash: string;
  hash: string;
  hmac_hash: string | null;
  prev_hmac_hash: string | null;
};

function rowHash(r: Omit<Row, 'seq' | 'hash' | 'hmac_hash' | 'prev_hmac_hash'>): string {
  return sha256Hex(
    JSON.stringify([r.ts, r.actor_type, r.actor_id, r.action, r.target, r.result, r.ip, r.device_id, r.details_json, r.prev_hash])
  );
}

function rowHmac(r: Omit<Row, 'seq' | 'hash' | 'hmac_hash'>, prevHmacHash: string): string {
  return hmac(
    secrets.sessionSecret,
    JSON.stringify([r.ts, r.actor_type, r.actor_id, r.action, r.target, r.result, r.ip, r.device_id, r.details_json, r.prev_hash, prevHmacHash])
  );
}

const append = async (entry: AuditEntry) => {
  await db.lock('kuota:audit-chain');
  const tail = await db.prepare('SELECT hash, hmac_hash FROM audit_log ORDER BY seq DESC LIMIT 1').get() as { hash: string; hmac_hash: string | null } | undefined;
  const prev = tail?.hash ?? GENESIS;
  const prevHmac = tail?.hmac_hash ?? HMAC_GENESIS;
  const row = {
    ts: new Date().toISOString(),
    actor_type: entry.actorType,
    actor_id: entry.actorId ?? null,
    action: entry.action,
    target: entry.target ?? null,
    result: entry.result,
    ip: entry.ip ?? null,
    device_id: entry.deviceId ?? null,
    details_json: redact(entry.details),
    prev_hash: prev,
    prev_hmac_hash: prevHmac
  };
  const hash = rowHash(row);
  const hmacHash = rowHmac(row, prevHmac);
  await db.prepare(`
    INSERT INTO audit_log (ts, actor_type, actor_id, action, target, result, ip, device_id, details_json, prev_hash, hash, hmac_hash, prev_hmac_hash)
    VALUES (@ts, @actor_type, @actor_id, @action, @target, @result, @ip, @device_id, @details_json, @prev_hash, @hash, @hmac_hash, @prev_hmac_hash)
  `).run({ ...row, hash, hmac_hash: hmacHash });
};

/** Agrega un evento; dentro de una transacción en curso queda en ella (se confirma o revierte junto). */
export async function audit(entry: AuditEntry) {
  await db.transaction(append)(entry);
}

export async function verifyAuditChain(): Promise<{ ok: boolean; count: number; broken_at_seq?: number; reason?: string }> {
  const rows = await db.prepare('SELECT * FROM audit_log ORDER BY seq ASC').all() as Row[];
  let prev = GENESIS;
  let prevHmac = HMAC_GENESIS;
  for (const r of rows) {
    // SHA-256 chain (all rows)
    if (r.prev_hash !== prev) return { ok: false, count: rows.length, broken_at_seq: r.seq, reason: 'eslabón SHA-256 faltante o reordenado' };
    if (rowHash(r) !== r.hash) return { ok: false, count: rows.length, broken_at_seq: r.seq, reason: 'contenido alterado (SHA-256)' };
    // HMAC chain (rows with hmac_hash set — post P1-6 deploy)
    if (r.hmac_hash !== null) {
      if (r.prev_hmac_hash !== prevHmac) return { ok: false, count: rows.length, broken_at_seq: r.seq, reason: 'eslabón HMAC faltante o reordenado' };
      if (rowHmac(r, prevHmac) !== r.hmac_hash) return { ok: false, count: rows.length, broken_at_seq: r.seq, reason: 'contenido alterado (HMAC)' };
      prevHmac = r.hmac_hash;
    }
    prev = r.hash;
  }
  return { ok: true, count: rows.length };
}

/** P1-6: congela el HMAC tail actual en audit_anchors (tabla WORM). */
export async function anchorAuditChain(note?: string): Promise<{ seq: number; hmac_hash: string }> {
  const tail = await db.prepare('SELECT seq, hmac_hash FROM audit_log WHERE hmac_hash IS NOT NULL ORDER BY seq DESC LIMIT 1').get() as { seq: number; hmac_hash: string } | undefined;
  if (!tail) throw Object.assign(new Error('No hay filas con HMAC para anclar.'), { status: 409, code: 'NOTHING_TO_ANCHOR' });
  await db.prepare(
    "INSERT INTO audit_anchors (anchored_at, seq, hmac_hash, note) VALUES ($1, $2, $3, $4)"
  ).run(new Date().toISOString(), tail.seq, tail.hmac_hash, note ?? null);
  return { seq: tail.seq, hmac_hash: tail.hmac_hash };
}

export function recentAudit(limit = 50) {
  return db.prepare('SELECT * FROM audit_log ORDER BY seq DESC LIMIT ?').all(Math.min(Math.max(limit, 1), 500));
}
