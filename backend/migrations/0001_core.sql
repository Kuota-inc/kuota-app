-- 0001 · Núcleo de Kuota (esquema public): usuarios, onboarding, comercios,
-- proveedores, productos, crédito, ventas, score, KYC, catálogos y avisos.
-- Las fechas heredadas se guardan como texto UTC 'YYYY-MM-DD HH:MM:SS'
-- (mismo formato que la versión SQLite); las nuevas, como ISO-8601.

CREATE OR REPLACE FUNCTION utc_now_text() RETURNS text
LANGUAGE sql STABLE AS $$ SELECT to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS') $$;

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  phone TEXT UNIQUE,
  role TEXT CHECK (role IN ('MERCHANT', 'PROVIDER')),
  status TEXT DEFAULT 'ACTIVE',
  first_name TEXT,
  last_name TEXT,
  terms_accepted_at TEXT,
  privacy_accepted_at TEXT,
  security_pin TEXT,
  created_at TEXT DEFAULT utc_now_text()
);

CREATE TABLE onboarding_sessions (
  id TEXT PRIMARY KEY,
  role TEXT CHECK (role IN ('MERCHANT', 'PROVIDER')),
  device_id TEXT,
  status TEXT DEFAULT 'IN_PROGRESS',
  current_step TEXT,
  terms_version TEXT,
  privacy_version TEXT,
  accepted_at TEXT,
  ip TEXT,
  user_agent TEXT,
  user_id TEXT REFERENCES users(id),
  security_pin TEXT,
  expires_at TEXT,
  created_at TEXT DEFAULT utc_now_text()
);

CREATE TABLE merchant_profiles (
  id TEXT PRIMARY KEY,
  session_id TEXT,
  user_id TEXT UNIQUE REFERENCES users(id),
  business_name TEXT,
  ruc TEXT,
  category TEXT,
  seniority_range TEXT,
  tier_hint TEXT,
  address TEXT,
  district TEXT,
  city TEXT DEFAULT 'Lima',
  dni TEXT,
  full_name TEXT,
  phone TEXT,
  kyc_status TEXT DEFAULT 'PENDING',
  updated_at TEXT DEFAULT utc_now_text()
);
CREATE INDEX idx_merchant_profiles_session ON merchant_profiles(session_id);

CREATE TABLE provider_profiles (
  id TEXT PRIMARY KEY,
  session_id TEXT,
  user_id TEXT UNIQUE REFERENCES users(id),
  ruc TEXT UNIQUE,
  legal_name TEXT,
  legal_rep_dni TEXT,
  whatsapp TEXT,
  category TEXT,
  seniority_range TEXT,
  seniority_declared_vs_ruc INTEGER DEFAULT 1,
  kyc_status TEXT DEFAULT 'PENDING',
  fee_bps INTEGER DEFAULT 100,
  approved_limit_cents INTEGER DEFAULT 4500000,
  created_at TEXT DEFAULT utc_now_text(),
  updated_at TEXT DEFAULT utc_now_text()
);

CREATE TABLE products (
  id TEXT PRIMARY KEY,
  merchant_id TEXT,
  session_id TEXT,
  name TEXT NOT NULL,
  price_cents INTEGER NOT NULL,
  currency TEXT DEFAULT 'PEN',
  is_frequent INTEGER DEFAULT 0,
  sort_order INTEGER DEFAULT 0,
  deleted_at TEXT,
  created_at TEXT DEFAULT utc_now_text(),
  updated_at TEXT DEFAULT utc_now_text()
);
CREATE INDEX idx_products_merchant ON products(merchant_id);

CREATE TABLE credit_levels (
  level INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  down_payment_pct INTEGER NOT NULL,
  max_line_cents INTEGER NOT NULL,
  promote_after_on_time INTEGER DEFAULT 3,
  demote_after_late INTEGER DEFAULT 1
);

