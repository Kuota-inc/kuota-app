// P0-8: tope de gasto en Didit. Antes de crear cualquier sesión de Didit se
// verifica que el comerciante no supere el límite diario por cuenta ni el
// tope global del día (costo de API). Ajustar con variables de entorno:
//   DIDIT_PER_MERCHANT_DAILY_CAP  — sesiones Didit por comerciante por 24 h (default 3)
//   DIDIT_GLOBAL_DAILY_CAP        — sesiones Didit totales por día UTC (default 100)
import { db } from '../db/database.js';
import { randomToken } from './crypto.js';

function perMerchantCap() { return Number(process.env.DIDIT_PER_MERCHANT_DAILY_CAP ?? 3); }
function globalDailyCap() { return Number(process.env.DIDIT_GLOBAL_DAILY_CAP ?? 100); }

/**
 * Verifica los topes y registra la nueva sesión.
 * Lanza con status 429 si se excede algún límite.
 * Llama antes de cada `didit.createSession` / `didit.createRecoverySession`.
 */
export async function checkAndLogDiditSession(merchantKey: string, type: 'KYC' | 'RECOVERY'): Promise<void> {
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const todayUtc = new Date().toISOString().slice(0, 10); // 'YYYY-MM-DD'

  const [merchantCount, globalCount] = (await Promise.all([
    db.prepare(
      "SELECT COUNT(*) as n FROM didit_session_log WHERE merchant_key = ? AND created_at >= ?"
    ).get(merchantKey, since24h),
    db.prepare(
      "SELECT COUNT(*) as n FROM didit_session_log WHERE created_at >= ?"
    ).get(todayUtc + 'T00:00:00.000Z'),
  ])) as [{ n: number }, { n: number }];

  if (merchantCount.n >= perMerchantCap()) {
    const err: any = new Error('Límite de verificaciones Didit alcanzado para este comerciante.');
    err.status = 429;
    err.code = 'DIDIT_MERCHANT_CAP_EXCEEDED';
    throw err;
  }
  if (globalCount.n >= globalDailyCap()) {
    const err: any = new Error('Capacidad de verificaciones del día agotada. Intenta mañana.');
    err.status = 429;
    err.code = 'DIDIT_GLOBAL_CAP_EXCEEDED';
    throw err;
  }

  await db.prepare(
    "INSERT INTO didit_session_log (id, merchant_key, type) VALUES (?, ?, ?)"
  ).run('dsl_' + randomToken(8), merchantKey, type);
}
