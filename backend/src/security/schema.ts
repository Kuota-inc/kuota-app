// Datos de arranque de Kuota Payments. Las tablas, índices y triggers están en
// migrations/0002_payments.sql; aquí solo las reglas antifraude por defecto,
// los interruptores de funciones y el PIN de la cuenta demo.
import { paymentsDb as db } from '../db/client.js';
import { hashPin } from './crypto.js';
import { isProd } from './config.js';
import { DEFAULT_RULES } from './riskRules.js';

/** PIN de la cuenta demo (mer_carlos), solo fuera de producción. Ver README. */
export const DEMO_MERCHANT_PIN = process.env.KUOTA_DEMO_PIN || '482915';

export async function seedSecurity() {
  const now = new Date().toISOString();
  for (const rule of DEFAULT_RULES) {
    await db.run(
      `INSERT INTO risk_rules (id, context, description, action, params_json, enabled, updated_at)
       VALUES (?, ?, ?, ?, ?, 1, ?) ON CONFLICT (id) DO NOTHING`,
      rule.id,
      rule.context,
      rule.description,
      rule.action,
      JSON.stringify(rule.params),
      now
    );
  }
  for (const name of ['LINK_CREATE', 'PUBLIC_PAY', 'WEBHOOK_PROCESSING']) {
    await db.run('INSERT INTO feature_flags (name, enabled, updated_at) VALUES (?, 1, ?) ON CONFLICT (name) DO NOTHING', name, now);
  }
  if (!isProd && (await db.get("SELECT 1 FROM merchant_profiles WHERE id = 'mer_carlos'"))) {
    await db.run(
      "INSERT INTO merchant_credentials (merchant_id, pin_hash, pin_updated_at) VALUES ('mer_carlos', ?, ?) ON CONFLICT (merchant_id) DO NOTHING",
      hashPin(DEMO_MERCHANT_PIN),
      now
    );
  }
}
