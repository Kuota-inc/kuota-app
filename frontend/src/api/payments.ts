// Kuota Payments desde la app: sesión corta con PIN ligada a este dispositivo,
// confirmación con PIN cuando el backend la pide (STEP_UP_REQUIRED) e
// idempotencia en la creación de cobros.
import { Capacitor } from '@capacitor/core';
import { ApiError, apiRequest, setMerchantToken } from './client';

// ------------------------------------------------------------- dispositivo
const DEVICE_KEY = 'kuota.device_id';
let memoryDeviceId: string | null = null;

function randomHex(bytes: number): string {
  const b = new Uint8Array(bytes);
  crypto.getRandomValues(b);
  return [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
}

/** Identificador estable de esta instalación (no es un secreto: la sesión exige el PIN). */
export function deviceId(): string {
  try {
    const stored = localStorage.getItem(DEVICE_KEY);
    if (stored && /^[A-Za-z0-9_-]{16,64}$/.test(stored)) return stored;
  } catch {
    /* almacenamiento no disponible */
  }
  memoryDeviceId ??= randomHex(16);
  try {
    localStorage.setItem(DEVICE_KEY, memoryDeviceId);
  } catch {
    /* se usa el de memoria */
  }
  return memoryDeviceId;
}

function deviceLabel(): string {
  if (Capacitor.isNativePlatform()) return `App Kuota (${Capacitor.getPlatform() === 'android' ? 'Android' : Capacitor.getPlatform()})`;
  const ua = navigator.userAgent;
  const os = /Android/i.test(ua) ? 'Android' : /iPhone|iPad/i.test(ua) ? 'iPhone' : /Windows/i.test(ua) ? 'Windows' : /Mac/i.test(ua) ? 'Mac' : 'Web';
  return `Navegador (${os})`;
}

// ------------------------------------------------------------- PIN
export interface PinPromptOptions {
  title: string;
  /** 'action': el resumen es la operación que se autoriza (queda en el consentimiento). */
  kind: 'session' | 'action';
  summary?: string | null;
  /** Verifica el PIN contra el backend; si lanza, el panel muestra el error y sigue abierto. */
  verify: (pin: string) => Promise<void>;
}
type PinHandler = (opts: PinPromptOptions) => Promise<void>;

let pinHandler: PinHandler | null = null;
/** Lo registra el PinPromptProvider (components/PinPrompt.tsx). */
export function setPinHandler(handler: PinHandler | null) {
  pinHandler = handler;
}

export class CancelledError extends Error {
  constructor() {
    super('Operación cancelada.');
    this.name = 'CancelledError';
  }
}
export const isCancelled = (e: unknown) => e instanceof CancelledError;

function askPin(opts: PinPromptOptions): Promise<void> {
  if (!pinHandler) return Promise.reject(new ApiError(0, 'NO_PIN_UI', 'No se pudo pedir el PIN.'));
  return pinHandler(opts);
}

// ------------------------------------------------------------- sesión
// Solo en memoria: al cerrar la app se pide el PIN otra vez (sesiones cortas).
let session: { token: string; expiresAt: number } | null = null;
let opening: Promise<void> | null = null;

const authHeaders = (): Record<string, string> => ({
  Authorization: `Bearer ${session?.token ?? ''}`,
  'X-Device-Id': deviceId()
});

function openSession(summary = 'Para cobrar con Kuota confirmamos que eres tú.'): Promise<void> {
  opening ??= askPin({
    title: 'Ingresa tu PIN',
    kind: 'session',
    summary,
    verify: async (pin) => {
      const r = await apiRequest<{ access_token: string; expires_at: string; identity_token?: string }>('/auth/sessions', {
        method: 'POST',
        body: JSON.stringify({ pin, device_id: deviceId(), device_label: deviceLabel() })
      });
      // Cada inicio de sesión rota el token de identidad del dispositivo: hay que guardar el nuevo.
      if (r.identity_token) setMerchantToken(r.identity_token);
      session = { token: r.access_token, expiresAt: Date.parse(r.expires_at) };
    }
  }).finally(() => {
    opening = null;
  });
  return opening;
}

/** Descarta la sesión de cobros en memoria: la próxima operación con dinero vuelve a pedir el PIN. */
export function forgetSession() {
  session = null;
}

/** Bloqueo de la app: descarta la sesión en memoria y pide el PIN (se verifica en el servidor). */
export function unlockWithPin(): Promise<void> {
  session = null;
  return openSession('Para abrir Kuota confirma que eres tú.');
}

export async function logout() {
  if (!session) return;
  try {
    await apiRequest('/auth/sessions/current', { method: 'DELETE', headers: authHeaders() });
  } finally {
    session = null;
  }
}

const SESSION_CODES = new Set(['SESSION_REQUIRED', 'SESSION_EXPIRED', 'SESSION_REVOKED', 'DEVICE_MISMATCH']);

/** Sin sesión vigente en una consulta de fondo (silent): falla sin pedir el PIN. */
async function secureRequest<T>(endpoint: string, options: RequestInit & { silent?: boolean } = {}, attempt = 0): Promise<T> {
  if (!session || session.expiresAt - Date.now() < 15_000) {
    if (options.silent) throw new ApiError(401, 'SESSION_REQUIRED', 'Sesión vencida.');
    await openSession();
  }
  const { silent: _silent, ...init } = options;
  try {
    return await apiRequest<T>(endpoint, { ...init, headers: { ...(init.headers as Record<string, string>), ...authHeaders() } });
  } catch (e) {
    if (!(e instanceof ApiError)) throw e;
    if (SESSION_CODES.has(e.code) && attempt === 0 && !options.silent) {
      session = null;
      return secureRequest<T>(endpoint, options, attempt + 1);
    }
    const stepUp = e.code === 'STEP_UP_REQUIRED' ? e.data?.error?.step_up : null;
    if (stepUp?.summary && attempt < 2) {
      let grant = '';
      await askPin({
        title: 'Confirma con tu PIN',
        kind: 'action',
        summary: stepUp.summary,
        verify: async (pin) => {
          const r = await apiRequest<{ step_up_token: string }>('/auth/step-up', {
            method: 'POST',
            headers: authHeaders(),
            body: JSON.stringify({ pin, action: stepUp.action, params: stepUp.params })
          });
          grant = r.step_up_token;
        }
      });
      return secureRequest<T>(endpoint, { ...options, headers: { ...(options.headers as Record<string, string>), 'X-Step-Up-Token': grant } }, attempt + 1);
    }
    throw e;
  }
}

// ------------------------------------------------------------- tipos
export type LinkStatus = 'DRAFT' | 'ACTIVE' | 'ON_HOLD' | 'PAID' | 'CANCELLED' | 'EXPIRED';

export interface PaymentLink {
  id: string;
  amount_cents: number;
  fee_cents: number;
  net_cents: number;
  currency: string;
  concept: string | null;
  status: LinkStatus;
  expires_at: string;
  created_at: string;
  paid_at: string | null;
  url: string | null;
  code?: string;
  /** Código de 360pay para pagar en bancos y agentes. */
  payment_code?: string | null;
  risk?: { decision: 'APPROVE' | 'REVIEW' };
}

export interface PublicLink {
  code: string;
  merchant: { name: string; verification: 'VERIFIED' | 'BASIC'; ruc_masked: string | null; city: string | null };
  concept: string | null;
  amount_cents: number;
  currency: string;
  expires_at: string;
  payment_code?: string | null;
}

export interface PaymentLimits {
  tier: 'BASIC' | 'EXTENDED';
  tier_label: string;
  tier_max: LimitValues;
  own: LimitValues;
  per_tx_cents: number;
  daily_cents: number;
  daily_count: number;
  step_up_over_cents: number;
  cooldown_until: string | null;
  pending: (LimitValues & { effective_at: string }) | null;
  usage_today: { count: number; amount_cents: number };
}

export interface LimitValues {
  per_tx_cents: number;
  daily_cents: number;
  daily_count: number;
}

export interface LinkedDevice {
  ref: string;
  id_suffix: string;
  label: string;
  current: boolean;
  first_seen_at: string;
  last_seen_at: string;
  cooldown_until: string | null;
}

export interface SecurityAlert {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  created_at: string;
}

/** Clave nueva por intento de cobro: si la red falla y se reintenta, no se duplica. */
export const newIdempotencyKey = () => randomHex(16);

// ------------------------------------------------------------- API
export const paymentsApi = {
  createLink: (data: { amount_cents: number; concept?: string }, idempotencyKey: string) =>
    secureRequest<PaymentLink>('/payment-links', {
      method: 'POST',
      headers: { 'Idempotency-Key': idempotencyKey },
      body: JSON.stringify(data)
    }),
  issueLink: (id: string) => secureRequest<PaymentLink & { url: string; code: string }>(`/payment-links/${id}/issue`, { method: 'POST' }),
  cancelLink: (id: string) => secureRequest<PaymentLink>(`/payment-links/${id}/cancel`, { method: 'POST' }),
  getLink: (id: string) => secureRequest<PaymentLink>(`/payment-links/${id}`),
  /** Consulta de fondo del estado: nunca abre el pedido de PIN. */
  /** Lista de links del comercio; solo con sesión de cobros abierta (no pide el PIN). */
  listLinks: () => secureRequest<{ data: PaymentLink[] }>('/payment-links', { silent: true }),
  pollLink: (id: string) => secureRequest<PaymentLink>(`/payment-links/${id}`, { silent: true }),

  getLimits: () => secureRequest<PaymentLimits>('/merchants/me/payments/limits'),
  updateLimits: (values: LimitValues) =>
    secureRequest<PaymentLimits>('/merchants/me/payments/limits', { method: 'PUT', body: JSON.stringify(values) }),
  cancelPendingLimits: () => secureRequest<PaymentLimits>('/merchants/me/payments/limits/pending', { method: 'DELETE' }),
  getDevices: () => secureRequest<{ data: LinkedDevice[] }>('/merchants/me/payments/devices'),
  /** Una sola sesión por cuenta: cierra la sesión en todos los demás dispositivos. */
  closeOtherSessions: () => secureRequest<{ success: boolean; sessions_closed: number }>('/auth/sessions/others/close', { method: 'POST' }),
  revokeDevice: (ref: string) => secureRequest<{ success: boolean }>(`/merchants/me/payments/devices/${encodeURIComponent(ref)}`, { method: 'DELETE' }),
  getAlerts: () => secureRequest<{ data: SecurityAlert[] }>('/merchants/me/payments/alerts'),
  changePin: (current_pin: string, new_pin: string) =>
    secureRequest<{ success: boolean; sessions_closed: number; cooldown_until: string }>('/auth/pin/change', {
      method: 'POST',
      body: JSON.stringify({ current_pin, new_pin })
    }),

  // Lado del pagador (sin sesión)
  getPublicLink: (code: string) => apiRequest<PublicLink>(`/payment-links/public/${encodeURIComponent(code)}`),
  /** Simulador de la página de pago de 360pay (solo desarrollo). */
  sandboxPay: (code: string, method: 'YAPE' | 'PLIN' | 'CARD' = 'YAPE') =>
    apiRequest<{ webhook: { status: string; reason: string | null } }>('/sandbox/360pay/pay', {
      method: 'POST',
      body: JSON.stringify({ code, method })
    })
};
