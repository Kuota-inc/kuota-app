// Rutas solo disponibles fuera de producción: herramientas de desarrollo y QA.
import { Router } from 'express';
import { paymentsDb } from '../db/client.js';
import { nowIso } from '../security/time.js';
import { hashPin } from '../security/crypto.js';

export const devRouter = Router();

// Desbloquea el PIN de todos los comercios (o de uno por teléfono/merchant_id).
// POST /dev/reset-pin  { phone?: "+51XXXXXXXXX", merchant_id?: "mer_..." }
devRouter.post('/reset-pin', async (req, res) => {
  const { phone, merchant_id } = req.body ?? {};

  if (merchant_id) {
    await paymentsDb.run(
      'UPDATE merchant_credentials SET failed_attempts = 0, locked_until = NULL WHERE merchant_id = ?',
      merchant_id
    );
    return res.json({ ok: true, unlocked: merchant_id });
  }

  if (phone) {
    const row = await paymentsDb.get<{ id: string }>(
      `SELECT m.id FROM merchant_profiles m JOIN users u ON u.id = m.user_id WHERE u.phone = ?`,
      phone
    );
    if (!row) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Comercio no encontrado para ese teléfono.' } });
    await paymentsDb.run(
      'UPDATE merchant_credentials SET failed_attempts = 0, locked_until = NULL WHERE merchant_id = ?',
      row.id
    );
    return res.json({ ok: true, unlocked: row.id });
  }

  await paymentsDb.run('UPDATE merchant_credentials SET failed_attempts = 0, locked_until = NULL');
  res.json({ ok: true });
});

// Borra todos los datos de prueba: users y merchant_profiles que no sean el seed de Carlos.
// También limpia onboarding_sessions incompletas.
// POST /dev/reset-accounts
devRouter.post('/reset-accounts', async (_req, res) => {
  await paymentsDb.run("DELETE FROM merchant_credentials WHERE merchant_id != 'mer_carlos'");
  await paymentsDb.run("DELETE FROM credit_lines WHERE merchant_id != 'mer_carlos'");
  await paymentsDb.run("DELETE FROM credit_scores WHERE merchant_id != 'mer_carlos'");
  await paymentsDb.run("DELETE FROM merchant_profiles WHERE id != 'mer_carlos'");
  await paymentsDb.run("DELETE FROM provider_locations WHERE provider_id NOT IN (SELECT id FROM provider_profiles WHERE user_id = 'usr_carlos')");
  await paymentsDb.run("DELETE FROM provider_profiles WHERE user_id != 'usr_carlos'");
  await paymentsDb.run("DELETE FROM onboarding_sessions WHERE id NOT LIKE 'ses_carlos%'");
  await paymentsDb.run("DELETE FROM users WHERE id != 'usr_carlos'");
  await paymentsDb.run('UPDATE merchant_credentials SET failed_attempts = 0, locked_until = NULL');
  // Fija el PIN de Carlos a 111111 para que siempre se pueda entrar durante pruebas.
  const testPin = hashPin('111111');
  await paymentsDb.run(
    "UPDATE merchant_credentials SET pin_hash = ? WHERE merchant_id = 'mer_carlos'",
    testPin
  );
  res.json({ ok: true, message: 'Cuentas de prueba eliminadas. Solo queda el seed de Carlos.', test_pin: '111111' });
});

// Fija el PIN de todos los comercios (o de uno) a un valor de prueba.
// POST /dev/set-test-pin  { pin?: "123456", merchant_id?: "mer_..." }
devRouter.post('/set-test-pin', async (req, res) => {
  const pin = String(req.body?.pin || '111111');
  const merchant_id = req.body?.merchant_id as string | undefined;
  const hash = hashPin(pin);
  if (merchant_id) {
    await paymentsDb.run(
      'UPDATE merchant_credentials SET pin_hash = ?, failed_attempts = 0, locked_until = NULL WHERE merchant_id = ?',
      hash, merchant_id
    );
  } else {
    await paymentsDb.run(
      'UPDATE merchant_credentials SET pin_hash = ?, failed_attempts = 0, locked_until = NULL',
      hash
    );
  }
  res.json({ ok: true, pin_set: pin, merchant_id: merchant_id ?? 'ALL' });
});

// Simula liquidación al proveedor: marca como settled_at los links PAID cuyo
// paid_at supera la ventana de liquidación configurable (default: 5 minutos).
// Solo disponible fuera de producción. No usar en producción: requiere evidencia de 360pay.
// POST /dev/settle-pending  { window_ms?: 300000 }
devRouter.post('/settle-pending', async (req, res) => {
  const windowMs = Number(req.body?.window_ms ?? process.env.KUOTA_SETTLEMENT_WINDOW_MS ?? 300_000);
  const cutoff = new Date(Date.now() - windowMs).toISOString();
  const result = await paymentsDb.run(
    `UPDATE payments.payment_links
     SET settled_at = $1
     WHERE status = 'PAID' AND settled_at IS NULL AND paid_at < $2`,
    nowIso(), cutoff
  );
  res.json({ ok: true, settled: result.changes ?? 0, window_ms: windowMs, cutoff });
});
