// Límites de tasa e idempotencia.
//
// El limitador es en memoria (un solo proceso). En producción esta función la
// cumplen el WAF/API Gateway y un almacén compartido (Redis) entre réplicas.
import type { NextFunction, Request, Response } from 'express';
import { db } from '../db/database.js';
import { canonicalJson, sha256Hex } from './crypto.js';
import { clientIp, fail, headerString } from './http.js';
import { nowIso } from './time.js';

type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();
let lastSweep = Date.now();

export function rateLimit(opts: { name: string; windowMs: number; max: number; key?: (req: Request) => string }) {
  return (req: Request, res: Response, next: NextFunction) => {
    const now = Date.now();
    if (now - lastSweep > 60_000) {
      for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k);
      lastSweep = now;
    }
    const key = `${opts.name}:${opts.key ? opts.key(req) : clientIp(req)}`;
    let b = buckets.get(key);
    if (!b || b.resetAt <= now) {
      b = { count: 0, resetAt: now + opts.windowMs };
      buckets.set(key, b);
    }
    b.count += 1;
    if (b.count > opts.max) {
      res.setHeader('Retry-After', String(Math.ceil((b.resetAt - now) / 1000)));
      return fail(res, 429, 'RATE_LIMITED', 'Demasiadas solicitudes. Espera un momento e inténtalo otra vez.');
    }
    next();
  };
}

/** Solo para pruebas automatizadas. */
export function resetRateLimits() {
  buckets.clear();
}

const IDEM_KEY = /^[A-Za-z0-9_-]{16,80}$/;

/**
 * Idempotencia para operaciones de dinero (Idempotency-Key obligatorio): un
 * reintento con la misma clave y el mismo cuerpo devuelve la respuesta original
 * sin repetir la operación; con otro cuerpo responde 409. Solo se guardan las
 * respuestas exitosas, para que un pedido de PIN (403) pueda reintentarse.
 */
export function idempotent(req: Request, res: Response, next: NextFunction) {
  const key = headerString(req, 'idempotency-key');
  if (!key || !IDEM_KEY.test(key)) {
    return fail(res, 400, 'IDEMPOTENCY_KEY_REQUIRED', 'Falta la cabecera Idempotency-Key (16 a 80 caracteres).');
  }
  const owner = req.auth?.merchantId ?? 'anon';
  const requestHash = sha256Hex(`${req.method} ${req.baseUrl}${req.path}\n${canonicalJson(req.body ?? null)}`);
  const prior = db.prepare('SELECT request_hash, status_code, response_json FROM idempotency_keys WHERE merchant_id = ? AND idem_key = ?').get(owner, key) as
    | { request_hash: string; status_code: number; response_json: string }
    | undefined;
  if (prior) {
    if (prior.request_hash !== requestHash) {
      return fail(res, 409, 'IDEMPOTENCY_KEY_REUSED', 'Esta clave de idempotencia ya se usó con otros datos.');
    }
    res.setHeader('Idempotent-Replayed', 'true');
    return res.status(prior.status_code).json(JSON.parse(prior.response_json));
  }
  const originalJson = res.json.bind(res);
  res.json = (body: unknown) => {
    if (res.statusCode >= 200 && res.statusCode < 300) {
      db.prepare(`
        INSERT OR IGNORE INTO idempotency_keys (merchant_id, idem_key, request_hash, status_code, response_json, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(owner, key, requestHash, res.statusCode, JSON.stringify(body), nowIso());
    }
    return originalJson(body);
  };
  next();
}

/** Rutas internas (operaciones, conciliación, riesgo): token de administrador. */
export function requireAdmin(adminToken: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    const header = headerString(req, 'authorization') ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
    const a = Buffer.from(sha256Hex(token));
    const b = Buffer.from(sha256Hex(adminToken));
    if (!token || !a.equals(b)) return fail(res, 401, 'ADMIN_REQUIRED', 'Credencial de operaciones requerida.');
    next();
  };
}
