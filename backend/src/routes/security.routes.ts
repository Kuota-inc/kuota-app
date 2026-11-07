// Sesión del comercio (PIN + dispositivo), confirmación con PIN, cambio de PIN,
// dispositivos vinculados, límites de cobro y alertas de seguridad.
import { Router } from 'express';
import { paymentsDb as db } from '../db/client.js';
import { config } from '../security/config.js';
import { hashPin, pinProblem, verifyPin } from '../security/crypto.js';
import { audit } from '../security/audit.js';
import {
  checkPin,
  consumeStepUp,
  credentialFor,
  getDevice,
  getMerchant,
  grantStepUp,
  isValidDeviceId,
  issueSession,
  linkDevice,
  requireMerchant,
  resolveClaimedMerchant,
  revokeSessions,
  setMerchantPinHash,
  stepUpRequired
} from '../security/auth.js';
import { alertMerchant, recentAlerts } from '../security/events.js';
import { rateLimit } from '../security/guards.js';
import { clientIp, fail, headerString } from '../security/http.js';
import { effectiveLimits, usageToday, validLimitValues, type LimitValues } from '../security/limits.js';
import { addHours, formatLimaDateTime, formatSoles, nowIso } from '../security/time.js';

export const authRouter = Router();
export const paymentSecurityRouter = Router();

const authLimiter = rateLimit({ name: 'auth', windowMs: 60_000, max: 10 });

// Valida que el merchant_id del header siga existiendo en la DB (sin fallback a Carlos).
// La app lo llama al arrancar para detectar sesiones obsoletas después de un reset de DB.
authRouter.get('/me', async (req, res) => {
  const claimed = headerString(req, 'x-merchant-id');
  if (!claimed) return fail(res, 401, 'NOT_AUTHENTICATED', 'No hay sesión activa.');
  const merchant = await getMerchant(claimed);
  if (!merchant) return fail(res, 404, 'SESSION_EXPIRED', 'La sesión expiró. Vuelve a iniciar sesión.');
  res.json({ merchant_id: merchant.id, business_name: merchant.business_name });
});

// Estado del PIN del comercio (sin sesión: la app decide si pedirlo o crearlo).
authRouter.get('/pin/status', async (req, res) => {
  const merchant = await resolveClaimedMerchant(req);
  if (!merchant) return fail(res, 404, 'MERCHANT_NOT_FOUND', 'Comercio no encontrado.');
  const cred = await credentialFor(merchant.id);
  res.json({
    configured: !!cred,
    locked_until: cred?.locked_until && new Date(cred.locked_until) > new Date() ? cred.locked_until : null
  });
});

// Fallos de DNI por cuenta: sin esto, el DNI (semipúblico) se podría adivinar sin límite
// cambiando de IP. En memoria, igual que el limitador por IP.
const recoverFailures = new Map<string, { count: number; resetAt: number }>();
const RECOVER_MAX_FAILURES = 5;
const RECOVER_WINDOW_MS = 15 * 60_000;
const recoverLocked = (id: string) => {
  const f = recoverFailures.get(id);
  return !!f && f.resetAt > Date.now() && f.count >= RECOVER_MAX_FAILURES;
};
const recoverFailed = (id: string) => {
  const now = Date.now();
  const f = recoverFailures.get(id);
  if (!f || f.resetAt <= now) recoverFailures.set(id, { count: 1, resetAt: now + RECOVER_WINDOW_MS });
  else f.count += 1;
};

