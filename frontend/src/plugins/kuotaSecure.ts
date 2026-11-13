import { useEffect } from 'react';
import { Capacitor, registerPlugin } from '@capacitor/core';

interface KuotaSecurePlugin {
  setSecure(options: { enabled: boolean }): Promise<void>;
  identifyAnalytics(options: { distinctId: string; role: 'MERCHANT' | 'PROVIDER' }): Promise<void>;
  resetAnalytics(): Promise<void>;
}

const KuotaSecure = registerPlugin<KuotaSecurePlugin>('KuotaSecure', {
  web: {
    setSecure: async () => {},
    identifyAnalytics: async () => {},
    resetAnalytics: async () => {},
  }
});

/** Mantiene los errores y eventos nativos asociados al mismo id opaco que el WebView. */
export function identifyNativeAnalytics(distinctId: string, role: 'MERCHANT' | 'PROVIDER') {
  if (!Capacitor.isNativePlatform()) return;
  void KuotaSecure.identifyAnalytics({ distinctId, role }).catch(() => {});
}

/** Separa la siguiente sesión nativa de la persona que acaba de cerrar sesión. */
export function resetNativeAnalytics() {
  if (!Capacitor.isNativePlatform()) return;
  void KuotaSecure.resetAnalytics().catch(() => {});
}

// Contador: la captura queda bloqueada mientras haya al menos una pantalla sensible visible.
let active = 0;
function apply() {
  if (!Capacitor.isNativePlatform()) return;
  void KuotaSecure.setSecure({ enabled: active > 0 }).catch(() => {});
}

/** Bloquea capturas y grabación de pantalla mientras `on` sea true (solo en la app Android). */
export function useSecureScreen(on: boolean) {
  useEffect(() => {
    if (!on) return;
    active += 1;
    apply();
    return () => {
      active = Math.max(0, active - 1);
      apply();
    };
  }, [on]);
}
