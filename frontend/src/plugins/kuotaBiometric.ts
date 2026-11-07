import { registerPlugin } from '@capacitor/core';

export interface BiometricAvailability {
  available: boolean;
  /** OK | NONE_ENROLLED | NO_HARDWARE | HW_UNAVAILABLE | UNSUPPORTED | UNKNOWN */
  reason: string;
}

interface KuotaBiometricPlugin {
  isAvailable(): Promise<BiometricAvailability>;
  /** Resuelve si la persona se autentica; rechaza con code CANCELED | LOCKOUT | FAILED. */
  authenticate(options: { title?: string; subtitle?: string; negativeText?: string }): Promise<void>;
}

export const KuotaBiometric = registerPlugin<KuotaBiometricPlugin>('KuotaBiometric', {
  web: {
    isAvailable: async () => ({ available: false, reason: 'NO_HARDWARE' }),
    authenticate: async () => {
      throw Object.assign(new Error('Biometría no disponible en el navegador.'), { code: 'FAILED' });
    }
  }
});

export function biometricReasonText(reason: string): string {
  switch (reason) {
    case 'NONE_ENROLLED':
      return 'Registra una huella o tu rostro en los ajustes del celular para usar esta opción.';
    case 'NO_HARDWARE':
    case 'UNSUPPORTED':
      return 'Este dispositivo no admite huella o reconocimiento facial seguro.';
    case 'HW_UNAVAILABLE':
      return 'El sensor biométrico no está disponible ahora. Inténtalo más tarde.';
    default:
      return 'No pudimos activar la biometría en este dispositivo.';
  }
}