// Recuperar acceso: verifica teléfono + DNI → resetea PIN → emite sesión.
// No requiere PIN actual; la identidad se prueba con el DNI del registro.
authRouter.post('/pin/recover', authLimiter, async (req, res) => {
  const rawPhone = typeof req.body?.phone === 'string' ? req.body.phone.trim() : '';
  const dni      = typeof req.body?.dni   === 'string' ? req.body.dni.trim()   : '';
  const newPin   = req.body?.new_pin;
  const deviceId = req.body?.device_id;
  const ip       = clientIp(req);

  if (!rawPhone || !dni) return fail(res, 422, 'MISSING_FIELDS', 'Se requiere teléfono y DNI.');
  const pinErr = pinProblem(newPin);
  if (pinErr) return fail(res, 422, 'PIN_WEAK', pinErr);
  if (!isValidDeviceId(deviceId)) return fail(res, 422, 'DEVICE_ID_INVALID', 'Identificador de dispositivo inválido.');

  const phone = rawPhone.startsWith('+51') ? rawPhone : `+51${rawPhone.replace(/\D/g, '').slice(-9)}`;

  // Buscar por teléfono completo (JOIN con users)
  let profile = await db.prepare(`
    SELECT m.id, m.dni FROM merchant_profiles m
    JOIN users u ON u.id = m.user_id
    WHERE u.phone = ?
    LIMIT 1
  `).get<{ id: string; dni: string | null }>(phone);

  // Fallback: estado inconsistente (user_id nunca se enlazó), buscar por merchant_profiles.phone
  if (!profile) {
    const short = phone.slice(3);
    if (short.length === 9) {
      profile = await db.prepare(`
        SELECT id, dni FROM merchant_profiles
        WHERE phone = ?
        ORDER BY (user_id IS NOT NULL) DESC
        LIMIT 1
      `).get<{ id: string; dni: string | null }>(short);
    }
  }

  // Misma respuesta si la cuenta no existe o el DNI no coincide: no revela qué teléfonos están registrados.
  const mismatch = () => fail(res, 403, 'DNI_MISMATCH', 'Los datos no coinciden. Verifica tu número y tu DNI.');
  if (!profile) return mismatch();

  if (recoverLocked(profile.id)) {
    await audit({ actorType: 'MERCHANT', actorId: profile.id, action: 'PIN_RESET', result: 'DENIED', ip, deviceId, details: { reason: 'RECOVERY_LOCKED' } });
    return fail(res, 429, 'RECOVERY_LOCKED', 'Demasiados intentos. Inténtalo de nuevo en 15 minutos.');
  }
  if (!profile.dni || profile.dni.replace(/\D/g, '') !== dni.replace(/\D/g, '')) {
    recoverFailed(profile.id);
    await audit({ actorType: 'MERCHANT', actorId: profile.id, action: 'PIN_RESET', result: 'DENIED', ip, deviceId, details: { reason: 'DNI_MISMATCH' } });
    return mismatch();
  }

  const merchant = await getMerchant(profile.id);
  if (!merchant) return mismatch();

  // Un dispositivo desvinculado no puede usar la recuperación para volver a entrar.
  const existing = await getDevice(merchant.id, deviceId);
  if (existing?.revoked_at) {
    await audit({ actorType: 'MERCHANT', actorId: merchant.id, action: 'PIN_RESET', result: 'DENIED', ip, deviceId, details: { reason: 'DEVICE_REVOKED' } });
    return fail(res, 403, 'DEVICE_REVOKED', 'Este dispositivo fue desvinculado de tu cuenta. Comunícate con Kuota por el WhatsApp oficial.');
  }

  const cooldownUntil = addHours(new Date(), config.cooldownHours).toISOString();
  await setMerchantPinHash(merchant.id, hashPin(newPin));
  await db.prepare('UPDATE merchant_credentials SET cooldown_until = ? WHERE merchant_id = ?').run(cooldownUntil, merchant.id);
  const closed = await revokeSessions(merchant.id);
  recoverFailures.delete(merchant.id);

  const label = typeof req.body?.device_label === 'string' ? req.body.device_label.replace(/[\u0000-\u001f<>]/g, '').slice(0, 60) : null;
  const device = await linkDevice(merchant.id, deviceId, label, ip);
  const session = await issueSession(merchant.id, deviceId);
  await audit({ actorType: 'MERCHANT', actorId: merchant.id, action: 'PIN_RESET', result: 'OK', ip, deviceId, details: { method: 'DNI_RECOVERY', sessions_closed: closed, cooldown_until: cooldownUntil } });
  await alertMerchant(
    merchant.id,
    'PIN_CHANGED',
    'Restableciste tu PIN con tu DNI',
    `Cerramos tus otras sesiones y tus límites estarán reducidos por ${config.cooldownHours} horas. Si no fuiste tú, escríbenos de inmediato.`
  );
  res.status(201).json({
    access_token: session.accessToken,
    token_type: 'Bearer',
    expires_at: session.expiresAt,
    merchant_id: merchant.id,
    device: { new_device: device.isNew, cooldown_until: device.cooldownUntil ?? null }
  });
});

