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

/** 360pay de producción: API key presente y URL que no es el sandbox ni un simulador local. */
function liveGateway(): boolean {
  const url = process.env.KUOTA_360PAY_BASE_URL || 'https://sandbox.api.360pay.pe/v1';
  return !!process.env.KUOTA_360PAY_API_KEY && !/sandbox|localhost|127\.0\.0\.1/i.test(url);
}

const DEV_ORIGINS = ['http://localhost:5173', 'http://127.0.0.1:5173', 'http://localhost', 'capacitor://localhost'];

export const config = {
  isProd,
  /** Comisión por cobro en puntos básicos (100 = 1 %). Configurable con KUOTA_FEE_BPS hasta cerrar el tarifario con 360pay. */
  feeBps: Math.min(intEnv('KUOTA_FEE_BPS', 100), 1000),
  /** Simulador de 360pay (pago del cliente): solo fuera de producción. */
  // En producción solo con KUOTA_SANDBOX=1 explícito (fase de pruebas sin pasarela real):
  // mientras esté activo, cualquiera con el código de un link puede marcarlo como pagado.
  // Nunca con la pasarela de 360pay de producción conectada: el simulador permitiría marcar cobros reales como pagados.
  sandboxEnabled: isProd ? process.env.KUOTA_SANDBOX === '1' && !liveGateway() : process.env.KUOTA_SANDBOX !== '0',
  /** Base pública de la página de pago a la que apunta el link y el QR. */
  payBaseUrl: (process.env.KUOTA_PAY_BASE_URL || 'http://localhost:5173/pay').replace(/\/+$/, ''),
  // El APK carga la app desde https://localhost (WebView con esquema https): ese origen siempre se acepta,
  // un sitio web externo no puede usarlo.
  corsOrigins: [...new Set([...(process.env.KUOTA_CORS_ORIGINS || DEV_ORIGINS.join(',')).split(','), 'https://localhost'])]
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

/**
 * P0-9: valida la configuración obligatoria de producción.
 * Llama desde createApp() antes de aceptar tráfico.
 * Los 5 secretos de Secrets ya se validan al importar config.ts (loadSecrets).
 * Aquí se validan el resto de las variables críticas de operación.
 */
export function assertProductionEnv(): void {
  if (!isProd) return;

  // Variables sin las cuales el sistema tiene un agujero de seguridad conocido.
  const critical: [string, string][] = [
    ['DIDIT_WEBHOOK_SECRET',      'verificación de webhooks Didit (sin él cualquiera puede aprobar KYC)'],
    ['KUOTA_PLAY_INTEGRITY_KEY',  'Play Integrity (sin él las compras no validan la integridad del APK)'],
  ];

  // Variables sin las cuales el sistema opera en modo degradado o con datos incorrectos.
  const required: [string, string][] = [
    ['DIDIT_API_KEY',             'verificación de identidad Didit (KYC)'],
    ['DIDIT_WORKFLOW_ID',         'flujo de KYC de Didit'],
    ['DIDIT_RECOVERY_WORKFLOW_ID','flujo de recuperación de PIN con liveness'],
    ['OPENPAY_MERCHANT_ID',       'cobro de enganches con Openpay'],
    ['OPENPAY_PRIVATE_KEY',       'autenticación con Openpay'],
    ['KUOTA_PAY_BASE_URL',        'URL base de la página de cobro (sin ella los links apuntan a localhost)'],
  ];

  const missingCritical = critical.filter(([k]) => !process.env[k]);
  const missingRequired = required.filter(([k]) => !process.env[k]);

  if (missingRequired.length > 0) {
    const lines = missingRequired.map(([k, desc]) => `  ${k}  — ${desc}`).join('\n');
    console.error(`[CONFIG] Variables de producción no configuradas:\n${lines}`);
    console.error('[CONFIG] El proceso continuará, pero algunas funciones operarán en modo degradado.');
  }

  if (missingCritical.length > 0) {
    const lines = missingCritical.map(([k, desc]) => `  ${k}  — ${desc}`).join('\n');
    throw new Error(
      `[CONFIG] Variables críticas de seguridad no configuradas; el proceso no puede arrancar en producción:\n${lines}`
    );
  }
}
