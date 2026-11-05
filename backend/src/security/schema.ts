// Esquema de seguridad de Kuota Payments: credenciales, dispositivos, sesiones,
// consentimiento, límites, riesgo, webhooks, bitácora y conciliación.
// Idempotente: se ejecuta en cada arranque sobre bases nuevas o existentes.
import type Database from 'better-sqlite3';
import { hashPin, isPinHash } from './crypto.js';
import { isProd } from './config.js';
import { DEFAULT_RULES } from './riskRules.js';

/** Tablas de solo agregado: cualquier UPDATE o DELETE aborta. */
const APPEND_ONLY = ['audit_log', 'payment_events', 'ledger_entries', 'consent_records', 'risk_decisions'];

/** PIN de la cuenta demo (mer_carlos), solo fuera de producción. Ver README. */
export const DEMO_MERCHANT_PIN = process.env.KUOTA_DEMO_PIN || '482915';

export function initSecuritySchema(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS merchant_credentials (
      merchant_id TEXT PRIMARY KEY,
      pin_hash TEXT NOT NULL,
      failed_attempts INTEGER NOT NULL DEFAULT 0,
      locked_until TEXT,
      cooldown_until TEXT,
      pin_updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS merchant_devices (
      merchant_id TEXT NOT NULL,
      device_id TEXT NOT NULL,
      label TEXT,
      first_seen_at TEXT NOT NULL,
      last_seen_at TEXT NOT NULL,
      cooldown_until TEXT,
      revoked_at TEXT,
      PRIMARY KEY (merchant_id, device_id)
    );

    CREATE TABLE IF NOT EXISTS merchant_sessions (
      id TEXT PRIMARY KEY,
      merchant_id TEXT NOT NULL,
      device_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      revoked_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_sessions_merchant ON merchant_sessions(merchant_id);

    CREATE TABLE IF NOT EXISTS step_up_grants (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      merchant_id TEXT NOT NULL,
      action TEXT NOT NULL,
      params_hash TEXT NOT NULL,
      consent_id TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      used_at TEXT
    );

    CREATE TABLE IF NOT EXISTS consent_records (
      id TEXT PRIMARY KEY,
      merchant_id TEXT NOT NULL,
      device_id TEXT NOT NULL,
      session_id TEXT NOT NULL,
      action TEXT NOT NULL,
      summary TEXT NOT NULL,
      params_json TEXT NOT NULL,
      ip TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS merchant_limit_settings (
      merchant_id TEXT PRIMARY KEY,
      per_tx_cents INTEGER,
      daily_cents INTEGER,
      daily_count INTEGER,
      pending_json TEXT,
      pending_effective_at TEXT,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS merchant_alerts (
      id TEXT PRIMARY KEY,
      merchant_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      title TEXT NOT NULL,
      body TEXT,
      ref_id TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_alerts_merchant ON merchant_alerts(merchant_id, created_at);

    CREATE TABLE IF NOT EXISTS idempotency_keys (
      merchant_id TEXT NOT NULL,
      idem_key TEXT NOT NULL,
      request_hash TEXT NOT NULL,
      status_code INTEGER NOT NULL,
      response_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY (merchant_id, idem_key)
    );

    CREATE TABLE IF NOT EXISTS webhook_events (
      event_id TEXT PRIMARY KEY,
      type TEXT,
      status TEXT NOT NULL CHECK(status IN ('PROCESSED', 'REJECTED', 'IGNORED')),
      reason TEXT,
      link_id TEXT,
      gateway_ref TEXT,
      amount_minor INTEGER,
      payload_sha256 TEXT NOT NULL,
      response_json TEXT NOT NULL,
      received_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS payment_events (
      seq INTEGER PRIMARY KEY AUTOINCREMENT,
      link_id TEXT NOT NULL,
      type TEXT NOT NULL,
      data_json TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_payment_events_link ON payment_events(link_id);

    CREATE TABLE IF NOT EXISTS payment_attempts (
      id TEXT PRIMARY KEY,
      link_id TEXT,
      payer_fingerprint TEXT,
      result TEXT NOT NULL,
      reason TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS audit_log (
      seq INTEGER PRIMARY KEY AUTOINCREMENT,
      ts TEXT NOT NULL,
      actor_type TEXT NOT NULL,
      actor_id TEXT,
      action TEXT NOT NULL,
      target TEXT,
      result TEXT NOT NULL,
      ip TEXT,
      device_id TEXT,
      details_json TEXT,
      prev_hash TEXT NOT NULL,
      hash TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS risk_rules (
      id TEXT PRIMARY KEY,
      context TEXT NOT NULL,
      description TEXT NOT NULL,
      action TEXT NOT NULL CHECK(action IN ('STEP_UP', 'REVIEW', 'BLOCK')),
      params_json TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS risk_lists (
      list TEXT NOT NULL CHECK(list IN ('BLACK', 'GRAY', 'WHITE')),
      kind TEXT NOT NULL CHECK(kind IN ('MERCHANT', 'DEVICE', 'IP')),
      value TEXT NOT NULL,
      reason TEXT,
      created_at TEXT NOT NULL,
      PRIMARY KEY (kind, value)
    );

    CREATE TABLE IF NOT EXISTS risk_decisions (
      id TEXT PRIMARY KEY,
      context TEXT NOT NULL,
      merchant_id TEXT,
      subject_id TEXT,
      decision TEXT NOT NULL,
      reasons_json TEXT NOT NULL,
      latency_ms REAL NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS risk_reviews (
      link_id TEXT PRIMARY KEY,
      decision_id TEXT NOT NULL,
      merchant_id TEXT NOT NULL,
      opened_at TEXT NOT NULL,
      resolved_at TEXT,
      resolution TEXT CHECK(resolution IN ('RELEASE', 'REJECT')),
      label TEXT CHECK(label IN ('LEGIT', 'FRAUD')),
      analyst TEXT,
      note TEXT
    );

    CREATE TABLE IF NOT EXISTS feature_flags (
      name TEXT PRIMARY KEY,
      enabled INTEGER NOT NULL DEFAULT 1,
      reason TEXT,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS reconciliation_runs (
      id TEXT PRIMARY KEY,
      run_at TEXT NOT NULL,
      business_date TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('OK', 'EXCEPTIONS')),
      summary_json TEXT NOT NULL,
      exceptions_json TEXT NOT NULL
    );
  `);

  // Columnas nuevas de payment_links (firma, emisión, cancelación, riesgo).
  for (const sql of [
    'ALTER TABLE payment_links ADD COLUMN sig TEXT',
    'ALTER TABLE payment_links ADD COLUMN currency TEXT',
    'ALTER TABLE payment_links ADD COLUMN device_id TEXT',
    'ALTER TABLE payment_links ADD COLUMN issued_at TEXT',
    'ALTER TABLE payment_links ADD COLUMN cancelled_at TEXT',
    'ALTER TABLE payment_links ADD COLUMN risk_decision_id TEXT'
  ]) {
    try {
      db.prepare(sql).run();
    } catch {
      /* ya existe */
    }
  }
  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_gateway_ref ON payments(gateway_ref);
    CREATE INDEX IF NOT EXISTS idx_links_merchant_created ON payment_links(merchant_id, created_at);
  `);

  // Solo agregado: la bitácora, el libro y los eventos no se editan ni se borran.
  for (const table of APPEND_ONLY) {
    db.exec(`
      CREATE TRIGGER IF NOT EXISTS ${table}_no_update BEFORE UPDATE ON ${table}
      BEGIN SELECT RAISE(ABORT, '${table} es de solo agregado'); END;
      CREATE TRIGGER IF NOT EXISTS ${table}_no_delete BEFORE DELETE ON ${table}
      BEGIN SELECT RAISE(ABORT, '${table} es de solo agregado'); END;
    `);
  }

  // Monto, titular y token del link son inmutables; un link pagado es terminal.
  db.exec(`
    CREATE TRIGGER IF NOT EXISTS payment_links_immutable
    BEFORE UPDATE OF merchant_id, token, amount_cents, fee_cents, net_cents, fee_bps, currency, expires_at ON payment_links
    WHEN OLD.merchant_id IS NOT NEW.merchant_id OR OLD.token IS NOT NEW.token
      OR OLD.amount_cents IS NOT NEW.amount_cents OR OLD.fee_cents IS NOT NEW.fee_cents
      OR OLD.net_cents IS NOT NEW.net_cents OR OLD.fee_bps IS NOT NEW.fee_bps
      OR OLD.currency IS NOT NEW.currency OR OLD.expires_at IS NOT NEW.expires_at
    BEGIN SELECT RAISE(ABORT, 'monto, titular y vencimiento del link son inmutables'); END;

    CREATE TRIGGER IF NOT EXISTS payment_links_sig_once
    BEFORE UPDATE OF sig ON payment_links
    WHEN OLD.sig IS NOT NULL AND OLD.sig IS NOT NEW.sig
    BEGIN SELECT RAISE(ABORT, 'la firma del link no se reemplaza'); END;

    CREATE TRIGGER IF NOT EXISTS payment_links_paid_terminal
    BEFORE UPDATE OF status ON payment_links
    WHEN OLD.status = 'PAID' AND NEW.status IS NOT 'PAID'
    BEGIN SELECT RAISE(ABORT, 'un link pagado no cambia de estado'); END;
  `);

  const now = new Date().toISOString();

  const insertRule = db.prepare(`
    INSERT OR IGNORE INTO risk_rules (id, context, description, action, params_json, enabled, updated_at)
    VALUES (?, ?, ?, ?, ?, 1, ?)
  `);
  for (const rule of DEFAULT_RULES) {
    insertRule.run(rule.id, rule.context, rule.description, rule.action, JSON.stringify(rule.params), now);
  }

  for (const name of ['LINK_CREATE', 'PUBLIC_PAY', 'WEBHOOK_PROCESSING']) {
    db.prepare('INSERT OR IGNORE INTO feature_flags (name, enabled, updated_at) VALUES (?, 1, ?)').run(name, now);
  }

  migratePlaintextPins(db, now);
  if (!isProd) ensureDemoPin(db, now);
}

/** Los PINs heredados estaban en texto plano: se reemplazan por su hash. */
function migratePlaintextPins(db: Database.Database, now: string) {
  const users = db.prepare('SELECT id, security_pin FROM users WHERE security_pin IS NOT NULL').all() as {
    id: string;
    security_pin: string;
  }[];
  for (const u of users) {
    if (!isPinHash(u.security_pin)) {
      db.prepare('UPDATE users SET security_pin = ? WHERE id = ?').run(hashPin(u.security_pin), u.id);
    }
  }
  const sessions = db
    .prepare('SELECT id, security_pin FROM onboarding_sessions WHERE security_pin IS NOT NULL')
    .all() as { id: string; security_pin: string }[];
  for (const s of sessions) {
    if (!isPinHash(s.security_pin)) {
      db.prepare('UPDATE onboarding_sessions SET security_pin = ? WHERE id = ?').run(hashPin(s.security_pin), s.id);
    }
  }
  // Credencial por comercio a partir del usuario o de la sesión de onboarding.
  db.prepare(`
    INSERT OR IGNORE INTO merchant_credentials (merchant_id, pin_hash, pin_updated_at)
    SELECT m.id, COALESCE(u.security_pin, s.security_pin), ?
    FROM merchant_profiles m
    LEFT JOIN users u ON u.id = m.user_id
    LEFT JOIN onboarding_sessions s ON s.id = m.session_id
    WHERE COALESCE(u.security_pin, s.security_pin) IS NOT NULL
  `).run(now);
}

function ensureDemoPin(db: Database.Database, now: string) {
  const demo = db.prepare("SELECT id FROM merchant_profiles WHERE id = 'mer_carlos'").get();
  if (!demo) return;
  db.prepare(`
    INSERT OR IGNORE INTO merchant_credentials (merchant_id, pin_hash, pin_updated_at)
    VALUES ('mer_carlos', ?, ?)
  `).run(hashPin(DEMO_MERCHANT_PIN), now);
}