// Abrir sesión: PIN + dispositivo. Sesión corta (15 min) ligada al dispositivo.
authRouter.post('/sessions', authLimiter, async (req, res) => {
  const merchant = await resolveClaimedMerchant(req);
  if (!merchant) return fail(res, 404, 'MERCHANT_NOT_FOUND', 'Comercio no encontrado.');
  const { device_id: deviceId } = req.body ?? {};
  if (!isValidDeviceId(deviceId)) return fail(res, 422, 'DEVICE_ID_INVALID', 'Identificador de dispositivo inválido.');
  const label = typeof req.body?.device_label === 'string' ? req.body.device_label.replace(/[\u0000-\u001f<>]/g, '').slice(0, 60) : null;
  const ip = clientIp(req);

  const existing = await getDevice(merchant.id, deviceId);
  if (existing?.revoked_at) {
    await audit({ actorType: 'MERCHANT', actorId: merchant.id, action: 'SESSION_OPEN', result: 'DENIED', ip, deviceId, details: { reason: 'DEVICE_REVOKED' } });
    return fail(res, 403, 'DEVICE_REVOKED', 'Este dispositivo fue desvinculado de tu cuenta. Comunícate con Kuota por el WhatsApp oficial.');
  }
  const check = await checkPin(merchant.id, req.body?.pin, { ip, deviceId, purpose: 'SESSION_OPEN' });
  if (!check.ok) return fail(res, check.status, check.code, check.message, check.extra);

  const device = await linkDevice(merchant.id, deviceId, label, ip);
  if (device.revoked) return fail(res, 403, 'DEVICE_REVOKED', 'Este dispositivo fue desvinculado de tu cuenta.');
  const session = await issueSession(merchant.id, deviceId);
  await audit({ actorType: 'MERCHANT', actorId: merchant.id, action: 'SESSION_OPEN', target: session.sessionId, result: 'OK', ip, deviceId, details: { new_device: device.isNew } });
  res.status(201).json({
    access_token: session.accessToken,
    token_type: 'Bearer',
    expires_at: session.expiresAt,
    merchant_id: merchant.id,
    device: { new_device: device.isNew, cooldown_until: device.cooldownUntil ?? null }
  });
});

authRouter.delete('/sessions/current', requireMerchant, async (req, res) => {
  const auth = req.auth!;
  await db.prepare('UPDATE merchant_sessions SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL').run(nowIso(), auth.sessionId);
  await audit({ actorType: 'MERCHANT', actorId: auth.merchantId, action: 'SESSION_CLOSE', target: auth.sessionId, result: 'OK', ip: clientIp(req), deviceId: auth.deviceId });
  res.status(204).end();
});

// Confirmación reforzada: PIN + resumen de la acción → permiso de un solo uso.
authRouter.post('/step-up', authLimiter, requireMerchant, async (req, res) => {
  const result = await grantStepUp(req, req.auth!, req.body?.pin, req.body?.action, req.body?.params);
  if (!result.ok) return fail(res, result.status, result.code, result.message, 'extra' in result ? result.extra : {});
  res.status(201).json({ step_up_token: result.token, expires_at: result.expiresAt, summary: result.summary, consent_id: result.consentId });
});

// Cambio de PIN: exige el PIN actual; cierra las demás sesiones y aplica enfriamiento.
authRouter.post('/pin/change', authLimiter, requireMerchant, async (req, res) => {
  const auth = req.auth!;
  const ip = clientIp(req);
  const check = await checkPin(auth.merchantId, req.body?.current_pin, { ip, deviceId: auth.deviceId, purpose: 'PIN_CHANGE' });
  if (!check.ok) return fail(res, check.status, check.code, check.message, check.extra);
  const newPin = req.body?.new_pin;
  const problem = pinProblem(newPin);
  if (problem) return fail(res, 422, 'PIN_WEAK', problem);
  const cred = (await credentialFor(auth.merchantId))!;
  if (verifyPin(newPin, cred.pin_hash)) return fail(res, 422, 'PIN_UNCHANGED', 'El nuevo PIN debe ser distinto del actual.');

  const cooldownUntil = addHours(new Date(), config.cooldownHours).toISOString();
  await db.prepare('UPDATE merchant_credentials SET pin_hash = ?, pin_updated_at = ?, cooldown_until = ?, failed_attempts = 0, locked_until = NULL WHERE merchant_id = ?').run(
    hashPin(newPin),
    nowIso(),
    cooldownUntil,
    auth.merchantId
  );
  const closed = await revokeSessions(auth.merchantId, { exceptSessionId: auth.sessionId });
  await audit({ actorType: 'MERCHANT', actorId: auth.merchantId, action: 'PIN_CHANGED', result: 'OK', ip, deviceId: auth.deviceId, details: { sessions_closed: closed, cooldown_until: cooldownUntil } });
  await alertMerchant(
    auth.merchantId,
    'PIN_CHANGED',
    'Cambiaste tu PIN de seguridad',
    `Cerramos tus otras sesiones y tus límites estarán reducidos por ${config.cooldownHours} horas. Si no fuiste tú, escríbenos de inmediato.`
  );
  res.json({ success: true, sessions_closed: closed, cooldown_until: cooldownUntil });
});

