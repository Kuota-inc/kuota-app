/**
 * Analytics centralizado con PostHog.
 * Reglas de privacidad fintech:
 *  - Nunca enviar: teléfono, DNI, nombre real, montos en texto libre, tokens de sesión.
 *  - distinct_id = merchant_id / provider_id (ya es un UUID opaco del servidor).
 *  - Los montos viajan como enteros en centavos (no string con coma).
 */
import posthog from 'posthog-js';
import { identifyNativeAnalytics, resetNativeAnalytics } from '../plugins/kuotaSecure';

const PH_KEY = import.meta.env.VITE_POSTHOG_KEY as string | undefined;
const PH_HOST = import.meta.env.VITE_POSTHOG_HOST as string | undefined;

let initialized = false;
let identifiedDistinctId: string | null = null;

export function initAnalytics() {
  if (initialized) return;
  if (!PH_KEY || !PH_HOST) {
    const missingVariable = !PH_KEY ? 'VITE_POSTHOG_KEY' : 'VITE_POSTHOG_HOST';
    if (import.meta.env.DEV) {
      throw new Error(`${missingVariable} variable required by PostHog is missing or un-configured, this causes events to be silently missed. This error stops appearing once ${missingVariable} is configured`);
    }
    return;
  }
  posthog.init(PH_KEY, {
    api_host: PH_HOST,
    session_recording: { maskAllInputs: true, maskTextSelector: '*' },
    persistence: 'memory', // sin localStorage — datos sensibles en Keystore, no en browser storage
  });
  initialized = true;
}

/** Llama al iniciar sesión, registro o restauración de sesión. id = merchant_id o provider_id. */
export function identifyUser(id: string, role: 'MERCHANT' | 'PROVIDER') {
  if (!initialized || identifiedDistinctId === id) return;
  posthog.identify(id, { role });
  identifyNativeAnalytics(id, role);
  identifiedDistinctId = id;
}

/** Llama al cerrar sesión. */
export function resetUser() {
  if (!initialized) return;
  posthog.reset();
  resetNativeAnalytics();
  identifiedDistinctId = null;
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
