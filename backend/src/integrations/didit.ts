// Cliente de Didit (verificación de identidad: documento, prueba de vida y
// comparación facial). Docs: https://docs.didit.me
//   API:  https://verification.didit.me/v3  · cabecera x-api-key
//   Keys: sk_test_… (sandbox, gratis) / sk_live_…
// Se activa con DIDIT_API_KEY y DIDIT_WORKFLOW_ID. Sin ellos, Kuota usa el modo
// demo (solo fuera de producción).
import crypto from 'node:crypto';

const TIMEOUT_MS = 10_000;
const base = () => (process.env.DIDIT_BASE_URL || 'https://verification.didit.me').replace(/\/+$/, '');

export const diditEnabled = () => !!(process.env.DIDIT_API_KEY && process.env.DIDIT_WORKFLOW_ID);
export const diditRecoveryEnabled = () => !!(process.env.DIDIT_API_KEY && process.env.DIDIT_RECOVERY_WORKFLOW_ID);

export class DiditError extends Error {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(message);
    this.name = 'DiditError';
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${base()}${path}`, {
      method,
      headers: { 'x-api-key': process.env.DIDIT_API_KEY ?? '', 'Content-Type': 'application/json', Accept: 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal
    });
    const json = (await res.json().catch(() => null)) as any;
    if (!res.ok) {
      const detail = json?.detail ?? (json ? JSON.stringify(json).slice(0, 200) : `HTTP ${res.status}`);
      throw new DiditError(res.status, `Didit respondió ${res.status}: ${detail}`);
    }
    return json as T;
  } catch (e) {
    if (e instanceof DiditError) throw e;
    throw new DiditError(0, `No se pudo conectar con Didit: ${(e as Error).name === 'AbortError' ? 'tiempo agotado' : (e as Error).message}`);
  } finally {
    clearTimeout(timer);
  }
}

export interface DiditSession {
  session_id: string;
  url: string;
  status: string;
  vendor_data?: string;
}

/** Item de una verificación dentro de la decisión (id_verifications, liveness_checks, face_matches). */
export interface DiditCheck {
  status?: string;
  score?: number;
  document_number?: string;
  personal_number?: string;
  first_name?: string;
  last_name?: string;
  full_name?: string;
  date_of_birth?: string;
  [k: string]: unknown;
}

export interface DiditDecision {
  session_id: string;
  status: string;
  vendor_data?: string;
  id_verifications?: DiditCheck[];
  liveness_checks?: DiditCheck[];
  face_matches?: DiditCheck[];
  [k: string]: unknown;
}

export const didit = {
  /** Crea la sesión de verificación; el usuario completa el flujo en `url`. */
  createSession: (input: { vendor_data: string; callback?: string; expected_details?: Record<string, unknown>; language?: string }) =>
    request<DiditSession>('POST', '/v3/session/', { workflow_id: process.env.DIDIT_WORKFLOW_ID, ...input }),
  /** Crea sesión solo con prueba de vida (workflow de recuperación de PIN). */
  createRecoverySession: (input: { vendor_data: string; expected_details?: Record<string, unknown>; language?: string }) =>
    request<DiditSession>('POST', '/v3/session/', { workflow_id: process.env.DIDIT_RECOVERY_WORKFLOW_ID, ...input }),
  getDecision: (sessionId: string) => request<DiditDecision>('GET', `/v3/session/${encodeURIComponent(sessionId)}/decision/`)
};

// ------------------------------------------------------------- webhook
const hmacHex = (secret: string, data: string) => crypto.createHmac('sha256', secret).update(data, 'utf8').digest('hex');

const safeEqual = (a: string, b: string) => {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
};

/** JSON compacto con claves ordenadas (base de X-Signature-V2). */
function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  return `{${Object.keys(value as object)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${canonical((value as Record<string, unknown>)[k])}`)
    .join(',')}}`;
}

/**
 * Verifica un webhook de Didit: X-Timestamp dentro de ±300 s y firma HMAC-SHA256
 * (hex) con DIDIT_WEBHOOK_SECRET. Acepta X-Signature-V2 (JSON canónico) o
 * X-Signature (cuerpo crudo), y sus variantes *-Previous durante una rotación.
 */
export function verifyDiditWebhook(rawBody: string, headers: Record<string, string | undefined>): boolean {
  const secret = process.env.DIDIT_WEBHOOK_SECRET;
  if (!secret) return false;
  const ts = Number(headers['x-timestamp']);
  if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > 300) return false;
  let parsed: unknown = null;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return false;
  }
  const candidates: [string | undefined, string][] = [
    [headers['x-signature-v2'], hmacHex(secret, canonical(parsed))],
    [headers['x-signature-v2-previous'], hmacHex(secret, canonical(parsed))],
    [headers['x-signature'], hmacHex(secret, rawBody)],
    [headers['x-signature-previous'], hmacHex(secret, rawBody)]
  ];
  return candidates.some(([sig, expected]) => !!sig && safeEqual(sig, expected));
}

export const signDiditWebhook = (rawBody: string, secret: string) => hmacHex(secret, rawBody);
