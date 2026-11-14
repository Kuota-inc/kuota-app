import { Capacitor } from '@capacitor/core';
import { KuotaBiometric } from '../plugins/kuotaBiometric';
import { isBiometricEnabled, setBiometricEnabled } from './appSettings';
import { apiRequest } from '../api/client';

/**
 * La huella registrada guarda el PIN sellado en el teléfono: solo se puede leer pasando una huella válida. Donde Kuota
 * pide el PIN, la huella lo entrega y se envía al servidor igual que si se hubiera escrito (el servidor sigue
 * verificándolo, con su límite de intentos).
 */

/** ¿Hay una huella registrada en este teléfono para usar en lugar de escribir el PIN? */
export async function biometricPinAvailable(): Promise<boolean> {
  if (!Capacitor.isNativePlatform() || !isBiometricEnabled()) return false;
  try {
    return (await KuotaBiometric.status()).registered;
  } catch {
    return false;
  }
}

/** Borra el registro de huella del teléfono y apaga la opción (cambió el PIN, cambiaron las huellas o se cerró la sesión). */
export async function forgetBiometric(): Promise<void> {
  setBiometricEnabled(false);
  try {
    await KuotaBiometric.disable();
  } catch {
    /* ya no había registro */
  }
}

/**
 * P1-5: registra la llave de firma EC P-256 en el Keystore y la sube al servidor.
 * Llama una vez al activar la biometría para que el servidor pueda verificar firmas.
 */
export async function registerBiometricSigningKey(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  const { publicKey } = await KuotaBiometric.registerSigningKey();
  await apiRequest('/auth/biometric-key', {
    method: 'POST',
    body: JSON.stringify({ publicKey }),
  });
}

/**
 * P1-5: obtiene un reto del servidor, pide la huella para firmarlo y devuelve
 * un biometricToken de 5 minutos que prueba autenticación biométrica al servidor.
 * Rechaza con ApiError o con code CANCELED | LOCKOUT | FAILED | INVALIDATED | NOT_REGISTERED.
 */
export async function biometricSignedChallenge(prompt: { title?: string; subtitle?: string } = {}): Promise<string> {
  const { challengeId, challenge } = await apiRequest<{ challengeId: string; challenge: string; expiresAt: string }>('/auth/biometric-challenge');
  try {
    const { signature } = await KuotaBiometric.signChallenge({
      challenge,
      title: prompt.title ?? 'Confirmar con tu huella',
      subtitle: prompt.subtitle,
      negativeText: 'Cancelar',
    });
    const { biometricToken } = await apiRequest<{ biometricToken: string; expiresAt: string }>('/auth/biometric-verify', {
      method: 'POST',
      body: JSON.stringify({ challengeId, signature }),
    });
    return biometricToken;
  } catch (e: any) {
    if (e?.code === 'INVALIDATED' || e?.code === 'NOT_REGISTERED') await forgetBiometric();
    throw e;
  }
}

/**
 * Pide la huella y devuelve el PIN. Rechaza con code CANCELED | LOCKOUT | FAILED, o INVALIDATED | NOT_REGISTERED
 * (en esos dos casos el registro ya no vale y se borra).
 */
export async function pinFromBiometric(prompt: { title?: string; subtitle?: string } = {}): Promise<string> {
  try {
    const r = await KuotaBiometric.getPin({ title: prompt.title ?? 'Confirmar con tu huella', subtitle: prompt.subtitle, negativeText: 'Usar PIN' });
    return r.pin;
  } catch (e: any) {
    if (e?.code === 'INVALIDATED' || e?.code === 'NOT_REGISTERED') await forgetBiometric();
    throw e;
  }
}
