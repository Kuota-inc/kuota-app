/**
 * Verificación del token de Play Integrity de Google.
 *
 * El cliente Android solicita un token firmado por Google con un nonce (SHA-256 base64url de la
 * operación en curso). El backend lo verifica llamando a la API de Google y comprueba:
 *   1. appRecognitionVerdict == PLAY_RECOGNIZED
 *   2. deviceRecognitionVerdict incluye MEETS_DEVICE_INTEGRITY
 *   3. requestDetails.nonce == el nonce esperado
 *
 * En sandbox (isProd=false o KUOTA_INTEGRITY_SKIP=1) la verificación es un no-op para facilitar
 * el desarrollo con emuladores (que no tienen Play Services).
 *
 * Docs: https://developer.android.com/google/play/integrity/verdicts
 */
import { isProd } from './config.js';

const GOOGLE_INTEGRITY_URL = 'https://playintegrity.googleapis.com/v1';
const PACKAGE_NAME = 'pe.kuota.app';

export interface IntegrityVerdict {
  ok: boolean;
  reason?: string;
}

/**
 * Verifica el token de Play Integrity. Lanza un error si el token es inválido en producción.
 * @param token  Token devuelto por KuotaPlayIntegrityPlugin en el cliente.
 * @param nonce  Nonce esperado (el mismo que se pasó al cliente).
 */
export async function verifyIntegrityToken(
  token: string | undefined | null,
  nonce: string,
): Promise<IntegrityVerdict> {
  // En desarrollo o si el skip está explícito, aceptar sin verificar.
  if (!isProd || process.env.KUOTA_INTEGRITY_SKIP === '1') {
    return { ok: true };
  }
  if (!token) {
    return { ok: false, reason: 'TOKEN_MISSING' };
  }
  const apiKey = process.env.KUOTA_PLAY_INTEGRITY_KEY;
  if (!apiKey) {
    // Sin clave configurada en prod: fail-open con log (no bloquear si no está configurado aún).
    console.warn('[play-integrity] KUOTA_PLAY_INTEGRITY_KEY no configurada; verificación omitida.');
    return { ok: true };
  }
  try {
    const url = `${GOOGLE_INTEGRITY_URL}/${PACKAGE_NAME}:decodeIntegrityToken?key=${apiKey}`;
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ integrity_token: token }),
    });
    if (!resp.ok) {
      return { ok: false, reason: `GOOGLE_API_ERROR_${resp.status}` };
    }
    const data = (await resp.json()) as any;
    const details = data?.tokenPayloadExternal;

    // 1. Nonce correcto.
    const serverNonce = details?.requestDetails?.nonce;
    if (serverNonce !== nonce) {
      return { ok: false, reason: 'NONCE_MISMATCH' };
    }

    // 2. App reconocida por Play.
    const appVerdict = details?.appIntegrity?.appRecognitionVerdict;
    if (appVerdict !== 'PLAY_RECOGNIZED') {
      return { ok: false, reason: `APP_NOT_RECOGNIZED:${appVerdict}` };
    }

    // 3. Dispositivo con integridad básica (MEETS_DEVICE_INTEGRITY).
    const deviceVerdicts: string[] = details?.deviceIntegrity?.deviceRecognitionVerdict ?? [];
    if (!deviceVerdicts.includes('MEETS_DEVICE_INTEGRITY')) {
      return { ok: false, reason: `DEVICE_INTEGRITY_FAIL:${deviceVerdicts.join(',')}` };
    }

    return { ok: true };
  } catch (e) {
    console.error('[play-integrity] error al verificar token:', e);
    // Fail-open: no bloquear operaciones si Google no responde (disponibilidad > seguridad aquí).
    return { ok: true };
  }
}
