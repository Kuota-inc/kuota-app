-- 0002 · Zona de dinero (esquema payments): links de cobro, pagos, libro de
-- doble partida y controles de seguridad de Kuota Payments. En producción la
-- usa un usuario propio (ver deploy/cloudsql/roles.sql); el usuario del núcleo
-- no tiene permisos sobre este esquema.

CREATE SCHEMA IF NOT EXISTS payments;

CREATE TABLE payments.payment_links (
  id TEXT PRIMARY KEY,
  merchant_id TEXT NOT NULL REFERENCES public.merchant_profiles(id),
  token TEXT UNIQUE NOT NULL,
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  fee_cents INTEGER NOT NULL CHECK (fee_cents >= 0),
  net_cents INTEGER NOT NULL CHECK (net_cents >= 0),
  fee_bps INTEGER DEFAULT 100,
  currency TEXT DEFAULT 'PEN',
  concept TEXT,
  product_id TEXT,
  quantity INTEGER,
  customer_name TEXT,
  customer_phone TEXT,
  customer_email TEXT,
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'ACTIVE', 'ON_HOLD', 'PAID', 'CANCELLED', 'EXPIRED')),
  expires_at TEXT NOT NULL,
  paid_at TEXT,
  gateway_ref TEXT,
  sig TEXT,
  device_id TEXT,
  issued_at TEXT,
  cancelled_at TEXT,
  risk_decision_id TEXT,
  created_at TEXT DEFAULT public.utc_now_text(),
  CHECK (fee_cents + net_cents = amount_cents)
);
CREATE INDEX idx_links_merchant_created ON payments.payment_links(merchant_id, created_at);

CREATE TABLE payments.payments (
  id TEXT PRIMARY KEY,
  payment_link_id TEXT NOT NULL REFERENCES payments.payment_links(id),
  method TEXT CHECK (method IN ('YAPE', 'PLIN', 'CARD')),
  gateway_ref TEXT UNIQUE,
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  status TEXT DEFAULT 'SUCCESS',
  raw_webhook_json TEXT,
  created_at TEXT DEFAULT public.utc_now_text()
);

CREATE TABLE payments.ledger_entries (
  id TEXT PRIMARY KEY,
  payment_id TEXT NOT NULL REFERENCES payments.payments(id),
  account TEXT NOT NULL,
  type TEXT CHECK (type IN ('DEBIT', 'CREDIT')),
  amount_cents INTEGER NOT NULL CHECK (amount_cents >= 0),
  description TEXT,
  created_at TEXT DEFAULT public.utc_now_text()
);
CREATE INDEX idx_ledger_payment ON payments.ledger_entries(payment_id);

CREATE TABLE payments.merchant_credentials (
  merchant_id TEXT PRIMARY KEY,
  pin_hash TEXT NOT NULL,
  failed_attempts INTEGER NOT NULL DEFAULT 0,
  locked_until TEXT,
  cooldown_until TEXT,
  pin_updated_at TEXT NOT NULL
);

CREATE TABLE payments.merchant_devices (
  merchant_id TEXT NOT NULL,
  device_id TEXT NOT NULL,
  label TEXT,
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  cooldown_until TEXT,
  revoked_at TEXT,
  PRIMARY KEY (merchant_id, device_id)
);
CREATE INDEX idx_devices_device ON payments.merchant_devices(device_id);

CREATE TABLE payments.merchant_sessions (
  id TEXT PRIMARY KEY,
  merchant_id TEXT NOT NULL,
  device_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  revoked_at TEXT
);
CREATE INDEX idx_sessions_merchant ON payments.merchant_sessions(merchant_id);

CREATE TABLE payments.step_up_grants (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  merchant_id TEXT NOT NULL,
  action TEXT NOT NULL,
  params_hash TEXT NOT NULL,
  consent_id TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used_at TEXT
);

