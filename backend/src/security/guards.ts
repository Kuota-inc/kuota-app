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
      VALUES (?, 1, ?)
      ON CONFLICT (key) DO UPDATE
        SET count    = CASE WHEN rate_limit_buckets.reset_at <= ? THEN 1
                            ELSE rate_limit_buckets.count + 1 END,
            reset_at = CASE WHEN rate_limit_buckets.reset_at <= ? THEN ?
                            ELSE rate_limit_buckets.reset_at END
      RETURNING count, reset_at
    `).get(key, resetAt, now, now, resetAt) as { count: number; reset_at: number } | undefined;
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
const inFlightIdem = new Map<string, Promise<void>>();

async function resolveIdempotent(
  req: Request,
  res: Response,
  next: NextFunction,
  opts: { optional: boolean }
) {
  const key = headerString(req, 'idempotency-key');
  if (!key) {
    if (opts.optional) return next();
    return fail(res, 400, 'IDEMPOTENCY_KEY_REQUIRED', 'Falta la cabecera Idempotency-Key (16 a 80 caracteres).');
  }
  if (!IDEM_KEY.test(key)) {
    return fail(res, 400, 'IDEMPOTENCY_KEY_REQUIRED', 'Falta la cabecera Idempotency-Key (16 a 80 caracteres).');
  }
  const owner = req.auth?.merchantId ?? headerString(req, 'x-provider-id') ?? 'anon';
  const mapKey = `${owner}:${key}`;
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
    // P1-10: si otra petición idéntica está en curso, esperar a que termine y devolver la misma respuesta.
    for (let attempt = 0; attempt < 25; attempt++) {
      const prior = await db.get<{ request_hash: string; status_code: number; response_json: string }>(
        'SELECT request_hash, status_code, response_json FROM idempotency_keys WHERE merchant_id = ? AND idem_key = ?',
        owner,
        key
      );
      if (!prior) break; // la primera falló y liberó la clave
      if (prior.request_hash !== requestHash) {
        return fail(res, 409, 'IDEMPOTENCY_KEY_REUSED', 'Esta clave de idempotencia ya se usó con otros datos.');
      }
      if (prior.status_code !== 0) {
        res.setHeader('Idempotent-Replayed', 'true');
        return res.status(prior.status_code).json(JSON.parse(prior.response_json));
      }
      const pending = inFlightIdem.get(mapKey);
      if (pending) {
        await Promise.race([pending, new Promise((r) => setTimeout(r, 200))]);
      } else {
        await new Promise((r) => setTimeout(r, 80));
      }
    }
    const finalPrior = await db.get<{ request_hash: string; status_code: number; response_json: string }>(
      'SELECT request_hash, status_code, response_json FROM idempotency_keys WHERE merchant_id = ? AND idem_key = ?',
      owner,
      key
    );
    if (finalPrior && finalPrior.request_hash === requestHash && finalPrior.status_code !== 0) {
      res.setHeader('Idempotent-Replayed', 'true');
      return res.status(finalPrior.status_code).json(JSON.parse(finalPrior.response_json));
    }
    return fail(res, 409, 'IDEMPOTENCY_IN_PROGRESS', 'Esta operación ya se está procesando. Espera un momento.');
  }

  let notifyDone!: () => void;
  inFlightIdem.set(mapKey, new Promise<void>((r) => { notifyDone = r; }));

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
      .finally(() => {
        inFlightIdem.delete(mapKey);
        notifyDone();
      })
      .then(() => originalJson(body));
    return res;
  };
  next();
}

/**
 * Idempotencia para operaciones de dinero (Idempotency-Key obligatorio): un
 * reintento con la misma clave y el mismo cuerpo devuelve la respuesta original
 * sin repetir la operación; con otro cuerpo responde 409.
 */
export async function idempotent(req: Request, res: Response, next: NextFunction) {
  return resolveIdempotent(req, res, next, { optional: false });
}

/**
 * Idempotencia opcional (PUT /limits, PUT /settlement-account): si se envía
 * Idempotency-Key deduplica peticiones repetidas o concurrentes; si no se envía, continúa.
 */
export async function optionalIdempotent(req: Request, res: Response, next: NextFunction) {
  return resolveIdempotent(req, res, next, { optional: true });
}

export type AdminRole = 'SUPER' | 'OPS' | 'READ';

declare global {
  namespace Express {
    interface Request {
      admin?: { role: AdminRole; actorId: string };
    }
  }
}

function safeEqualToken(candidate: string, expected: string): boolean {
  if (!candidate || !expected) return false;
  const a = Buffer.from(sha256Hex(candidate));
  const b = Buffer.from(sha256Hex(expected));
  return a.equals(b);
}

/**
 * P1-9: Rutas internas (operaciones, conciliación, riesgo) con separación de roles
 * y doble control opcional para acciones críticas.
 * - adminToken (KUOTA_ADMIN_TOKEN): rol SUPER (lectura + escritura).
 * - KUOTA_ADMIN_OPS_TOKEN: rol OPS (operaciones de revisión, reclamos, conciliación).
 * - KUOTA_ADMIN_READ_TOKEN: rol READ (solo consultas GET y corridas de conciliación programada).
 */
export function requireAdmin(adminToken: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    const header = headerString(req, 'authorization') ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
    if (!token) return fail(res, 401, 'ADMIN_REQUIRED', 'Credencial de operaciones requerida.');

    const opsToken = process.env.KUOTA_ADMIN_OPS_TOKEN ?? '';
    const readToken = process.env.KUOTA_ADMIN_READ_TOKEN ?? '';

    let role: AdminRole | null = null;
    if (safeEqualToken(token, adminToken)) role = 'SUPER';
    else if (opsToken && safeEqualToken(token, opsToken)) role = 'OPS';
    else if (readToken && safeEqualToken(token, readToken)) role = 'READ';

    if (!role) return fail(res, 401, 'ADMIN_REQUIRED', 'Credencial de operaciones requerida.');

    // Un token READ solo puede hacer GET o disparar la conciliación programada.
    if (role === 'READ' && req.method !== 'GET' && !req.path.startsWith('/reconciliation/')) {
      return fail(res, 403, 'ADMIN_ROLE_FORBIDDEN', 'Este token es de solo lectura.');
    }

    // Identidad del operador: cabecera autenticada X-Admin-Actor o prefijo criptográfico del token.
    const actorHeader = headerString(req, 'x-admin-actor')?.trim();
    const actorId = actorHeader && /^[A-Za-z0-9_.@-]{2,60}$/.test(actorHeader)
      ? actorHeader
      : `${role.toLowerCase()}:${sha256Hex(token).slice(0, 8)}`;

    req.admin = { role, actorId };
    next();
  };
}

/**
 * P1-9: Doble control (cuatro ojos) para operaciones internas críticas
 * (cambio de reglas de riesgo, apagado de funciones, revocación masiva de sesiones).
 * Cuando está configurado KUOTA_ADMIN_SECOND_TOKEN o KUOTA_REQUIRE_DUAL_CONTROL=1,
 * exige X-Admin-Second-Token (o X-Admin-Approver distinto del operador principal).
 */
export function requireDualControl(req: Request, res: Response, next: NextFunction) {
  const secondSecret = process.env.KUOTA_ADMIN_SECOND_TOKEN ?? '';
  const enforceDual = process.env.KUOTA_REQUIRE_DUAL_CONTROL === '1' || !!secondSecret;
  if (!enforceDual) return next();

  const secondToken = headerString(req, 'x-admin-second-token')?.trim() ?? '';
  const approver = headerString(req, 'x-admin-approver')?.trim() ?? '';
  const primaryActor = req.admin?.actorId ?? '';

  if (secondSecret && !safeEqualToken(secondToken, secondSecret)) {
    return fail(res, 403, 'DUAL_CONTROL_REQUIRED', 'Esta acción crítica requiere el segundo token de aprobación (X-Admin-Second-Token).');
  }
  if (!approver || approver === primaryActor) {
    return fail(res, 403, 'DUAL_CONTROL_REQUIRED', 'Esta acción crítica requiere un segundo aprobador distinto del solicitante (X-Admin-Approver).');
  }
  next();
}