CREATE TABLE credit_lines (
  id TEXT PRIMARY KEY,
  merchant_id TEXT UNIQUE NOT NULL REFERENCES merchant_profiles(id),
  level INTEGER DEFAULT 1 REFERENCES credit_levels(level),
  total_limit_cents INTEGER NOT NULL DEFAULT 140000,
  used_cents INTEGER NOT NULL DEFAULT 0,
  consecutive_on_time INTEGER DEFAULT 0,
  status TEXT DEFAULT 'ACTIVE',
  updated_at TEXT DEFAULT utc_now_text()
);

CREATE TABLE credit_purchases (
  id TEXT PRIMARY KEY,
  merchant_id TEXT NOT NULL REFERENCES merchant_profiles(id),
  line_id TEXT NOT NULL REFERENCES credit_lines(id),
  provider_id TEXT NOT NULL,
  plan_code TEXT DEFAULT 'KUOTA_3X',
  total_cents INTEGER NOT NULL,
  down_payment_pct INTEGER NOT NULL,
  down_payment_cents INTEGER NOT NULL,
  financed_cents INTEGER NOT NULL,
  installments_count INTEGER NOT NULL DEFAULT 3,
  interest_rate DOUBLE PRECISION DEFAULT 0.0998,
  status TEXT DEFAULT 'ACTIVE_ON_TIME',
  receipt_number TEXT UNIQUE,
  issued_at TEXT DEFAULT utc_now_text(),
  settled_at TEXT
);

CREATE TABLE installments (
  id TEXT PRIMARY KEY,
  purchase_id TEXT NOT NULL REFERENCES credit_purchases(id),
  number INTEGER NOT NULL,
  amount_cents INTEGER NOT NULL,
  principal_cents INTEGER NOT NULL,
  interest_cents INTEGER NOT NULL,
  due_date TEXT NOT NULL,
  status TEXT DEFAULT 'PENDING',
  paid_at TEXT,
  late_days INTEGER DEFAULT 0
);
CREATE INDEX idx_installments_purchase ON installments(purchase_id);

CREATE TABLE sales (
  id TEXT PRIMARY KEY,
  merchant_id TEXT NOT NULL REFERENCES merchant_profiles(id),
  client_id TEXT,
  source TEXT CHECK (source IN ('YAPE', 'PLIN', 'MANUAL', 'OCR', 'PAYMENT_LINK')),
  amount_cents INTEGER NOT NULL,
  concept TEXT,
  operation_ref TEXT,
  verified INTEGER DEFAULT 0,
  review_status TEXT DEFAULT 'APPROVED',
  occurred_at TEXT DEFAULT utc_now_text(),
  created_at TEXT DEFAULT utc_now_text()
);
CREATE INDEX idx_sales_merchant_occurred ON sales(merchant_id, occurred_at);

CREATE TABLE credit_scores (
  merchant_id TEXT PRIMARY KEY REFERENCES merchant_profiles(id),
  score INTEGER DEFAULT 720,
  level INTEGER DEFAULT 1,
  last_calculated_at TEXT DEFAULT utc_now_text()
);

CREATE TABLE score_events (
  id TEXT PRIMARY KEY,
  merchant_id TEXT NOT NULL REFERENCES merchant_profiles(id),
  type TEXT NOT NULL,
  points INTEGER NOT NULL,
  ref_id TEXT,
  created_at TEXT DEFAULT utc_now_text()
);

CREATE TABLE kyc_requests (
  id TEXT PRIMARY KEY,
  provider_id TEXT,
  session_id TEXT,
  public_id TEXT UNIQUE NOT NULL,
  status TEXT DEFAULT 'IN_PROGRESS',
  progress_pct INTEGER DEFAULT 0,
  current_stage TEXT DEFAULT 'SCORING',
  dni_front TEXT,
  dni_back TEXT,
  selfie TEXT,
  created_at TEXT DEFAULT utc_now_text(),
  completed_at TEXT,
  updated_at TEXT DEFAULT utc_now_text()
);

