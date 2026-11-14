// Límites de tasa e idempotencia.
//
// P1-7: el limitador usa PostgreSQL (upsert atómico en rate_limit_buckets)
// para compartir contadores entre todas las instancias Railway.
import type { NextFunction, Request, Response } from 'express';
import { paymentsDb as db } from '../db/client.js';
import { canonicalJson, sha256Hex } from './crypto.js';
import { clientIp, fail, headerString } from './http.js';
import { nowIso } from './time.js';

export function rateLimit(opts: { name: string; windowMs: number; max: number; key?: (req: Request) => string }) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const now = Date.now();
    const resetAt = now + opts.windowMs;
    const key = `${opts.name}:${opts.key ? opts.key(req) : clientIp(req)}`;
    const row = await db.prepare(`
      INSERT INTO payments.rate_limit_buckets (key, count, reset_at)
      VALUES ($1, 1, $2)
      ON CONFLICT (key) DO UPDATE
        SET count    = CASE WHEN rate_limit_buckets.reset_at <= $3 THEN 1
                            ELSE rate_limit_buckets.count + 1 END,
            reset_at = CASE WHEN rate_limit_buckets.reset_at <= $3 THEN $2
                            ELSE rate_limit_buckets.reset_at END
      RETURNING count, reset_at
    `).get(key, resetAt, now) as { count: number; reset_at: number } | undefined;
    if (!row || row.count > opts.max) {
      const retryAfter = row ? Math.ceil((row.reset_at - now) / 1000) : Math.ceil(opts.windowMs / 1000);
      res.setHeader('Retry-After', String(retryAfter));
      return fail(res, 429, 'RATE_LIMITED', 'Demasiadas solicitudes. Espera un momento e inténtalo otra vez.');
    }
    next();
  };
}

/** Solo para pruebas automatizadas. */
export async function resetRateLimits() {
  await db.prepare('DELETE FROM payments.rate_limit_buckets').run();
}

const IDEM_KEY = /^[A-Za-z0-9_-]{16,80}$/;

/**
 * Idempotencia para operaciones de dinero (Idempotency-Key obligatorio): un
 * reintento con la misma clave y el mismo cuerpo devuelve la respuesta original
 * sin repetir la operación; con otro cuerpo responde 409.
 *
 * La clave se reserva ANTES de procesar (fila con status_code 0), así dos
 * reintentos simultáneos no ejecutan la operación dos veces. Solo se conservan
 * las respuestas exitosas: si falla (p. ej. pide PIN, 403) se libera la clave
 * para que el reintento con la misma clave pueda completarse.
 */
export async function idempotent(req: Request, res: Response, next: NextFunction) {
  const key = headerString(req, 'idempotency-key');
  if (!key || !IDEM_KEY.test(key)) {
    return fail(res, 400, 'IDEMPOTENCY_KEY_REQUIRED', 'Falta la cabecera Idempotency-Key (16 a 80 caracteres).');
  }
  const owner = req.auth?.merchantId ?? 'anon';
  const requestHash = sha256Hex(`${req.method} ${req.baseUrl}${req.path}\n${canonicalJson(req.body ?? null)}`);
  const reserved = await db.run(
    `INSERT INTO idempotency_keys (merchant_id, idem_key, request_hash, status_code, response_json, created_at)
     VALUES (?, ?, ?, 0, '', ?) ON CONFLICT (merchant_id, idem_key) DO NOTHING`,
    owner,
    key,
    requestHash,
    nowIso()
  );
  if (reserved.changes === 0) {
    const prior = await db.get<{ request_hash: string; status_code: number; response_json: string }>(
      'SELECT request_hash, status_code, response_json FROM idempotency_keys WHERE merchant_id = ? AND idem_key = ?',
      owner,
      key
    );
    if (!prior || prior.request_hash !== requestHash) {
      return fail(res, 409, 'IDEMPOTENCY_KEY_REUSED', 'Esta clave de idempotencia ya se usó con otros datos.');
    }
    if (prior.status_code === 0) {
      return fail(res, 409, 'IDEMPOTENCY_IN_PROGRESS', 'Esta operación ya se está procesando. Espera un momento.');
    }
    res.setHeader('Idempotent-Replayed', 'true');
    return res.status(prior.status_code).json(JSON.parse(prior.response_json));
  }

  // Se completa (o libera) la reserva antes de enviar la respuesta.
  const originalJson = res.json.bind(res);
  // res.json tiene que seguir siendo síncrono: la escritura se encadena y la
  // respuesta sale cuando terminó.
  res.json = (body: unknown) => {
    const ok = res.statusCode >= 200 && res.statusCode < 300;
    const settle = async (): Promise<unknown> =>
      ok
        ? await db.run('UPDATE idempotency_keys SET status_code = ?, response_json = ? WHERE merchant_id = ? AND idem_key = ?', res.statusCode, JSON.stringify(body), owner, key)
        : await db.run('DELETE FROM idempotency_keys WHERE merchant_id = ? AND idem_key = ? AND status_code = 0', owner, key);
    void settle()
      .catch((e: unknown) => console.error('[idempotency]', e instanceof Error ? e.message : e))
      .then(() => originalJson(body));
    return res;
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
