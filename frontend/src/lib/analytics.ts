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
  try {
    posthog.init(PH_KEY, {
      api_host: PH_HOST,
      capture_pageview: false,
      capture_pageleave: false,
      autocapture: false,
      session_recording: { maskAllInputs: true, maskTextSelector: '*' },
      persistence: 'memory',
      disable_session_recording: true,
    });
    initialized = true;
  } catch {
    /* analytics nunca debe romper la app */
  }
}

export function identifyUser(id: string, role: 'MERCHANT' | 'PROVIDER') {
  if (!initialized) return;
  try { posthog.identify(id, { role }); } catch { /* noop */ }
}

export function resetUser() {
  if (!initialized) return;
  try { posthog.reset(); } catch { /* noop */ }
}

export function trackScreen(screen: string, props?: Record<string, unknown>) {
  if (!initialized) return;
  try { posthog.capture('screen_view', { screen, ...props }); } catch { /* noop */ }
}

export function track(event: string, props?: Record<string, unknown>) {
  if (!initialized) return;
  try { posthog.capture(event, props); } catch { /* noop */ }
}
