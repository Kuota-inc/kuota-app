// Kuota Payments para el perfil Provider.
//
// Kuota Payments es de la persona, no del perfil: el proveedor vende con el mismo flujo que el
// Emprendedor (link/QR, comisión, plan, límites, antifraude). Un proveedor que se registró solo
// como proveedor no tenía cuenta de cobros; aquí se le crea una (misma clave, mismo teléfono, mismo
// RUC) y se abre su sesión de cobros.
//
// Seguridad:
// - Exige el token del proveedor (X-Provider-Id + X-Provider-Token) Y su PIN, con bloqueo por intentos.
// - NUNCA se enlaza a una cuenta Emprendedor que ya exista con ese teléfono: el WhatsApp del proveedor
//   es declarado, así que coincidir el número no prueba que sea la misma persona (sería robo de cuenta).
//   Si ya existe, debe entrar con el PIN de esa cuenta (login normal, que abre los dos perfiles).
// - El RUC solo queda verificado si el KYC del proveedor está aprobado; si no, va a revisión.
import crypto from 'node:crypto';
import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { db as coreDb } from '../db/client.js';
import { audit } from '../security/audit.js';
import {
  isValidDeviceId,
  issueIdentityToken,
  issueRefreshToken,
  revokeAllRefreshTokens,
  issueSession,
  linkDevice,
  revokeIdentityTokens,
  revokeSessions,
  setMerchantPinHash
} from '../security/auth.js';
import { config } from '../security/config.js';
import { sha256Hex, verifyPin } from '../security/crypto.js';
import { rateLimit } from '../security/guards.js';
import { clientIp, fail, headerString } from '../security/http.js';
import { addMinutes } from '../security/time.js';

export const providerPaymentsRouter = Router();

const limiter = rateLimit({ name: 'provider-payments', windowMs: 60_000, max: 10 });

interface ProviderRow {
  id: string;
  ruc: string | null;
  legal_name: string | null;
  whatsapp: string | null;
  category: string | null;
  seniority_range: string | null;
  kyc_status: string | null;
  legal_rep_dni: string | null;
  pin_hash: string | null;
  pin_failed_attempts: number | null;
  pin_locked_until: string | null;
  access_token_hash: string | null;
  user_id: string | null;
}

const lastNine = (v: unknown) => String(v ?? '').replace(/\D/g, '').slice(-9);

function tokenMatches(stored: string | null, token: unknown): boolean {
  if (typeof token !== 'string' || !token || !stored) return false;
  const given = sha256Hex(token);
  return stored.length === given.length && crypto.timingSafeEqual(Buffer.from(stored), Buffer.from(given));
}

