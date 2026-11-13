/**
 * Analytics centralizado con PostHog.
 * Reglas de privacidad fintech:
 *  - Nunca enviar: teléfono, DNI, nombre real, montos en texto libre, tokens de sesión.
 *  - distinct_id = merchant_id / provider_id (ya es un UUID opaco del servidor).
 *  - Los montos viajan como enteros en centavos (no string con coma).
 */
import posthog from 'posthog-js';

const PH_KEY = import.meta.env.VITE_POSTHOG_KEY as string | undefined;
const PH_HOST = (import.meta.env.VITE_POSTHOG_HOST as string | undefined) ?? 'https://us.i.posthog.com';

let initialized = false;

export function initAnalytics() {
  if (initialized || !PH_KEY) return;
  posthog.init(PH_KEY, {
    api_host: PH_HOST,
    capture_pageview: false,
    capture_pageleave: false,
    autocapture: false,
    session_recording: { maskAllInputs: true, maskTextSelector: '*' },
    persistence: 'memory', // sin localStorage — datos sensibles en Keystore, no en browser storage
    disable_session_recording: true, // activar solo cuando legal lo valide
  });
  initialized = true;
}

/** Llama al iniciar sesión (login o restaurar sesión). id = merchant_id o provider_id. */
export function identifyUser(id: string, role: 'MERCHANT' | 'PROVIDER') {
  if (!initialized) return;
  posthog.identify(id, { role });
}

/** Llama al cerrar sesión. */
export function resetUser() {
  if (!initialized) return;
  posthog.reset();
}

/** Trackea una pantalla cuando el usuario la abre. */
export function trackScreen(screen: string, props?: Record<string, unknown>) {
  if (!initialized) return;
  posthog.capture('screen_view', { screen, ...props });
}

/** Trackea cualquier evento de acción. */
export function track(event: string, props?: Record<string, unknown>) {
  if (!initialized) return;
  posthog.capture(event, props);
}