// ------------------------------------------------ /merchants/me/payments/...
paymentSecurityRouter.use(requireMerchant);

paymentSecurityRouter.get('/limits', async (req, res) => {
  const merchant = (await getMerchant(req.auth!.merchantId))!;
  res.json({ ...await effectiveLimits(merchant, req.auth!.deviceId), usage_today: await usageToday(merchant.id) });
});

// Bajar un límite rige de inmediato; subirlo exige PIN y entra en vigor tras la espera.
paymentSecurityRouter.put('/limits', async (req, res) => {
  const auth = req.auth!;
  const merchant = (await getMerchant(auth.merchantId))!;
  const requested = validLimitValues(req.body);
  if (!requested) return fail(res, 422, 'LIMITS_INVALID', 'Ingresa montos y cantidades válidos.');
  const current = await effectiveLimits(merchant, auth.deviceId);
  const max = current.tier_max;
  if (requested.per_tx_cents > max.per_tx_cents || requested.daily_cents > max.daily_cents || requested.daily_count > max.daily_count) {
    return fail(res, 422, 'ABOVE_TIER', `Tu nivel ${current.tier_label} permite hasta ${formatSoles(max.per_tx_cents)} por cobro y ${formatSoles(max.daily_cents)} por día. Completa la verificación ampliada para subirlos.`, { tier_max: max });
  }
  if (requested.per_tx_cents > requested.daily_cents) {
    return fail(res, 422, 'LIMITS_INCONSISTENT', 'El límite por cobro no puede ser mayor que el diario.');
  }
  const own = current.own;
  const keys: (keyof LimitValues)[] = ['per_tx_cents', 'daily_cents', 'daily_count'];
  const raises = keys.filter((k) => requested[k] > own[k]);
  const now = new Date();

  let consentId: string | null = null;
  if (raises.length) {
    consentId = await consumeStepUp(req, 'RAISE_LIMITS', { ...requested });
    if (!consentId) return stepUpRequired(res, 'RAISE_LIMITS', { ...requested });
  }
  // Las bajas se aplican ya; las subidas quedan pendientes con fecha de vigencia.
  const immediate: LimitValues = {
    per_tx_cents: Math.min(requested.per_tx_cents, own.per_tx_cents),
    daily_cents: Math.min(requested.daily_cents, own.daily_cents),
    daily_count: Math.min(requested.daily_count, own.daily_count)
  };
  const effectiveAt = raises.length ? addHours(now, config.limitRaiseDelayHours).toISOString() : null;
  await db.prepare(`
    INSERT INTO merchant_limit_settings (merchant_id, per_tx_cents, daily_cents, daily_count, pending_json, pending_effective_at, updated_at)
    VALUES (@m, @per_tx_cents, @daily_cents, @daily_count, @pending, @effective_at, @now)
    ON CONFLICT(merchant_id) DO UPDATE SET
      per_tx_cents = excluded.per_tx_cents, daily_cents = excluded.daily_cents, daily_count = excluded.daily_count,
      pending_json = excluded.pending_json, pending_effective_at = excluded.pending_effective_at, updated_at = excluded.updated_at
  `).run({ m: merchant.id, ...immediate, pending: raises.length ? JSON.stringify(requested) : null, effective_at: effectiveAt, now: now.toISOString() });

  await audit({ actorType: 'MERCHANT', actorId: merchant.id, action: 'LIMITS_CHANGED', result: 'OK', ip: clientIp(req), deviceId: auth.deviceId, details: { requested, applied_now: immediate, raise_effective_at: effectiveAt, consent_id: consentId } });
  await alertMerchant(
    merchant.id,
    'LIMITS_CHANGED',
    raises.length ? 'Pediste subir tus límites de cobro' : 'Bajaste tus límites de cobro',
    raises.length
      ? `Si no fuiste tú, cancélalas desde Perfil › Límites de cobro. Rigen desde el ${formatLimaDateTime(effectiveAt!)}`
      : 'El cambio ya está activo.'
  );
  res.json({ ...await effectiveLimits(merchant, auth.deviceId), usage_today: await usageToday(merchant.id) });
});