providerPaymentsRouter.post('/session', limiter, async (req, res) => {
  const providerId = headerString(req, 'x-provider-id');
  const prov = providerId
    ? await coreDb.get<ProviderRow>(
        `SELECT id, ruc, legal_name, whatsapp, category, seniority_range, kyc_status, legal_rep_dni, pin_hash,
                pin_failed_attempts, pin_locked_until, access_token_hash, user_id
         FROM provider_profiles WHERE id = ?`,
        providerId
      )
    : undefined;
  if (!prov || !tokenMatches(prov.access_token_hash, headerString(req, 'x-provider-token'))) {
    return fail(res, 401, 'PROVIDER_AUTH_REQUIRED', 'No pudimos validar tu sesión de proveedor. Vuelve a iniciar sesión.');
  }
  const deviceId = req.body?.device_id;
  if (!isValidDeviceId(deviceId)) return fail(res, 422, 'DEVICE_ID_INVALID', 'Identificador de dispositivo inválido.');
  const ip = clientIp(req);

  // PIN del proveedor, con el mismo bloqueo que su login.
  const now = new Date();
  if (prov.pin_locked_until && new Date(prov.pin_locked_until) > now) {
    const minutes = Math.ceil((new Date(prov.pin_locked_until).getTime() - now.getTime()) / 60_000);
    return fail(res, 423, 'PIN_LOCKED', `Bloqueamos el PIN por varios intentos fallidos. Inténtalo en ${minutes} min.`, { locked_until: prov.pin_locked_until });
  }
  if (!prov.pin_hash || typeof req.body?.pin !== 'string' || !verifyPin(req.body.pin, prov.pin_hash)) {
    const bumped = await coreDb.get<{ pin_failed_attempts: number }>(
      'UPDATE provider_profiles SET pin_failed_attempts = pin_failed_attempts + 1 WHERE id = ? RETURNING pin_failed_attempts',
      prov.id
    );
    const attempts = bumped?.pin_failed_attempts ?? (prov.pin_failed_attempts ?? 0) + 1;
    if (attempts >= config.pinMaxAttempts) {
      const lockedUntil = addMinutes(now, config.pinLockMinutes).toISOString();
      await coreDb.run('UPDATE provider_profiles SET pin_failed_attempts = 0, pin_locked_until = ? WHERE id = ?', lockedUntil, prov.id);
      await audit({ actorType: 'SYSTEM', actorId: 'provider:' + prov.id, action: 'PROVIDER_PAYMENTS_SESSION', result: 'DENIED', ip, deviceId, details: { reason: 'PIN_LOCKED' } });
      return fail(res, 423, 'PIN_LOCKED', `Bloqueamos el PIN por ${config.pinLockMinutes} min por varios intentos fallidos.`, { locked_until: lockedUntil });
    }
    return fail(res, 401, 'PIN_INVALID', 'El PIN no es correcto.', { attempts_left: config.pinMaxAttempts - attempts });
  }
  await coreDb.run('UPDATE provider_profiles SET pin_failed_attempts = 0, pin_locked_until = NULL WHERE id = ?', prov.id);

  const phone = lastNine(prov.whatsapp);
  if (phone.length !== 9) return fail(res, 409, 'PHONE_REQUIRED', 'Tu perfil de proveedor no tiene un celular válido. Escríbenos por WhatsApp.');

  // ¿Ya tiene su cuenta de cobros (creada aquí antes)? Solo vale la enlazada a este proveedor.
  let merchant = prov.user_id
    ? await coreDb.get<{ id: string }>('SELECT id FROM merchant_profiles WHERE user_id = ?', prov.user_id)
    : undefined;

  if (!merchant) {
    // Un Emprendedor existente con ese número NO se enlaza (ver cabecera): entra con su propio PIN.
    const taken = await coreDb.get(
      `SELECT 1 FROM users WHERE phone = ? UNION ALL SELECT 1 FROM merchant_profiles WHERE right(regexp_replace(coalesce(phone, ''), '[^0-9]', '', 'g'), 9) = ?`,
      `+51${phone}`,
      phone
    );
    if (taken) {
      return fail(res, 409, 'EMPRENDEDOR_EXISTS', 'Este celular ya tiene una cuenta Kuota. Cierra sesión y entra con tu número y el PIN de esa cuenta: verás tus dos perfiles.');
    }
    const approved = prov.kyc_status === 'APPROVED' || prov.kyc_status === 'VERIFIED';
    const rucTaken = prov.ruc ? await coreDb.get('SELECT 1 FROM merchant_profiles WHERE ruc = ? AND ruc_verified = TRUE', prov.ruc) : undefined;
    const rucVerified = !!prov.ruc && approved && !rucTaken;
    const merchantId = 'mer_' + uuidv4().substring(0, 10);
    const userId = 'usr_' + uuidv4().substring(0, 10);
    await coreDb.tx(async () => {
      await coreDb.run(
        `INSERT INTO users (id, phone, role, status, first_name, last_name, terms_accepted_at, privacy_accepted_at)
         VALUES (?, ?, 'MERCHANT', 'ACTIVE', ?, 'Proveedor', utc_now_text(), utc_now_text())`,
        userId,
        `+51${phone}`,
        String(prov.legal_name ?? 'Proveedor').split(' ')[0]
      );
      await coreDb.run(
        `INSERT INTO merchant_profiles (id, user_id, dni, full_name, phone, ruc, business_name, category, seniority_range, kyc_status,
                                        ruc_verified, ruc_review_status, ruc_review_at, payments_active)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, FALSE)`,
        merchantId,
        userId,
        prov.legal_rep_dni,
        prov.legal_name,
        phone,
        prov.ruc,
        prov.legal_name ?? 'Mi empresa',
        prov.category ?? 'OTHER',
        prov.seniority_range ?? '1Y_3Y',
        approved ? 'APPROVED' : 'IN_PROGRESS',
        rucVerified,
        prov.ruc ? (rucVerified ? 'APPROVED' : 'PENDING') : null,
        prov.ruc ? now.toISOString() : null
      );
      await coreDb.run(
        `INSERT INTO credit_lines (id, merchant_id, level, total_limit_cents, used_cents, consecutive_on_time, status)
         VALUES (?, ?, 1, 140000, 0, 0, 'ACTIVE')`,
        'line_' + uuidv4().substring(0, 10),
        merchantId
      );
      await coreDb.run('INSERT INTO credit_scores (merchant_id, score, level) VALUES (?, 720, 1)', merchantId);
      await coreDb.run('UPDATE provider_profiles SET user_id = ? WHERE id = ?', userId, prov.id);
    });
    // Misma clave en los dos perfiles.
    await setMerchantPinHash(merchantId, prov.pin_hash);
    // Misma foto: la del proveedor pasa a la cuenta de cobros (una sola foto por persona).
    const pav = await coreDb.get<{ image_b64: string }>('SELECT image_b64 FROM provider_avatars WHERE provider_id = ?', prov.id);
    if (pav) {
      await coreDb.run('INSERT INTO merchant_avatars (merchant_id, token, image_b64) VALUES (?, ?, ?) ON CONFLICT (merchant_id) DO NOTHING', merchantId, crypto.randomBytes(16).toString('hex'), pav.image_b64);
      await coreDb.run('DELETE FROM provider_avatars WHERE provider_id = ?', prov.id);
    }
    merchant = { id: merchantId };
    await audit({ actorType: 'SYSTEM', actorId: 'provider:' + prov.id, action: 'PROVIDER_PAYMENTS_ACCOUNT_CREATED', target: merchantId, result: 'OK', ip, deviceId, details: { ruc_verified: rucVerified } });
  }

  const label = typeof req.body?.device_label === 'string' ? req.body.device_label.replace(/[\u0000-\u001f<>]/g, '').slice(0, 60) : null;
  const device = await linkDevice(merchant.id, deviceId, label, ip);
  if (device.revoked) return fail(res, 403, 'DEVICE_REVOKED', 'Este dispositivo fue desvinculado de tu cuenta.');
  const session = await issueSession(merchant.id, deviceId);
  const identityToken = await issueIdentityToken(merchant.id, deviceId);
  await revokeSessions(merchant.id, { exceptDeviceId: deviceId });
  await revokeIdentityTokens(merchant.id, deviceId);
  await revokeAllRefreshTokens(merchant.id);
  const refreshToken = await issueRefreshToken(merchant.id, deviceId);
  await audit({ actorType: 'SYSTEM', actorId: 'provider:' + prov.id, action: 'SESSION_OPEN', target: session.sessionId, result: 'OK', ip, deviceId, details: { merchant_id: merchant.id } });
  res.status(201).json({
    merchant_id: merchant.id,
    access_token: session.accessToken,
    token_type: 'Bearer',
    expires_at: session.expiresAt,
    identity_token: identityToken,
    refresh_token: refreshToken
  });
});
