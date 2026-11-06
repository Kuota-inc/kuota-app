// Autenticación del comercio en Kuota Payments: PIN (hash + bloqueo), sesiones
// cortas ligadas al dispositivo, vinculación de dispositivos con enfriamiento,
// confirmación reforzada (step-up) por acción y registro de consentimiento.
import type { NextFunction, Request, Response } from 'express';
import { paymentsDb as db } from '../db/client.js';
import { config, secrets } from './config.js';
import { canonicalJson, hmac, isPinHash, randomId, randomToken, safeEqual, sha256Hex, verifyPin } from './crypto.js';
import { audit } from './audit.js';
import { alertMerchant } from './events.js';
import { clientIp, fail, headerString, type MerchantAuth } from './http.js';
import { addHours, addMinutes, formatSoles, nowIso } from './time.js';

export interface MerchantRow {
  id: string;
  business_name: string | null;
  kyc_status: string | null;
  user_id: string | null;
  session_id: string | null;
  ruc: string | null;
  city: string | null;
}

export async function getMerchant(id: string): Promise<MerchantRow | null> {
  return (await db.prepare('SELECT * FROM merchant_profiles WHERE id = ?').get(id) as MerchantRow | undefined) ?? null;
}

/**
 * Identidad del comercio ANTES de autenticarse. Prioridad:
 * 1. X-Merchant-Id header (dispositivo que ya inició sesión antes)
 * 2. body.phone → busca el perfil por teléfono (dispositivo nuevo o datos borrados)
 * 3. fallback demo mer_carlos
 * Lo que protege la cuenta es el PIN; el merchant_id solo identifica al titular.
 */
export async function resolveClaimedMerchant(req: Request): Promise<MerchantRow | null> {
  const claimed = headerString(req, 'x-merchant-id') || (typeof req.body?.merchant_id === 'string' ? req.body.merchant_id : '');
  if (claimed) {
    const merchant = await getMerchant(claimed);
    if (merchant) return merchant;
    // ID obsoleto (DB reseteada, cuenta eliminada): no devolver null, seguir con el teléfono.
  }

  // Buscar por users.phone (formato +51XXXXXXXXX) → merchant_profiles.user_id.
  // merchant_profiles.phone guarda solo 9 dígitos; users.phone guarda el número completo.
  const phone = typeof req.body?.phone === 'string' ? req.body.phone.trim() : '';
  if (phone) {
    const row = await db.prepare(`
      SELECT m.id FROM merchant_profiles m
      JOIN users u ON u.id = m.user_id
      WHERE u.phone = ?
    `).get<{ id: string }>(phone);
    if (row?.id) return getMerchant(row.id);
  }

  return getMerchant('mer_carlos');
}

const DEVICE_ID = /^[A-Za-z0-9_-]{16,64}$/;
export const isValidDeviceId = (v: unknown): v is string => typeof v === 'string' && DEVICE_ID.test(v);

// ----------------------------------------------------------------- PIN

interface Credential {
  merchant_id: string;
  pin_hash: string;
  failed_attempts: number;
  locked_until: string | null;
  cooldown_until: string | null;
}

export async function credentialFor(merchantId: string): Promise<Credential | null> {
  const cred = await db.prepare('SELECT * FROM merchant_credentials WHERE merchant_id = ?').get(merchantId) as Credential | undefined;
  if (cred) return cred;
  // PIN creado en el onboarding después del arranque: se adopta como credencial.
  const row = await db
    .prepare(`
      SELECT COALESCE(u.security_pin, s.security_pin) AS pin_hash
      FROM merchant_profiles m
      LEFT JOIN users u ON u.id = m.user_id
      LEFT JOIN onboarding_sessions s ON s.id = m.session_id
      WHERE m.id = ?
    `)
    .get(merchantId) as { pin_hash: string | null } | undefined;
  if (!row?.pin_hash || !isPinHash(row.pin_hash)) return null;
  await db.prepare('INSERT INTO merchant_credentials (merchant_id, pin_hash, pin_updated_at) VALUES (?, ?, ?) ON CONFLICT DO NOTHING').run(
    merchantId,
    row.pin_hash,
    nowIso()
  );
  return credentialFor(merchantId);
}

