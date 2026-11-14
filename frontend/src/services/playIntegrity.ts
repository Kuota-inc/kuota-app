import { Capacitor, registerPlugin } from '@capacitor/core';

interface PlayIntegrityPlugin {
  requestToken(opts: { nonce: string }): Promise<{ token: string }>;
}

const PlayIntegrity = registerPlugin<PlayIntegrityPlugin>('KuotaPlayIntegrity');
const native = Capacitor.isNativePlatform();

/**
 * Solicita un token de Play Integrity firmado por Google con el nonce dado.
 * El nonce debe ser el SHA-256 (base64url) de los datos de la operación en curso.
 * Devuelve null en web/dev (el backend acepta null solo en sandbox).
 */
export async function getIntegrityToken(nonce: string): Promise<string | null> {
  if (!native) return null;
  try {
    const { token } = await PlayIntegrity.requestToken({ nonce });
    return token;
  } catch {
    return null;
  }
}
