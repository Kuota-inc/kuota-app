import { useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';

const SMALL_SCREEN = '(max-width: 500px)';

function detect(): boolean {
  if (Capacitor.isNativePlatform()) return true;
  if (typeof window === 'undefined') return false;
  // ?device=1 fuerza el modo teléfono en el navegador (útil para probarlo en la PC).
  if (new URLSearchParams(window.location.search).get('device') === '1') return true;
  return window.matchMedia?.(SMALL_SCREEN).matches ?? false;
}

/**
 * true cuando la app corre en un teléfono real (APK de Capacitor o navegador
 * móvil): se muestra a pantalla completa, sin el marco del simulador ni el
 * panel de control de pantallas.
 */
export function useDeviceMode(): boolean {
  const [device, setDevice] = useState(detect);
  useEffect(() => {
    if (Capacitor.isNativePlatform()) return;
    const mq = window.matchMedia(SMALL_SCREEN);
    const onChange = () => setDevice(detect());
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return device;
}