/** Registra (o reemplaza) el PIN de cobro de un comercio; lo usa el onboarding. */
export async function setMerchantPinHash(merchantId: string, pinHash: string) {
  await db.run(
    `INSERT INTO merchant_credentials (merchant_id, pin_hash, pin_updated_at) VALUES (?, ?, ?)
     ON CONFLICT (merchant_id) DO UPDATE SET pin_hash = excluded.pin_hash, pin_updated_at = excluded.pin_updated_at,
       failed_attempts = 0, locked_until = NULL`,
    merchantId,
    pinHash,
    nowIso()
  );
}

export type PinCheck =
  | { ok: true }
  | { ok: false; status: number; code: string; message: string; extra?: Record<string, unknown> };

export async function checkPin(merchantId: string, pin: unknown, ctx: { ip: string; deviceId?: string; purpose: string }): Promise<PinCheck> {
  const cred = await credentialFor(merchantId);
  const base = { actorType: 'MERCHANT' as const, actorId: merchantId, ip: ctx.ip, deviceId: ctx.deviceId };
  if (!cred) {
    return { ok: false, status: 409, code: 'PIN_NOT_CONFIGURED', message: 'Aún no configuraste tu PIN de seguridad.' };
  }
  const now = new Date();
  if (cred.locked_until && new Date(cred.locked_until) > now) {
    const minutes = Math.ceil((new Date(cred.locked_until).getTime() - now.getTime()) / 60_000);
    await audit({ ...base, action: 'PIN_CHECK', target: ctx.purpose, result: 'DENIED', details: { reason: 'LOCKED' } });
    return {
      ok: false,
      status: 423,
      code: 'PIN_LOCKED',
      message: `Bloqueamos el PIN por varios intentos fallidos. Inténtalo en ${minutes} min.`,
      extra: { locked_until: cred.locked_until }
    };
  }
  if (typeof pin !== 'string' || !/^\d{6}$/.test(pin) || !verifyPin(pin, cred.pin_hash)) {
    // Incremento atómico: intentos simultáneos no se pierden.
    const bumped = await db.get<{ failed_attempts: number }>(
      'UPDATE merchant_credentials SET failed_attempts = failed_attempts + 1 WHERE merchant_id = ? RETURNING failed_attempts',
      merchantId
    );
    const attempts = bumped?.failed_attempts ?? cred.failed_attempts + 1;
    if (attempts >= config.pinMaxAttempts) {
      const lockedUntil = addMinutes(now, config.pinLockMinutes).toISOString();
      await db.prepare('UPDATE merchant_credentials SET failed_attempts = 0, locked_until = ? WHERE merchant_id = ?').run(lockedUntil, merchantId);
      await audit({ ...base, action: 'PIN_LOCKED', target: ctx.purpose, result: 'DENIED', details: { attempts } });
      await alertMerchant(
        merchantId,
        'PIN_LOCKED',
        'Bloqueamos tu PIN por intentos fallidos',
        'Si no fuiste tú, alguien intentó usar tu cuenta. Kuota nunca te pedirá tu PIN por WhatsApp ni por llamada.'
      );
      return {
        ok: false,
        status: 423,
        code: 'PIN_LOCKED',
        message: `Bloqueamos el PIN por ${config.pinLockMinutes} min por varios intentos fallidos.`,
        extra: { locked_until: lockedUntil }
      };
    }
    await audit({ ...base, action: 'PIN_CHECK', target: ctx.purpose, result: 'DENIED', details: { attempts } });
    const left = config.pinMaxAttempts - attempts;
    return {
      ok: false,
      status: 401,
      code: 'PIN_INVALID',
      message: `PIN incorrecto. Te queda${left === 1 ? '' : 'n'} ${left} intento${left === 1 ? '' : 's'}.`,
      extra: { attempts_left: left }
    };
  }
  if (cred.failed_attempts > 0 || cred.locked_until) {
    await db.prepare('UPDATE merchant_credentials SET failed_attempts = 0, locked_until = NULL WHERE merchant_id = ?').run(merchantId);
  }
  return { ok: true };
}

