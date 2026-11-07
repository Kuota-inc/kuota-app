// Preferencias locales de la persona en este dispositivo (no viajan al servidor).
//  - biometric:  desbloquear la app con huella/rostro en lugar de escribir el PIN.
//  - listener:   registrar automáticamente los abonos de Yape/Plin detectados en las notificaciones.
// Al cerrar sesión se borran, para que no pasen a la siguiente cuenta del mismo celular.
const KEYS = { biometric: 'kuota.pref.biometric', listener: 'kuota.pref.listener_off' } as const;

type Listener = () => void;
const subscribers = new Set<Listener>();
const emit = () => subscribers.forEach((fn) => fn());

export function onSettingsChange(fn: Listener): () => void {
  subscribers.add(fn);
  return () => {
    subscribers.delete(fn);
  };
}

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function write(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    /* sin almacenamiento: la preferencia dura hasta cerrar la app */
  }
  emit();
}

export const isBiometricEnabled = () => read(KEYS.biometric) === '1';
export const setBiometricEnabled = (on: boolean) => write(KEYS.biometric, on ? '1' : null);

/** Por defecto el listener está activo; solo se guarda cuando la persona lo apaga. */
export const isListenerPreferred = () => read(KEYS.listener) !== '1';
export const setListenerPreferred = (on: boolean) => write(KEYS.listener, on ? null : '1');

export function resetSettings() {
  write(KEYS.biometric, null);
  write(KEYS.listener, null);
}