CREATE TABLE payments.consent_records (
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

CREATE TABLE payments.merchant_limit_settings (
  merchant_id TEXT PRIMARY KEY,
  per_tx_cents INTEGER,
  daily_cents INTEGER,
  daily_count INTEGER,
  pending_json TEXT,
  pending_effective_at TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE payments.merchant_alerts (
  id TEXT PRIMARY KEY,
  merchant_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  ref_id TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_alerts_merchant ON payments.merchant_alerts(merchant_id, created_at);

CREATE TABLE payments.idempotency_keys (
  merchant_id TEXT NOT NULL,
  idem_key TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  status_code INTEGER NOT NULL,
  response_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (merchant_id, idem_key)
);

CREATE TABLE payments.webhook_events (
  event_id TEXT PRIMARY KEY,
  type TEXT,
  status TEXT NOT NULL CHECK (status IN ('PROCESSED', 'REJECTED', 'IGNORED')),
  reason TEXT,
  link_id TEXT,
  gateway_ref TEXT,
  amount_minor INTEGER,
  payload_sha256 TEXT NOT NULL,
  response_json TEXT NOT NULL,
  received_at TEXT NOT NULL
);

CREATE TABLE payments.payment_events (
  seq BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  link_id TEXT NOT NULL,
  type TEXT NOT NULL,
  data_json TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_payment_events_link ON payments.payment_events(link_id);

CREATE TABLE payments.payment_attempts (
  id TEXT PRIMARY KEY,
  link_id TEXT,
  payer_fingerprint TEXT,
  result TEXT NOT NULL,
  reason TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_attempts_link ON payments.payment_attempts(link_id, created_at);
CREATE INDEX idx_attempts_payer ON payments.payment_attempts(payer_fingerprint, created_at);

CREATE TABLE payments.audit_log (
  seq BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
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
  hash TEXT NOT NULL UNIQUE
);

CREATE TABLE payments.risk_rules (
  id TEXT PRIMARY KEY,
  context TEXT NOT NULL,
  description TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('STEP_UP', 'REVIEW', 'BLOCK')),
  params_json TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL
);

CREATE TABLE payments.risk_lists (
  list TEXT NOT NULL CHECK (list IN ('BLACK', 'GRAY', 'WHITE')),
  kind TEXT NOT NULL CHECK (kind IN ('MERCHANT', 'DEVICE', 'IP')),
  value TEXT NOT NULL,
  reason TEXT,
  created_at TEXT NOT NULL,
  PRIMARY KEY (kind, value)
);

CREATE TABLE payments.risk_decisions (
  id TEXT PRIMARY KEY,
  context TEXT NOT NULL,
  merchant_id TEXT,
  subject_id TEXT,
  decision TEXT NOT NULL,
  reasons_json TEXT NOT NULL,
  latency_ms DOUBLE PRECISION NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_risk_decisions_created ON payments.risk_decisions(created_at);

CREATE TABLE payments.risk_reviews (
  link_id TEXT PRIMARY KEY,
  decision_id TEXT NOT NULL,
  merchant_id TEXT NOT NULL,
  opened_at TEXT NOT NULL,
  resolved_at TEXT,
  resolution TEXT CHECK (resolution IN ('RELEASE', 'REJECT')),
  label TEXT CHECK (label IN ('LEGIT', 'FRAUD')),
  analyst TEXT,
  note TEXT
);

CREATE TABLE payments.feature_flags (
  name TEXT PRIMARY KEY,
  enabled INTEGER NOT NULL DEFAULT 1,
  reason TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE payments.reconciliation_runs (
  id TEXT PRIMARY KEY,
  run_at TEXT NOT NULL,
  business_date TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('OK', 'EXCEPTIONS')),
  summary_json TEXT NOT NULL,
  exceptions_json TEXT NOT NULL
);

-- Solo agregado: la bitácora, el libro, los eventos, el consentimiento y las
-- decisiones de riesgo no se editan, no se borran y no se vacían.
CREATE OR REPLACE FUNCTION payments.forbid_change() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% es de solo agregado', TG_TABLE_NAME;
END $$;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['audit_log', 'payment_events', 'ledger_entries', 'consent_records', 'risk_decisions'] LOOP
    EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE OR DELETE ON payments.%I FOR EACH ROW EXECUTE FUNCTION payments.forbid_change()', t || '_append_only', t);
    EXECUTE format('CREATE TRIGGER %I BEFORE TRUNCATE ON payments.%I FOR EACH STATEMENT EXECUTE FUNCTION payments.forbid_change()', t || '_no_truncate', t);
  END LOOP;
END $$;

-- Monto, titular, token y vencimiento son inmutables; la firma no se
-- reemplaza; un link pagado es un estado final.
CREATE OR REPLACE FUNCTION payments.payment_links_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.merchant_id IS DISTINCT FROM OLD.merchant_id OR NEW.token IS DISTINCT FROM OLD.token
     OR NEW.amount_cents IS DISTINCT FROM OLD.amount_cents OR NEW.fee_cents IS DISTINCT FROM OLD.fee_cents
     OR NEW.net_cents IS DISTINCT FROM OLD.net_cents OR NEW.fee_bps IS DISTINCT FROM OLD.fee_bps
     OR NEW.currency IS DISTINCT FROM OLD.currency OR NEW.expires_at IS DISTINCT FROM OLD.expires_at THEN
    RAISE EXCEPTION 'monto, titular y vencimiento del link son inmutables';
  END IF;
  IF OLD.sig IS NOT NULL AND NEW.sig IS DISTINCT FROM OLD.sig THEN
    RAISE EXCEPTION 'la firma del link no se reemplaza';
  END IF;
  IF OLD.status = 'PAID' AND NEW.status IS DISTINCT FROM 'PAID' THEN
    RAISE EXCEPTION 'un link pagado no cambia de estado';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER payment_links_guard BEFORE UPDATE ON payments.payment_links
FOR EACH ROW EXECUTE FUNCTION payments.payment_links_guard();