// ----------------------------------------------------------- dispositivos

interface DeviceRow {
  merchant_id: string;
  device_id: string;
  label: string | null;
  first_seen_at: string;
  last_seen_at: string;
  cooldown_until: string | null;
  revoked_at: string | null;
}

export async function getDevice(merchantId: string, deviceId: string): Promise<DeviceRow | null> {
  return (
    (await db.prepare('SELECT * FROM merchant_devices WHERE merchant_id = ? AND device_id = ?').get(merchantId, deviceId) as
      | DeviceRow
      | undefined) ?? null
  );
}

/** Vincula el dispositivo. Uno nuevo (si ya hay otro) entra en enfriamiento con límites reducidos. */
export function linkDevice(merchantId: string, deviceId: string, label: string | null, ip: string) {
  // Serializado por comercio: dos primeros ingresos simultáneos no se saltan el enfriamiento.
  return db.tx(async () => {
    await db.lock(`devices:${merchantId}`);
    return linkDeviceLocked(merchantId, deviceId, label, ip);
  });
}

async function linkDeviceLocked(merchantId: string, deviceId: string, label: string | null, ip: string) {
  const existing = await getDevice(merchantId, deviceId);
  const now = new Date();
  if (existing) {
    if (existing.revoked_at) return { revoked: true as const };
    await db.prepare('UPDATE merchant_devices SET last_seen_at = ?, label = COALESCE(?, label) WHERE merchant_id = ? AND device_id = ?').run(
      now.toISOString(),
      label,
      merchantId,
      deviceId
    );
    return { revoked: false as const, isNew: false, cooldownUntil: existing.cooldown_until };
  }
  const others = (
    await db.prepare('SELECT COUNT(*) AS n FROM merchant_devices WHERE merchant_id = ? AND revoked_at IS NULL').get(merchantId) as { n: number }
  ).n;
  const cooldownUntil = others > 0 ? addHours(now, config.cooldownHours).toISOString() : null;
  await db.prepare(`
    INSERT INTO merchant_devices (merchant_id, device_id, label, first_seen_at, last_seen_at, cooldown_until)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(merchantId, deviceId, label, now.toISOString(), now.toISOString(), cooldownUntil);
  await audit({ actorType: 'MERCHANT', actorId: merchantId, action: 'DEVICE_LINKED', target: deviceId, result: 'OK', ip, deviceId, details: { cooldown_until: cooldownUntil } });
  if (others > 0) {
    await alertMerchant(
      merchantId,
      'NEW_DEVICE',
      'Se vinculó un dispositivo nuevo a tu cuenta',
      `${label || 'Un dispositivo'} ingresó con tu PIN. Por seguridad, tus límites de cobro estarán reducidos por ${config.cooldownHours} horas. Si no fuiste tú, desvincúlalo desde Perfil › Dispositivos.`,
      deviceId
    );
  }
  return { revoked: false as const, isNew: true, cooldownUntil };
}

// --------------------------------------------------------------- sesiones

interface SessionPayload {
  sid: string;
  mid: string;
  did: string;
  exp: number;
}

function signSession(payload: SessionPayload): string {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `ks1.${body}.${hmac(secrets.sessionSecret, `ks1.${body}`, 'base64url')}`;
}

function parseSession(token: string): SessionPayload | null {
  const parts = token.split('.');
  if (parts.length !== 3 || parts[0] !== 'ks1') return null;
  const expected = hmac(secrets.sessionSecret, `ks1.${parts[1]}`, 'base64url');
  if (!safeEqual(parts[2], expected)) return null;
  try {
    const p = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) as SessionPayload;
    if (typeof p.exp !== 'number' || p.exp * 1000 < Date.now()) return null;
    return p;
  } catch {
    return null;
  }
}

export async function issueSession(merchantId: string, deviceId: string) {
  const sid = randomId('ses', 12);
  const now = new Date();
  const expires = new Date(now.getTime() + config.sessionTtlSec * 1000);
  await db.prepare('INSERT INTO merchant_sessions (id, merchant_id, device_id, created_at, expires_at) VALUES (?, ?, ?, ?, ?)').run(
    sid,
    merchantId,
    deviceId,
    now.toISOString(),
    expires.toISOString()
  );
  const token = signSession({ sid, mid: merchantId, did: deviceId, exp: Math.floor(expires.getTime() / 1000) });
  return { sessionId: sid, accessToken: token, expiresAt: expires.toISOString() };
}

export async function revokeSessions(merchantId: string, opts: { exceptSessionId?: string; deviceId?: string } = {}) {
  const now = nowIso();
  if (opts.deviceId) {
    return (await db
      .prepare('UPDATE merchant_sessions SET revoked_at = ? WHERE merchant_id = ? AND device_id = ? AND revoked_at IS NULL')
      .run(now, merchantId, opts.deviceId)).changes;
  }
  return (await db
    .prepare('UPDATE merchant_sessions SET revoked_at = ? WHERE merchant_id = ? AND revoked_at IS NULL AND id IS DISTINCT FROM ?')
    .run(now, merchantId, opts.exceptSessionId ?? null)).changes;
}

/** Exige sesión válida, no revocada y del mismo dispositivo que la abrió. */
export async function requireMerchant(req: Request, res: Response, next: NextFunction) {
  const header = headerString(req, 'authorization');
  if (!header?.startsWith('Bearer ')) {
    return fail(res, 401, 'SESSION_REQUIRED', 'Ingresa tu PIN para continuar.');
  }
  const payload = parseSession(header.slice(7).trim());
  if (!payload) return fail(res, 401, 'SESSION_EXPIRED', 'Tu sesión venció. Ingresa tu PIN otra vez.');
  const deviceId = headerString(req, 'x-device-id');
  if (!deviceId || deviceId !== payload.did) {
    return fail(res, 401, 'DEVICE_MISMATCH', 'Esta sesión pertenece a otro dispositivo. Ingresa tu PIN otra vez.');
  }
  const session = await db.prepare('SELECT revoked_at, expires_at FROM merchant_sessions WHERE id = ?').get(payload.sid) as
    | { revoked_at: string | null; expires_at: string }
    | undefined;
  const device = await getDevice(payload.mid, payload.did);
  if (!session || session.revoked_at || new Date(session.expires_at) < new Date() || !device || device.revoked_at) {
    return fail(res, 401, 'SESSION_REVOKED', 'Tu sesión fue cerrada. Ingresa tu PIN otra vez.');
  }
  req.auth = { merchantId: payload.mid, sessionId: payload.sid, deviceId: payload.did };
  next();
}

// ------------------------------------------------- step-up y consentimiento

export type StepUpAction = 'CREATE_LINK' | 'RAISE_LIMITS' | 'REVOKE_DEVICE';
export const STEP_UP_ACTIONS: StepUpAction[] = ['CREATE_LINK', 'RAISE_LIMITS', 'REVOKE_DEVICE'];

type Params = Record<string, string | number>;

/** Resumen que ve el comercio y que queda en su registro de consentimiento. */
export function describeAction(action: StepUpAction, params: Params): string | null {
  const n = (k: string) => (typeof params[k] === 'number' && Number.isInteger(params[k]) && (params[k] as number) > 0 ? (params[k] as number) : null);
  switch (action) {
    case 'CREATE_LINK': {
      const amount = n('amount_cents');
      return amount ? `Crear un link de cobro por ${formatSoles(amount)}` : null;
    }
    case 'RAISE_LIMITS': {
      const perTx = n('per_tx_cents');
      const daily = n('daily_cents');
      const count = n('daily_count');
      if (!perTx || !daily || !count) return null;
      return `Cambiar tus límites a ${formatSoles(perTx)} por cobro, ${formatSoles(daily)} por día y ${count} cobros por día (las subidas rigen en ${config.limitRaiseDelayHours} h)`;
    }
    case 'REVOKE_DEVICE': {
      const id = params.device_id;
      return typeof id === 'string' && isValidDeviceId(id) ? 'Cerrar sesión y desvincular un dispositivo de tu cuenta' : null;
    }
  }
}

const paramsHash = (action: string, params: Params) => sha256Hex(`${action}|${canonicalJson(params)}`);

export function stepUpRequired(res: Response, action: StepUpAction, params: Params, reason?: string) {
  return fail(res, 403, 'STEP_UP_REQUIRED', 'Confirma esta operación con tu PIN.', {
    step_up: { action, params, summary: describeAction(action, params), reason: reason ?? null }
  });
}

/** Verifica el PIN, registra el consentimiento y emite un permiso de un solo uso para esa acción exacta. */
export async function grantStepUp(req: Request, auth: MerchantAuth, pin: unknown, action: unknown, params: unknown) {
  if (typeof action !== 'string' || !STEP_UP_ACTIONS.includes(action as StepUpAction)) {
    return { ok: false as const, status: 422, code: 'ACTION_INVALID', message: 'Acción no reconocida.' };
  }
  if (!params || typeof params !== 'object' || Array.isArray(params)) {
    return { ok: false as const, status: 422, code: 'PARAMS_INVALID', message: 'Parámetros de la acción inválidos.' };
  }
  const p = params as Params;
  const summary = describeAction(action as StepUpAction, p);
  if (!summary) return { ok: false as const, status: 422, code: 'PARAMS_INVALID', message: 'Parámetros de la acción inválidos.' };

  const ip = clientIp(req);
  const check = await checkPin(auth.merchantId, pin, { ip, deviceId: auth.deviceId, purpose: `STEP_UP:${action}` });
  if (!check.ok) return check;

  const now = new Date();
  const consentId = randomId('cns', 10);
  await db.prepare(`
    INSERT INTO consent_records (id, merchant_id, device_id, session_id, action, summary, params_json, ip, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(consentId, auth.merchantId, auth.deviceId, auth.sessionId, action, summary, canonicalJson(p), ip, now.toISOString());

  const token = randomToken(24);
  const expiresAt = new Date(now.getTime() + config.stepUpTtlSec * 1000).toISOString();
  await db.prepare(`
    INSERT INTO step_up_grants (id, session_id, merchant_id, action, params_hash, consent_id, expires_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(sha256Hex(token), auth.sessionId, auth.merchantId, action, paramsHash(action, p), consentId, expiresAt);

  await audit({ actorType: 'MERCHANT', actorId: auth.merchantId, action: 'STEP_UP_GRANTED', target: action, result: 'OK', ip, deviceId: auth.deviceId, details: { consent_id: consentId, summary } });
  return { ok: true as const, token, expiresAt, summary, consentId };
}

/** Consume el permiso de X-Step-Up-Token si coincide con esta sesión, acción y parámetros. */
export async function consumeStepUp(req: Request, action: StepUpAction, params: Params): Promise<string | null> {
  const token = headerString(req, 'x-step-up-token');
  if (!token || !req.auth) return null;
  const grant = await db.prepare('SELECT * FROM step_up_grants WHERE id = ?').get(sha256Hex(token)) as
    | { session_id: string; action: string; params_hash: string; consent_id: string; expires_at: string; used_at: string | null }
    | undefined;
  if (
    !grant ||
    grant.used_at ||
    grant.session_id !== req.auth.sessionId ||
    grant.action !== action ||
    grant.params_hash !== paramsHash(action, params) ||
    new Date(grant.expires_at) < new Date()
  ) {
    return null;
  }
  const used = await db.prepare('UPDATE step_up_grants SET used_at = ? WHERE id = ? AND used_at IS NULL').run(nowIso(), sha256Hex(token));
  return used.changes === 1 ? grant.consent_id : null;
}