// Cancelar una subida pendiente (protege: no requiere PIN).
paymentSecurityRouter.delete('/limits/pending', async (req, res) => {
  const auth = req.auth!;
  await db.prepare('UPDATE merchant_limit_settings SET pending_json = NULL, pending_effective_at = NULL, updated_at = ? WHERE merchant_id = ?').run(nowIso(), auth.merchantId);
  await audit({ actorType: 'MERCHANT', actorId: auth.merchantId, action: 'LIMITS_RAISE_CANCELLED', result: 'OK', ip: clientIp(req), deviceId: auth.deviceId });
  const merchant = (await getMerchant(auth.merchantId))!;
  res.json({ ...await effectiveLimits(merchant, auth.deviceId), usage_today: await usageToday(merchant.id) });
});

paymentSecurityRouter.get('/devices', async (req, res) => {
  const auth = req.auth!;
  const rows = await db
    .prepare('SELECT device_id, label, first_seen_at, last_seen_at, cooldown_until FROM merchant_devices WHERE merchant_id = ? AND revoked_at IS NULL ORDER BY last_seen_at DESC')
    .all(auth.merchantId) as { device_id: string; label: string | null; first_seen_at: string; last_seen_at: string; cooldown_until: string | null }[];
  res.json({
    data: rows.map((d) => ({
      // Para mostrar basta el sufijo; `ref` sirve para desvincular (el actual no se desvincula).
      id_suffix: d.device_id.slice(-6),
      ref: d.device_id === auth.deviceId ? 'current' : d.device_id,
      label: d.label ?? 'Dispositivo',
      current: d.device_id === auth.deviceId,
      first_seen_at: d.first_seen_at,
      last_seen_at: d.last_seen_at,
      cooldown_until: d.cooldown_until && new Date(d.cooldown_until) > new Date() ? d.cooldown_until : null
    }))
  });
});

// Desvincular otro dispositivo: cierra sus sesiones (cierre remoto). Exige PIN.
paymentSecurityRouter.delete('/devices/:deviceId', async (req, res) => {
  const auth = req.auth!;
  const deviceId = req.params.deviceId;
  if (deviceId === 'current' || deviceId === auth.deviceId) {
    return fail(res, 409, 'CANNOT_REVOKE_CURRENT', 'No puedes desvincular el dispositivo que estás usando.');
  }
  const device = isValidDeviceId(deviceId) ? await getDevice(auth.merchantId, deviceId) : null;
  if (!device || device.revoked_at) return fail(res, 404, 'DEVICE_NOT_FOUND', 'Dispositivo no encontrado.');
  const consentId = await consumeStepUp(req, 'REVOKE_DEVICE', { device_id: deviceId });
  if (!consentId) return stepUpRequired(res, 'REVOKE_DEVICE', { device_id: deviceId });
  await db.prepare('UPDATE merchant_devices SET revoked_at = ? WHERE merchant_id = ? AND device_id = ?').run(nowIso(), auth.merchantId, deviceId);
  const closed = await revokeSessions(auth.merchantId, { deviceId });
  await audit({ actorType: 'MERCHANT', actorId: auth.merchantId, action: 'DEVICE_REVOKED', target: deviceId, result: 'OK', ip: clientIp(req), deviceId: auth.deviceId, details: { sessions_closed: closed, consent_id: consentId } });
  await alertMerchant(auth.merchantId, 'DEVICE_REVOKED', 'Desvinculaste un dispositivo', `${device.label ?? 'El dispositivo'} ya no puede operar tu cuenta.`);
  res.json({ success: true, sessions_closed: closed });
});

paymentSecurityRouter.get('/alerts', async (req, res) => {
  res.json({ data: await recentAlerts(req.auth!.merchantId) });
});
