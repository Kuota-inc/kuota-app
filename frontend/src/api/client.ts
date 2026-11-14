import { deviceId } from './payments';
import { vaultGet, vaultSet } from '../services/secureVault';

// URL del backend: VITE_API_BASE o Railway en producción.
// Para desarrollo local: VITE_API_BASE=http://<ip-pc>:3001/api/v1 en .env.local
export const API_BASE = ((import.meta.env.VITE_API_BASE as string | undefined) || 'https://kuota-app-production.up.railway.app/api/v1').replace(/\/+$/, '');
/** Origen del backend (sin /api/v1): sirve las páginas legales y el Libro de Reclamaciones. */
export const API_ORIGIN = (() => {
  try {
    return new URL(API_BASE).origin;
  } catch {
    return '';
  }
})();

// Sin timeout, un backend inalcanzable (celular fuera de la red) dejaría las
// pantallas cargando indefinidamente.
const TIMEOUT_MS = 10000;

/** Mensaje en español cuando el servidor no devuelve uno (HTML, vacío o proxy). */
function httpMessage(status: number): string {
  if (status === 404) return 'Esa función no está disponible por ahora. Actualiza la app e inténtalo de nuevo.';
  if (status === 401 || status === 403) return 'Tu sesión no es válida. Vuelve a iniciar sesión.';
  if (status === 429) return 'Demasiados intentos. Espera un momento e inténtalo otra vez.';
  if (status >= 500) return 'Kuota tuvo un problema. Inténtalo de nuevo en unos minutos.';
  return 'No pudimos completar la acción. Inténtalo de nuevo.';
}

/** Error de la API con el código del backend ({ error: { code, message } }). */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly data: any;
  constructor(status: number, code: string, message: string, data: any = null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.data = data;
  }
}

// Comercio registrado en este dispositivo. Sin él, el backend de desarrollo responde
// con la cuenta demo. Lo que protege los cobros es el PIN, no este identificador.
const MERCHANT_KEY = 'kuota.merchant_id';
let memoryMerchantId: string | null = null;

export function getMerchantId(): string | null {
  try {
    return localStorage.getItem(MERCHANT_KEY) ?? memoryMerchantId;
  } catch {
    return memoryMerchantId;
  }
}

// Token secreto de identidad de este dispositivo (el id del comercio no es un secreto).
// Vive en la bóveda cifrada (Android Keystore), nunca en localStorage.
const MERCHANT_TOKEN_KEY = 'kuota.merchant_token';
const MERCHANT_REFRESH_KEY = 'kuota.refresh_token';

export function getRefreshToken(): string | null {
  return vaultGet(MERCHANT_REFRESH_KEY);
}

export function setRefreshToken(token: string | null) {
  vaultSet(MERCHANT_REFRESH_KEY, token);
}

export function getMerchantToken(): string | null {
  return vaultGet(MERCHANT_TOKEN_KEY);
}

export function setMerchantToken(token: string | null) {
  vaultSet(MERCHANT_TOKEN_KEY, token);
}

export function setMerchantId(id: string | null) {
  memoryMerchantId = id;
  if (!id) setMerchantToken(null);
  try {
    if (id) localStorage.setItem(MERCHANT_KEY, id);
    else localStorage.removeItem(MERCHANT_KEY);
  } catch {
    /* almacenamiento no disponible: queda en memoria */
  }
}

// Proveedor registrado en este dispositivo. Permite al backend asociar cada paso
// del registro con el perfil correcto sin sesión de usuario.
const PROVIDER_KEY = 'kuota.provider_id';
let memoryProviderId: string | null = null;

export function getProviderId(): string | null {
  try {
    return localStorage.getItem(PROVIDER_KEY) ?? memoryProviderId;
  } catch {
    return memoryProviderId;
  }
}

// Token secreto del proveedor: también en la bóveda cifrada.
const PROVIDER_TOKEN_KEY = 'kuota.provider_token';

export function getProviderToken(): string | null {
  return vaultGet(PROVIDER_TOKEN_KEY);
}

