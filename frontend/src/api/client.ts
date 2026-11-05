// URL del backend: VITE_API_BASE (p. ej. la IP de la PC en la red Wi-Fi para el APK,
// ver .env.android); por defecto el backend local de desarrollo.
export const API_BASE = ((import.meta.env.VITE_API_BASE as string | undefined) || 'http://localhost:3001/api/v1').replace(/\/+$/, '');

// Sin timeout, un backend inalcanzable (celular fuera de la red) dejaría las
// pantallas cargando indefinidamente.
const TIMEOUT_MS = 8000;

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

export async function apiRequest<T = any>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const url = `${API_BASE}${endpoint}`;
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {})
  };
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(url, { ...options, headers, signal: options.signal ?? controller.signal });
    const data = res.status === 204 ? null : await res.json().catch(() => null);
    if (!res.ok) {
      throw new ApiError(res.status, data?.error?.code ?? `HTTP_${res.status}`, data?.error?.message || `Error ${res.status}: ${res.statusText}`, data);
    }
    return data as T;
  } catch (err: any) {
    // Solo fallas inesperadas (red o servidor); los 4xx son flujos que maneja la interfaz
    // (PIN, límites, confirmaciones). Sin el cuerpo: puede traer datos del comercio.
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
  saveMerchantIdentity: (sessionId: string, data: { account_type?: 'PERSONAL' | 'BUSINESS'; ruc?: string; dni: string; full_name: string; phone: string; whatsapp_opt_in?: boolean }) =>
    apiRequest(`/onboarding/sessions/${sessionId}/merchant-identity`, {
      method: 'POST',
      body: JSON.stringify(data)
    }),
  getMerchantKycStatus: (requestId: string) => apiRequest(`/onboarding/merchant-kyc/${requestId}`),
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
    }),
  setSecurityPin: (sessionId: string, pin: string) =>
    apiRequest(`/onboarding/sessions/${sessionId}/security-pin`, {
      method: 'POST',
      body: JSON.stringify({ pin })
    }),

  // Merchant Dashboard
  getHome: () => apiRequest('/merchants/me/home'),
  getKuotearModal: () => apiRequest('/merchants/me/kuotear'),
  getWelcomeSummary: () => apiRequest('/merchants/me/welcome-summary'),
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

  // Payment Links: cotización pública; el resto (con sesión y PIN) está en api/payments.ts
  quotePaymentLink: (amount_cents: number) =>
    apiRequest('/payment-links/quote', {
      method: 'POST',
      body: JSON.stringify({ amount_cents })
    }),

  // Provider & Business RUC Recognition (SUNAT)
  lookupBusinessByRuc: (ruc: string) => apiRequest(`/kyc/business-lookup/${ruc}`),
  confirmBusinessRegistration: (data: { session_id?: string; ruc: string; legal_rep_dni?: string; whatsapp?: string }) =>
    apiRequest('/businesses/confirm', {
      method: 'POST',
      body: JSON.stringify(data)
    }),
  getSunatStats: () => apiRequest('/kyc/sunat-stats'),
  lookupRuc: (ruc: string) => apiRequest(`/kyc/business-lookup/${ruc}`),
  startKycRequest: (data: { session_id?: string; ruc: string; legal_rep_dni: string; whatsapp: string }) =>
    apiRequest('/kyc/requests', {
      method: 'POST',
      body: JSON.stringify(data)
    }),
  getKycStatus: (requestId: string) => apiRequest(`/kyc/requests/${requestId}`),
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
  saveSettlementAccount: (data: { bank: string; cci: string; holder_name: string; holder_doc: string }) =>
    apiRequest('/providers/settlement-account', {
      method: 'PUT',
      body: JSON.stringify(data)
    }),
  getSavingsEstimate: () => apiRequest('/providers/savings-estimate'),
  activateProvider: () => apiRequest('/providers/activate', { method: 'POST' }),
  getRecommendedProviders: () => apiRequest('/providers/recommended')
};
