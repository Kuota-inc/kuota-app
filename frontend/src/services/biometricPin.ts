import { Capacitor } from '@capacitor/core';
import { KuotaBiometric } from '../plugins/kuotaBiometric';
import { isBiometricEnabled, setBiometricEnabled } from './appSettings';

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
