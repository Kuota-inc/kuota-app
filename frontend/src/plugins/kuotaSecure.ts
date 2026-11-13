import { useEffect } from 'react';
import { Capacitor, registerPlugin } from '@capacitor/core';

interface KuotaSecurePlugin {
  setSecure(options: { enabled: boolean }): Promise<void>;
  identifyAnalyticsUser(options: { distinctId: string; role: 'MERCHANT' | 'PROVIDER' }): Promise<void>;
  resetAnalyticsUser(): Promise<void>;
}

const KuotaSecure = registerPlugin<KuotaSecurePlugin>('KuotaSecure', {
  web: {
    setSecure: async () => {},
    identifyAnalyticsUser: async () => {},
    resetAnalyticsUser: async () => {},
  }
});

// Contador: la captura queda bloqueada mientras haya al menos una pantalla sensible visible.
let active = 0;
function apply() {
  if (!Capacitor.isNativePlatform()) return;
  void KuotaSecure.setSecure({ enabled: active > 0 }).catch(() => {});
}

export function identifyNativeAnalyticsUser(distinctId: string, role: 'MERCHANT' | 'PROVIDER') {
  if (!Capacitor.isNativePlatform()) return;
  void KuotaSecure.identifyAnalyticsUser({ distinctId, role }).catch(() => {});
}

export function resetNativeAnalyticsUser() {
  if (!Capacitor.isNativePlatform()) return;
  void KuotaSecure.resetAnalyticsUser().catch(() => {});
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