CREATE TABLE kyc_checks (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL REFERENCES kyc_requests(id),
  type TEXT CHECK (type IN ('SUNAT', 'RENIEC', 'SCORING')),
  status TEXT DEFAULT 'PENDING',
  result_json TEXT,
  started_at TEXT,
  finished_at TEXT,
  attempts INTEGER DEFAULT 1
);

CREATE TABLE provider_locations (
  id TEXT PRIMARY KEY,
  provider_id TEXT NOT NULL REFERENCES provider_profiles(id),
  is_primary INTEGER DEFAULT 1,
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  geohash TEXT,
  accuracy_m DOUBLE PRECISION,
  source TEXT CHECK (source IN ('GPS', 'MANUAL')),
  address_line TEXT,
  district TEXT,
  city TEXT,
  department TEXT DEFAULT 'Lima',
  fiscal_distance_m DOUBLE PRECISION DEFAULT 0,
  created_at TEXT DEFAULT utc_now_text()
);

CREATE TABLE settlement_accounts (
  id TEXT PRIMARY KEY,
  provider_id TEXT NOT NULL REFERENCES provider_profiles(id),
  bank TEXT NOT NULL,
  account_masked TEXT NOT NULL,
  cci TEXT NOT NULL,
  holder_name TEXT NOT NULL,
  holder_doc TEXT NOT NULL,
  verified_at TEXT DEFAULT utc_now_text(),
  status TEXT DEFAULT 'ACTIVE'
);

CREATE TABLE promotions (
  id TEXT PRIMARY KEY,
  category TEXT NOT NULL,
  tag TEXT NOT NULL,
  headline TEXT NOT NULL,
  discount_pct INTEGER DEFAULT 0,
  partner_name TEXT NOT NULL,
  description TEXT,
  condition TEXT,
  ends_in_days INTEGER DEFAULT 7,
  active INTEGER DEFAULT 1
);

CREATE TABLE businesses (
  id TEXT PRIMARY KEY,
  ruc TEXT UNIQUE NOT NULL,
  razon_social TEXT NOT NULL,
  nombre_comercial TEXT,
  tipo_contribuyente TEXT,
  actividad_principal TEXT,
  actividades_secundarias TEXT,
  estado_contribuyente TEXT DEFAULT 'ACTIVO',
  condicion_domicilio TEXT DEFAULT 'HABIDO',
  direccion_fiscal TEXT,
  ubigeo TEXT,
  departamento TEXT,
  provincia TEXT,
  distrito TEXT,
  fuente_datos TEXT DEFAULT 'SUNAT_PADRON',
  fecha_consulta TEXT DEFAULT utc_now_text(),
  fecha_actualizacion TEXT DEFAULT utc_now_text(),
  usuario_propietario TEXT,
  session_id TEXT,
  created_at TEXT DEFAULT utc_now_text()
);

CREATE TABLE sunat_contribuyentes (
  ruc TEXT PRIMARY KEY,
  nombre_razon_social TEXT NOT NULL,
  nombre_comercial TEXT,
  tipo_contribuyente TEXT,
  actividad_principal TEXT,
  actividades_secundarias TEXT,
  estado_contribuyente TEXT DEFAULT 'ACTIVO',
  condicion_domicilio TEXT DEFAULT 'HABIDO',
  ubigeo TEXT,
  direccion_fiscal TEXT,
  departamento TEXT,
  provincia TEXT,
  distrito TEXT,
  created_at TEXT DEFAULT utc_now_text()
);

CREATE TABLE device_tokens (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  platform TEXT,
  token TEXT,
  consent TEXT DEFAULT 'GRANTED',
  updated_at TEXT DEFAULT utc_now_text()
);

CREATE TABLE notification_preferences (
  merchant_id TEXT PRIMARY KEY,
  push_enabled INTEGER NOT NULL DEFAULT 1,
  last_seen_at TEXT,
  updated_at TEXT DEFAULT utc_now_text()
);

CREATE TABLE workshop_reminders (
  merchant_id TEXT NOT NULL,
  workshop_id TEXT NOT NULL,
  created_at TEXT DEFAULT utc_now_text(),
  PRIMARY KEY (merchant_id, workshop_id)
);