export function setProviderToken(token: string | null) {
  vaultSet(PROVIDER_TOKEN_KEY, token);
}

export function setProviderId(id: string | null) {
  memoryProviderId = id;
  if (!id) setProviderToken(null);
  try {
    if (id) localStorage.setItem(PROVIDER_KEY, id);
    else localStorage.removeItem(PROVIDER_KEY);
  } catch {
    /* almacenamiento no disponible: queda en memoria */
  }
}

let refreshing: Promise<boolean> | null = null;

/** Rota el refresh token y actualiza el identity token en vault. Thread-safe (una sola petición en vuelo). */
async function tryRefreshMerchantToken(): Promise<boolean> {
  if (refreshing) return refreshing;
  refreshing = (async () => {
    const rt = getRefreshToken();
    if (!rt) return false;
    try {
      const data = await fetch(`${API_BASE}/auth/token/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: rt }),
      }).then(r => r.ok ? r.json() : null);
      if (!data?.identity_token) return false;
      setMerchantToken(data.identity_token);
      if (data.refresh_token) setRefreshToken(data.refresh_token);
      return true;
    } catch {
      return false;
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

export async function apiRequest<T = any>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const url = `${API_BASE}${endpoint}`;
  const merchantId = getMerchantId();
  const providerId = getProviderId();
  const headers = {
    'Content-Type': 'application/json',
    ...(merchantId ? { 'X-Merchant-Id': merchantId } : {}),
    ...(getMerchantToken() ? { 'X-Merchant-Token': getMerchantToken() as string, 'X-Device-Id': deviceId() } : {}),
    ...(providerId ? { 'X-Provider-Id': providerId } : {}),
    ...(getProviderToken() ? { 'X-Provider-Token': getProviderToken() as string } : {}),
    ...(options.headers || {})
  };
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const timeout = new Promise<never>((_, reject) =>
      window.setTimeout(() => reject(Object.assign(new Error('timeout'), { name: 'AbortError' })), TIMEOUT_MS + 500)
    );
    const res = await Promise.race([fetch(url, { ...options, headers, signal: options.signal ?? controller.signal }), timeout]);
    const data = res.status === 204 ? null : await res.json().catch(() => null);
    if (!res.ok) {
      throw new ApiError(res.status, data?.error?.code ?? `HTTP_${res.status}`, data?.error?.message || httpMessage(res.status), data);
    }
    return data as T;
  } catch (err: any) {
    // Solo fallas inesperadas (red o servidor); los 4xx son flujos que maneja la interfaz
    // (PIN, límites, confirmaciones). Sin el cuerpo: puede traer datos del comercio.
    // El token de identidad venció o fue revocado: volver al inicio de sesión.
    if (err instanceof ApiError && endpoint !== '/providers/logout' && err.code === 'MERCHANT_AUTH_REQUIRED') {
      // Intentar renovar el identity token con el refresh token antes de forzar logout.
      const refreshed = await tryRefreshMerchantToken();
      if (refreshed) {
        // Reintentar la petición original con el token nuevo (un solo intento extra).
        return apiRequest<T>(endpoint, options);
      }
      window.dispatchEvent(new CustomEvent('kuota:logout', { detail: { scope: 'ALL' } }));
    }
    if (err instanceof ApiError && endpoint !== '/providers/logout' && err.code === 'PROVIDER_AUTH_REQUIRED') {
      window.dispatchEvent(new CustomEvent('kuota:logout', { detail: { scope: 'PROVIDER' } }));
    }
    if (!(err instanceof ApiError) || err.status >= 500) {
      console.error(`API Call failed: ${endpoint}`, err?.code ?? err?.name ?? 'error');
    }
    if (err?.name === 'AbortError' || err instanceof TypeError) {
      throw new ApiError(0, 'NETWORK', 'No pudimos conectar con Kuota. Revisa tu conexión e inténtalo otra vez.');
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export interface Workshop {
  id: string;
  title: string;
  speaker: string;
  channel: string;
  seats_note: string;
  starts_at: string;
  free_for_clients: boolean;
  reminder_set: boolean;
}

export interface NotificationState {
  push_enabled: boolean;
  unread_count: number;
  workshop: Workshop;
}

export interface ContactLookup {
  phone_masked: string;
  registered: boolean;
  is_self: boolean;
  kind: 'EMPRENDEDOR' | 'PROVEEDOR' | null;
  display_name: string | null;
  verified: boolean;
  avatar_url: string | null;
}

export const api = {
  // Public
  getStats: () => apiRequest('/public/stats'),
  getBusinessCategories: () => apiRequest('/catalogs/business-categories'),
  getSeniorityRanges: () => apiRequest('/catalogs/seniority-ranges'),
  getProviderCategories: () => apiRequest('/catalogs/provider-categories'),
  getProviderSeniorityRanges: () => apiRequest('/catalogs/provider-seniority-ranges'),

  // Onboarding
  createSession: (role: 'MERCHANT' | 'PROVIDER') =>
    apiRequest('/onboarding/sessions', {
      method: 'POST',
      body: JSON.stringify({
        role,
        device_id: 'web_simulator_01',
        accepted_terms_version: '2026.1',
        accepted_privacy_version: '2026.1'
      })
    }),
  lookupDni: (dni: string) => apiRequest(`/onboarding/reniec/${dni}`),
  saveMerchantIdentity: (sessionId: string, data: { account_type?: 'PERSONAL' | 'BUSINESS'; ruc?: string; doc_type?: 'DNI' | 'CE'; dni: string; full_name: string; phone: string; whatsapp_opt_in?: boolean }) =>
    apiRequest(`/onboarding/sessions/${sessionId}/merchant-identity`, {
      method: 'POST',
      body: JSON.stringify(data)
    }),
  getMerchantKycStatus: (requestId: string) => apiRequest(`/onboarding/merchant-kyc/${requestId}`),
  /** Inicia la verificación real (Didit). provider DEMO = flujo simulado de desarrollo. */
  startMerchantVerification: (requestId: string) =>
    apiRequest<{ provider: 'DIDIT' | 'DEMO'; url: string | null; status: string }>(`/onboarding/merchant-kyc/${requestId}/verification`, { method: 'POST' }),
  submitMerchantKycDocuments: (requestId: string, data: { dni_front?: string; dni_back?: string; selfie?: string }) =>
    apiRequest(`/onboarding/merchant-kyc/${requestId}/documents`, {
      method: 'POST',
      body: JSON.stringify(data)
    }),
  saveMerchantActivity: (sessionId: string, data: { category: string; seniority_range: string; business_name?: string }) =>
    apiRequest(`/onboarding/sessions/${sessionId}/merchant-activity`, {
      method: 'PUT',
      body: JSON.stringify(data)
    }),
  saveProducts: (sessionId: string, products: Array<{ name: string; price_cents: number; is_frequent?: boolean }>) =>
    apiRequest(`/onboarding/sessions/${sessionId}/products`, {
      method: 'PUT',
      body: JSON.stringify({ products })
    }),
  completeOnboarding: (sessionId: string, data?: { business_name?: string; phone?: string }) =>
    apiRequest(`/onboarding/sessions/${sessionId}/complete`, {
      method: 'POST',
      body: JSON.stringify(data || {})
    }).then((res: any) => {
      if (res?.merchant_id) setMerchantId(res.merchant_id);
      if (res?.identity_token) setMerchantToken(res.identity_token);
      return res;
    }),
  setSecurityPin: (sessionId: string, pin: string) =>
    apiRequest(`/onboarding/sessions/${sessionId}/security-pin`, {
      method: 'POST',
      body: JSON.stringify({ pin }),
      headers: { 'X-Device-Id': deviceId() }
    }).then((res: any) => {
      if (res?.identity_token) setMerchantToken(res.identity_token);
      return res;
    }),

  // Merchant Dashboard
  getHome: () => apiRequest('/merchants/me/home'),
  getKuotearModal: () => apiRequest('/merchants/me/kuotear'),
  getWelcomeSummary: () => apiRequest('/merchants/me/welcome-summary'),
  getPlan: () => apiRequest('/merchants/me/plan'),
  setPlan: (plan: 'BASIC' | 'PRO') => apiRequest('/merchants/me/plan', { method: 'POST', body: JSON.stringify({ plan }) }),
  getProducts: () => apiRequest('/merchants/me/products'),
  addProduct: (product: { name: string; price_cents: number; is_frequent?: boolean }) =>
    apiRequest('/merchants/me/products', {
      method: 'POST',
      body: JSON.stringify(product)
    }),

  // Sales
  getSalesSummary: () => apiRequest('/merchants/me/sales/summary'),
  getSalesList: (filter?: string, query?: string) => {
    const params = new URLSearchParams();
    if (filter) params.append('source', filter);
    if (query) params.append('q', query);
    return apiRequest(`/merchants/me/sales?${params.toString()}`);
  },
  createManualSale: (amount_cents: number, concept: string) =>
    apiRequest('/merchants/me/sales', {
      method: 'POST',
      body: JSON.stringify({ amount_cents, concept, source: 'MANUAL' })
    }),
  simulateOcr: (data?: { amount_cents?: number; concept?: string; operation_ref?: string; source?: string }) =>
    apiRequest('/merchants/me/sales/ocr', {
      method: 'POST',
      body: data ? JSON.stringify(data) : undefined
    }),

  // Credit
  getCreditLine: () => apiRequest('/credit/line'),
  getCreditLevels: () => apiRequest('/credit/levels'),
  getActivePurchase: () => apiRequest('/credit/purchases/active'),
  simulatePlan: (purchase_cents: number, installments: number = 3) =>
    apiRequest('/credit/simulations', {
      method: 'POST',
      body: JSON.stringify({ purchase_cents, installments })
    }),
  payInstallment: (installmentId: string) =>
    apiRequest(`/credit/installments/${installmentId}/pay`, {
      method: 'POST'
    }),
  settlePurchase: (purchaseId: string) =>
    apiRequest(`/credit/purchases/${purchaseId}/settle`, {
      method: 'POST'
    }),

  // Foto de perfil: la ven quienes pagan o buscan al comercio por celular.
  setAvatar: (image: string) => apiRequest<{ avatar_url: string }>('/merchants/me/avatar', { method: 'PUT', body: JSON.stringify({ image }) }),
  removeAvatar: () => apiRequest<{ avatar_url: null }>('/merchants/me/avatar', { method: 'DELETE' }),
  // Lo mismo para un proveedor (si ya tiene cuenta de cobros, el servidor usa la misma foto en los dos perfiles).
  setProviderAvatar: (image: string) => apiRequest<{ avatar_url: string }>('/providers/avatar', { method: 'PUT', body: JSON.stringify({ image }) }),
  removeProviderAvatar: () => apiRequest<{ avatar_url: null }>('/providers/avatar', { method: 'DELETE' }),

  // ¿Este celular ya tiene cuenta Kuota? (el servidor limita las consultas y no devuelve datos de más)
  lookupContact: (phone: string) =>
    apiRequest<ContactLookup>('/merchants/me/contacts/lookup', { method: 'POST', body: JSON.stringify({ phone }) }),

  // Payment Links: cotización pública; el resto (con sesión y PIN) está en api/payments.ts
  quotePaymentLink: (amount_cents: number) =>
    apiRequest('/payment-links/quote', {
      method: 'POST',
      body: JSON.stringify({ amount_cents })
    }),

  // Provider & Business RUC Recognition (SUNAT)
  lookupBusinessByRuc: (ruc: string) => apiRequest(`/kyc/business-lookup/${ruc}`),
  confirmBusinessRegistration: (data: { session_id?: string; ruc: string; legal_rep_doc_type?: 'DNI' | 'CE'; legal_rep_dni?: string; whatsapp?: string }) =>
    apiRequest('/businesses/confirm', {
      method: 'POST',
      body: JSON.stringify(data)
    }).then((res: any) => {
      if (res?.provider_id) {
        setProviderId(res.provider_id);
        if (res.provider_token) setProviderToken(res.provider_token);
      }
      return res;
    }),
  getSunatStats: () => apiRequest('/kyc/sunat-stats'),
  lookupRuc: (ruc: string) => apiRequest(`/kyc/business-lookup/${ruc}`),
  startKycRequest: (data: { session_id?: string; ruc: string; legal_rep_dni: string; whatsapp: string }) =>
    apiRequest('/kyc/requests', {
      method: 'POST',
      body: JSON.stringify(data)
    }),
  getKycStatus: (requestId: string) => apiRequest(`/kyc/requests/${requestId}`),
  startProviderVerification: (requestId: string) =>
    apiRequest<{ provider: 'DIDIT' | 'DEMO'; url: string | null; status: string }>(`/kyc/requests/${requestId}/verification`, { method: 'POST' }),
  submitProviderKycDocuments: (requestId: string, data: { dni_front?: string; dni_back?: string; selfie?: string }) =>
    apiRequest(`/kyc/requests/${requestId}/documents`, {
      method: 'POST',
      body: JSON.stringify(data)
    }),
  saveProviderActivity: (data: { category: string; seniority_range: string }) =>
    apiRequest('/providers/activity', {
      method: 'PUT',
      body: JSON.stringify(data)
    }),
  reverseGeocode: (lat: number, lng: number) =>
    apiRequest('/geo/reverse', {
      method: 'POST',
      body: JSON.stringify({ lat, lng })
    }),
  lookupIpLocation: () => apiRequest('/geo/ip-lookup'),
  searchAddress: (query: string) => apiRequest(`/geo/search?q=${encodeURIComponent(query)}`),
  saveProviderLocation: (data: { lat: number; lng: number; address_line: string; district?: string }) =>
    apiRequest('/providers/location', {
      method: 'PUT',
      body: JSON.stringify(data)
    }),
  getNotificationPreferences: () => apiRequest<NotificationState>('/merchants/me/notifications/preferences'),
  saveNotificationPreferences: (prefs: { push_enabled: boolean; workshop_reminder: boolean }) =>
    apiRequest<NotificationState>('/merchants/me/notifications/preferences', {
      method: 'PUT',
      body: JSON.stringify(prefs)
    }),
  markNotificationsSeen: () =>
    apiRequest<{ unread_count: number }>('/merchants/me/notifications/seen', { method: 'POST' }),
  saveProviderNotifications: (consent: string = 'GRANTED') =>
    apiRequest('/providers/notifications', {
      method: 'PUT',
      body: JSON.stringify({ consent })
    }),
  saveSettlementAccount: (data: { bank: string; cci: string; pin: string }) =>
    apiRequest('/providers/settlement-account', {
      method: 'PUT',
      body: JSON.stringify(data)
    }),
  getProviderOrders: () => apiRequest('/providers/orders'),
  getSavingsEstimate: () => apiRequest('/providers/savings-estimate'),
  activateProvider: () => apiRequest('/providers/activate', { method: 'POST' }),
  getRecommendedProviders: () => apiRequest('/providers/recommended'),
  getAffiliatedProviders: () => apiRequest('/providers/affiliated'),
  getProviderByQr: (code: string) => apiRequest(`/providers/by-qr?code=${encodeURIComponent(code)}`),
  createPurchase: (data: { provider_id: string; total_cents: number; installments?: number }) =>
    apiRequest('/credit/purchases', {
      method: 'POST',
      body: JSON.stringify(data)
    }),

  // Scoring — Bloque 1
  getMyScore: () => apiRequest('/credit/score/me'),
  postScoringSignal: (type: string, ref_id?: string) =>
    apiRequest('/credit/scoring/signals', {
      method: 'POST',
      body: JSON.stringify({ type, ref_id })
    }),

  // Bloque 4: conformidad Openpay (sandbox)
  sandboxOpenpayPay: (purchaseId: string) =>
    apiRequest('/sandbox/openpay/pay', {
      method: 'POST',
      body: JSON.stringify({ purchase_id: purchaseId })
    })
};
