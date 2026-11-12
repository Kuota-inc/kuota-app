import { registerPlugin } from '@capacitor/core';

export interface BiometricAvailability {
  available: boolean;
  /** OK | NONE_ENROLLED | NO_HARDWARE | HW_UNAVAILABLE | UNSUPPORTED | UNKNOWN */
  reason: string;
}

export interface BiometricStatus extends BiometricAvailability {
  /** Kuota ya tiene su registro vinculado a las huellas del teléfono. */
  registered: boolean;
  /** Cambiaron las huellas del teléfono: el registro anterior ya no vale. */
  invalidated: boolean;
}

interface KuotaBiometricPlugin {
  isAvailable(): Promise<BiometricAvailability>;
  status(): Promise<BiometricStatus>;
  /** Abre la pantalla de Android donde se guarda una huella (el sistema es quien las registra). */
  openEnrollment(): Promise<void>;
  /** Registra la biometría en Kuota: pide la huella una vez. Rechaza con code CANCELED | LOCKOUT | FAILED. */
  register(options: { title?: string; subtitle?: string; negativeText?: string }): Promise<{ registered: boolean }>;
  /** Desbloqueo con la biometría registrada. Rechaza con code NOT_REGISTERED | INVALIDATED | CANCELED | LOCKOUT | FAILED. */
  authenticate(options: { title?: string; subtitle?: string; negativeText?: string }): Promise<void>;
  /** Quita el registro (borra la clave del teléfono). */
  disable(): Promise<void>;
}

export const KuotaBiometric = registerPlugin<KuotaBiometricPlugin>('KuotaBiometric', {
  web: {
    isAvailable: async () => ({ available: false, reason: 'NO_HARDWARE' }),
    status: async () => ({ available: false, reason: 'NO_HARDWARE', registered: false, invalidated: false }),
    openEnrollment: async () => {},
    register: async () => {
      throw Object.assign(new Error('Biometría no disponible en el navegador.'), { code: 'FAILED' });
    },
    authenticate: async () => {
      throw Object.assign(new Error('Biometría no disponible en el navegador.'), { code: 'FAILED' });
    },
    disable: async () => {}
  }
});

export function biometricReasonText(reason: string): string {
  switch (reason) {
    case 'NONE_ENROLLED':
      return 'Tu teléfono aún no tiene una huella guardada.';
    case 'NO_HARDWARE':
    case 'UNSUPPORTED':
      return 'Este dispositivo no admite huella o reconocimiento facial seguro.';
    case 'HW_UNAVAILABLE':
      return 'El sensor biométrico no está disponible ahora. Inténtalo más tarde.';
    default:
      return 'No pudimos activar la biometría en este dispositivo.';
  }
}
