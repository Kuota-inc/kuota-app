import { useEffect } from 'react';
import { Capacitor, registerPlugin } from '@capacitor/core';

interface KuotaSecurePlugin {
  setSecure(options: { enabled: boolean }): Promise<void>;
  identify(options: { distinctId: string; accountType: 'merchant' | 'provider' }): Promise<void>;
  capture(options: { event: string; properties?: Record<string, string | number | boolean> }): Promise<void>;
  resetPostHog(): Promise<void>;
}

const KuotaSecure = registerPlugin<KuotaSecurePlugin>('KuotaSecure', {
  web: {
    setSecure: async () => {},
    identify: async () => {},
    capture: async () => {},
    resetPostHog: async () => {}
  }
});

export function identifyPostHog(distinctId: string, accountType: 'merchant' | 'provider') {
  if (!Capacitor.isNativePlatform() || !distinctId) return;
  void KuotaSecure.identify({ distinctId, accountType }).catch(() => {});
}

export function capturePostHog(event: string, properties?: Record<string, string | number | boolean>) {
  if (!Capacitor.isNativePlatform()) return;
  void KuotaSecure.capture({ event, properties }).catch(() => {});
}

export function resetPostHog() {
  if (!Capacitor.isNativePlatform()) return;
  void KuotaSecure.resetPostHog().catch(() => {});
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
