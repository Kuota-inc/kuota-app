// Primitivas criptográficas de Kuota Payments (node:crypto, sin dependencias).
import crypto from 'crypto';
import { secrets } from './config.js';

/** Token opaco de alta entropía (128 bits por defecto), apto para URLs. */
export function randomToken(bytes = 16): string {
  return crypto.randomBytes(bytes).toString('base64url');
}

/** Identificador no predecible con prefijo legible (p. ej. lnk_3f9c…). */
export function randomId(prefix: string, bytes = 10): string {
  return `${prefix}_${crypto.randomBytes(bytes).toString('hex')}`;
}

export function hmac(key: string, data: string | Buffer, encoding: 'hex' | 'base64url' = 'hex'): string {
  return crypto.createHmac('sha256', key).update(data).digest(encoding);
}

export function sha256Hex(data: string | Buffer): string {
  return crypto.createHash('sha256').update(data).digest('hex');
}

/** Comparación en tiempo constante (no filtra cuántos caracteres coinciden). */
export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}

/** JSON con claves ordenadas: misma entrada, mismo hash. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value ?? null);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`;
}

// ---------------------------------------------------------------- PIN
// scrypt (memoria-intensivo) sobre HMAC(pimienta, PIN). Un PIN de 6 dígitos solo
// tiene 10^6 combinaciones: la pimienta (fuera de la base) y el bloqueo por
// intentos son lo que impide probarlas todas.
const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 32 };

function peppered(pin: string): Buffer {
  return crypto.createHmac('sha256', secrets.pinPepper).update(pin).digest();
}

export function hashPin(pin: string): string {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(peppered(pin), salt, SCRYPT.keylen, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p });
  return ['scrypt', SCRYPT.N, SCRYPT.r, SCRYPT.p, salt.toString('base64url'), hash.toString('base64url')].join('$');
}

export function verifyPin(pin: string, stored: string): boolean {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const [, n, r, p, saltB64, hashB64] = parts;
  const expected = Buffer.from(hashB64, 'base64url');
  const actual = crypto.scryptSync(peppered(pin), Buffer.from(saltB64, 'base64url'), expected.length, {
    N: Number(n),
    r: Number(r),
    p: Number(p)
  });
  return crypto.timingSafeEqual(actual, expected);
}

export function isPinHash(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith('scrypt$');
}

const WEAK_PINS = new Set([
  '123456', '654321', '000000', '111111', '222222', '333333', '444444',
  '555555', '666666', '777777', '888888', '999999', '123123', '112233'
]);

/** Devuelve un mensaje si el PIN no es aceptable; null si sirve. */
export function pinProblem(pin: unknown): string | null {
  if (typeof pin !== 'string' || !/^\d{6}$/.test(pin)) {
    return 'El PIN de seguridad debe contener exactamente 6 dígitos numéricos.';
  }
  if (WEAK_PINS.has(pin)) {
    return 'Por tu seguridad, no uses combinaciones obvias como 123456 o números repetidos.';
  }
  return null;
}
