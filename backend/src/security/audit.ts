// Bitácora inmutable: cada fila guarda el hash de la anterior (cadena SHA-256)
// y la tabla rechaza UPDATE/DELETE por trigger. Si alguien altera o borra una
// fila con acceso directo a la base, verifyAuditChain() lo detecta.
import { paymentsDb as db } from '../db/client.js';
import { sha256Hex } from './crypto.js';

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
};

function rowHash(r: Omit<Row, 'seq' | 'hash'>): string {
  return sha256Hex(
    JSON.stringify([r.ts, r.actor_type, r.actor_id, r.action, r.target, r.result, r.ip, r.device_id, r.details_json, r.prev_hash])
  );
}

const append = async (entry: AuditEntry) => {
  await db.lock('kuota:audit-chain');
  const prev =
    (await db.prepare('SELECT hash FROM audit_log ORDER BY seq DESC LIMIT 1').get() as { hash: string } | undefined)?.hash ??
    GENESIS;
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
    prev_hash: prev
  };
  await db.prepare(`
    INSERT INTO audit_log (ts, actor_type, actor_id, action, target, result, ip, device_id, details_json, prev_hash, hash)
    VALUES (@ts, @actor_type, @actor_id, @action, @target, @result, @ip, @device_id, @details_json, @prev_hash, @hash)
  `).run({ ...row, hash: rowHash(row) });
};

/** Agrega un evento; dentro de una transacción en curso queda en ella (se confirma o revierte junto). */
export async function audit(entry: AuditEntry) {
  await db.transaction(append)(entry);
}

export async function verifyAuditChain(): Promise<{ ok: boolean; count: number; broken_at_seq?: number; reason?: string }> {
  const rows = await db.prepare('SELECT * FROM audit_log ORDER BY seq ASC').all() as Row[];
  let prev = GENESIS;
  for (const r of rows) {
    if (r.prev_hash !== prev) return { ok: false, count: rows.length, broken_at_seq: r.seq, reason: 'eslabón faltante o reordenado' };
    if (rowHash(r) !== r.hash) return { ok: false, count: rows.length, broken_at_seq: r.seq, reason: 'contenido alterado' };
    prev = r.hash;
  }
  return { ok: true, count: rows.length };
}

export function recentAudit(limit = 50) {
  return db.prepare('SELECT * FROM audit_log ORDER BY seq DESC LIMIT ?').all(Math.min(Math.max(limit, 1), 500));
}
