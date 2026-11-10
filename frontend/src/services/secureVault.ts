import { Capacitor, registerPlugin } from '@capacitor/core';

// Bóveda de secretos (tokens de sesión). En el celular se cifran con una clave del Android Keystore
// (plugin KuotaVault); en el navegador quedan en sessionStorage, que se borra al cerrar la pestaña.
// Nunca en localStorage: con el teléfono rooteado o un respaldo se podrían copiar.
//
// La lectura es síncrona (desde memoria) para no cambiar el resto de la app: initVault() carga los
// valores una sola vez antes de pintar la interfaz.

interface VaultPlugin {
  get(opts: { keys: string[] }): Promise<{ values: Record<string, string> }>;
  set(opts: { key: string; value: string }): Promise<void>;
  remove(opts: { key: string }): Promise<void>;
}

const Vault = registerPlugin<VaultPlugin>('KuotaVault');
const native = Capacitor.isNativePlatform();
const memory = new Map<string, string>();

export const VAULT_KEYS = ['kuota.merchant_token', 'kuota.provider_token'];

function webStore(): Storage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

/** Carga los secretos a memoria y migra los que quedaron en localStorage de versiones anteriores. */
export async function initVault(): Promise<void> {
  // Versiones anteriores guardaban los tokens en localStorage: se mueven a la bóveda y se borran de ahí.
  const legacy: Record<string, string> = {};
  for (const k of VAULT_KEYS) {
    try {
      const v = localStorage.getItem(k);
      if (v) legacy[k] = v;
      localStorage.removeItem(k);
    } catch {
      /* sin almacenamiento */
    }
  }
  if (native) {
    try {
      const { values } = await Vault.get({ keys: VAULT_KEYS });
      for (const [k, v] of Object.entries(values ?? {})) memory.set(k, v);
    } catch {
      /* bóveda no disponible: se trabaja en memoria y se pedirá iniciar sesión */
    }
  } else {
    const s = webStore();
    for (const k of VAULT_KEYS) {
      const v = s?.getItem(k);
      if (v) memory.set(k, v);
    }
  }
  for (const [k, v] of Object.entries(legacy)) {
    if (!memory.has(k)) vaultSet(k, v);
  }
}

export function vaultGet(key: string): string | null {
  return memory.get(key) ?? null;
}

export function vaultSet(key: string, value: string | null): void {
  if (value) memory.set(key, value);
  else memory.delete(key);
  if (native) {
    const p = value ? Vault.set({ key, value }) : Vault.remove({ key });
    p.catch(() => {
      /* se mantiene en memoria durante esta sesión */
    });
    return;
  }
  const s = webStore();
  try {
    if (value) s?.setItem(key, value);
    else s?.removeItem(key);
  } catch {
    /* queda en memoria */
  }
}
