// Configuración y secretos de Kuota Payments.
//
// Producción (NODE_ENV=production): todos los secretos deben venir del entorno
// (Secrets Manager / KMS); si falta alguno el proceso no arranca.
// Desarrollo: si faltan, se generan una sola vez en backend/.dev-secrets.json
// (ignorado por git) para que los links firmados sobrevivan a reinicios.
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

export const isProd = process.env.NODE_ENV === 'production';

export interface Secrets {
  /** Firma de links de cobro (integridad de monto, titular y vencimiento). */
  linkSigningKey: string;
  /** Secreto compartido con 360pay para firmar webhooks (HMAC-SHA256). */
  webhookSecret: string;
  /** Firma de los tokens de sesión del comercio. */
  sessionSecret: string;
  /** Pimienta del hash de PIN: sin ella, una copia de la base no basta para probar PINs. */
  pinPepper: string;
  /** Token de las rutas internas (conciliación, auditoría, riesgo). */
  adminToken: string;
}

const SECRET_ENV: Record<keyof Secrets, string> = {
  linkSigningKey: 'KUOTA_LINK_SIGNING_KEY',
  webhookSecret: 'KUOTA_WEBHOOK_SECRET',
  sessionSecret: 'KUOTA_SESSION_SECRET',
  pinPepper: 'KUOTA_PIN_PEPPER',
  adminToken: 'KUOTA_ADMIN_TOKEN'
};

function loadSecrets(): Secrets {
  const out: Partial<Secrets> = {};
  const missing: (keyof Secrets)[] = [];
  for (const [key, env] of Object.entries(SECRET_ENV) as [keyof Secrets, string][]) {
    const value = process.env[env];
    if (value && value.length >= 32) out[key] = value;
    else missing.push(key);
  }
  if (missing.length === 0) return out as Secrets;
  if (isProd) {
    throw new Error(
      `Faltan secretos (mínimo 32 caracteres): ${missing.map((k) => SECRET_ENV[k]).join(', ')}`
    );
  }

  const file = process.env.KUOTA_DEV_SECRETS_FILE || path.resolve(process.cwd(), '.dev-secrets.json');
  let stored: Partial<Secrets> = {};
  try {
    stored = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    stored = {};
  }
  let changed = false;
  for (const key of missing) {
    if (!stored[key]) {
      stored[key] = crypto.randomBytes(32).toString('base64url');
      changed = true;
    }
    out[key] = stored[key];
  }
  if (changed) fs.writeFileSync(file, JSON.stringify(stored, null, 2) + '\n', { mode: 0o600 });
  return out as Secrets;
}

export const secrets: Secrets = loadSecrets();

function intEnv(name: string, fallback: number): number {
  const n = Number(process.env[name]);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

const DEV_ORIGINS = ['http://localhost:5173', 'http://127.0.0.1:5173', 'http://localhost', 'capacitor://localhost'];

export const config = {
  isProd,
  /** Simulador de 360pay (pago del cliente): solo fuera de producción. */
  sandboxEnabled: !isProd && process.env.KUOTA_SANDBOX !== '0',
  /** Base pública de la página de pago a la que apunta el link y el QR. */
  payBaseUrl: (process.env.KUOTA_PAY_BASE_URL || 'http://localhost:5173/pay').replace(/\/+$/, ''),
  corsOrigins: (process.env.KUOTA_CORS_ORIGINS || DEV_ORIGINS.join(','))
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  /** Ventana anti-repetición de webhooks (igual que el sandbox de 360pay). */
  webhookToleranceSec: 300,
  sessionTtlSec: intEnv('KUOTA_SESSION_TTL_SEC', 15 * 60),
  stepUpTtlSec: 120,
  pinMaxAttempts: isProd ? 5 : (process.env.NODE_ENV === 'test' ? 5 : 999),
  pinLockMinutes: isProd ? 15 : (process.env.NODE_ENV === 'test' ? 15 : 0),
  /** Enfriamiento tras vincular un dispositivo nuevo o cambiar el PIN. */
  cooldownHours: 24,
  cooldownFactor: 0.25,
  /** Espera para que una subida de límites entre en vigor. */
  limitRaiseDelayHours: 24,
  linkTtlHours: 48,
  /** Topes que impone 360pay: siempre se aplica el más restrictivo. */
  partnerLimits: {
    perTxCents: intEnv('KUOTA_PARTNER_MAX_TX_CENTS', 1_000_000),
    dailyCents: intEnv('KUOTA_PARTNER_MAX_DAILY_CENTS', 5_000_000),
    dailyCount: intEnv('KUOTA_PARTNER_MAX_DAILY_COUNT', 500)
  },
  /**
   * Openpay (https://github.com/open-pay) — pasarela para confirmar enganches.
   * Sin OPENPAY_MERCHANT_ID: modo mock (sandbox local); el webhook /sandbox/openpay/pay
   * simula la confirmación. En producción se recomienda pasar las tres variables.
   */
  openpay: {
    merchantId: process.env.OPENPAY_MERCHANT_ID ?? '',
    privateKey: process.env.OPENPAY_PRIVATE_KEY ?? '',
    /** false = producción Openpay (sandbox.openpay.pe → api.openpay.pe). */
    isSandbox: process.env.OPENPAY_IS_SANDBOX !== 'false'
  }
};

/** Orígenes de la red local permitidos en desarrollo (celular en la misma Wi-Fi). */
const PRIVATE_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)(:\d+)?$/;

export function isAllowedOrigin(origin: string): boolean {
  if (config.corsOrigins.includes(origin)) return true;
  return !isProd && PRIVATE_ORIGIN.test(origin);
}
