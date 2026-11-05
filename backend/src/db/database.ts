import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const DB_PATH = path.resolve(process.cwd(), 'kuota.db');
export const db = new Database(DB_PATH);

// Enable WAL mode for high performance concurrency
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

export function initDatabase() {
  db.exec(`
    -- USERS & SESSIONS
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      phone TEXT UNIQUE,
      role TEXT CHECK(role IN ('MERCHANT', 'PROVIDER')),
      status TEXT DEFAULT 'ACTIVE',
      first_name TEXT,
      last_name TEXT,
      terms_accepted_at TEXT,
      privacy_accepted_at TEXT,
      security_pin TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS onboarding_sessions (
      id TEXT PRIMARY KEY,
      role TEXT CHECK(role IN ('MERCHANT', 'PROVIDER')),
      device_id TEXT,
      status TEXT DEFAULT 'IN_PROGRESS',
      current_step TEXT,
      terms_version TEXT,
      privacy_version TEXT,
      accepted_at TEXT,
      ip TEXT,
      user_agent TEXT,
      user_id TEXT,
      security_pin TEXT,
      expires_at TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    -- PROFILES
    CREATE TABLE IF NOT EXISTS merchant_profiles (
      id TEXT PRIMARY KEY,
      session_id TEXT,
      user_id TEXT UNIQUE,
      business_name TEXT,
      ruc TEXT,
      category TEXT,
      seniority_range TEXT,
      tier_hint TEXT,
      address TEXT,
      district TEXT,
      city TEXT DEFAULT 'Lima',
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS provider_profiles (
      id TEXT PRIMARY KEY,
      session_id TEXT,
      user_id TEXT UNIQUE,
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
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    -- PRODUCTS
    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY,
      merchant_id TEXT,
      session_id TEXT,
      name TEXT NOT NULL,
      price_cents INTEGER NOT NULL,
      currency TEXT DEFAULT 'PEN',
      is_frequent INTEGER DEFAULT 0,
      sort_order INTEGER DEFAULT 0,
      deleted_at TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    -- CREDIT SYSTEM
    CREATE TABLE IF NOT EXISTS credit_levels (
      level INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      down_payment_pct INTEGER NOT NULL,
      max_line_cents INTEGER NOT NULL,
      promote_after_on_time INTEGER DEFAULT 3,
      demote_after_late INTEGER DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS credit_lines (
      id TEXT PRIMARY KEY,
      merchant_id TEXT UNIQUE NOT NULL,
      level INTEGER DEFAULT 1,
      total_limit_cents INTEGER NOT NULL DEFAULT 140000,
      used_cents INTEGER NOT NULL DEFAULT 0,
      consecutive_on_time INTEGER DEFAULT 0,
      status TEXT DEFAULT 'ACTIVE',
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (merchant_id) REFERENCES merchant_profiles(id),
      FOREIGN KEY (level) REFERENCES credit_levels(level)
    );

    CREATE TABLE IF NOT EXISTS credit_purchases (
      id TEXT PRIMARY KEY,
      merchant_id TEXT NOT NULL,
      line_id TEXT NOT NULL,
      provider_id TEXT NOT NULL,
      plan_code TEXT DEFAULT 'KUOTA_3X',
      total_cents INTEGER NOT NULL,
      down_payment_pct INTEGER NOT NULL,
      down_payment_cents INTEGER NOT NULL,
      financed_cents INTEGER NOT NULL,
      installments_count INTEGER NOT NULL DEFAULT 3,
      interest_rate REAL DEFAULT 0.0998,
      status TEXT DEFAULT 'ACTIVE_ON_TIME',
      receipt_number TEXT UNIQUE,
      issued_at TEXT DEFAULT (datetime('now')),
      settled_at TEXT,
      FOREIGN KEY (merchant_id) REFERENCES merchant_profiles(id),
      FOREIGN KEY (line_id) REFERENCES credit_lines(id)
    );

    CREATE TABLE IF NOT EXISTS installments (
      id TEXT PRIMARY KEY,
      purchase_id TEXT NOT NULL,
      number INTEGER NOT NULL,
      amount_cents INTEGER NOT NULL,
      principal_cents INTEGER NOT NULL,
      interest_cents INTEGER NOT NULL,
      due_date TEXT NOT NULL,
      status TEXT DEFAULT 'PENDING',
      paid_at TEXT,
      late_days INTEGER DEFAULT 0,
      FOREIGN KEY (purchase_id) REFERENCES credit_purchases(id)
    );

    -- SALES & SCORE
    CREATE TABLE IF NOT EXISTS sales (
      id TEXT PRIMARY KEY,
      merchant_id TEXT NOT NULL,
      client_id TEXT,
      source TEXT CHECK(source IN ('YAPE', 'PLIN', 'MANUAL', 'OCR', 'PAYMENT_LINK')),
      amount_cents INTEGER NOT NULL,
      concept TEXT,
      operation_ref TEXT,
      verified INTEGER DEFAULT 0,
      review_status TEXT DEFAULT 'APPROVED',
      occurred_at TEXT DEFAULT (datetime('now')),
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (merchant_id) REFERENCES merchant_profiles(id)
    );

    CREATE TABLE IF NOT EXISTS credit_scores (
      merchant_id TEXT PRIMARY KEY,
      score INTEGER DEFAULT 720,
      level INTEGER DEFAULT 1,
      last_calculated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (merchant_id) REFERENCES merchant_profiles(id)
    );

    CREATE TABLE IF NOT EXISTS score_events (
      id TEXT PRIMARY KEY,
      merchant_id TEXT NOT NULL,
      type TEXT NOT NULL,
      points INTEGER NOT NULL,
      ref_id TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (merchant_id) REFERENCES merchant_profiles(id)
    );

    -- PAYMENT LINKS
    CREATE TABLE IF NOT EXISTS payment_links (
      id TEXT PRIMARY KEY,
      merchant_id TEXT NOT NULL,
      token TEXT UNIQUE NOT NULL,
      amount_cents INTEGER NOT NULL,
      fee_cents INTEGER NOT NULL,
      net_cents INTEGER NOT NULL,
      fee_bps INTEGER DEFAULT 100,
      concept TEXT,
      product_id TEXT,
      quantity INTEGER,
      customer_name TEXT,
      customer_phone TEXT,
      customer_email TEXT,
      status TEXT DEFAULT 'DRAFT',
      expires_at TEXT,
      paid_at TEXT,
      gateway_ref TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (merchant_id) REFERENCES merchant_profiles(id)
    );

    CREATE TABLE IF NOT EXISTS payments (
      id TEXT PRIMARY KEY,
      payment_link_id TEXT NOT NULL,
      method TEXT CHECK(method IN ('YAPE', 'PLIN', 'CARD')),
      gateway_ref TEXT,
      amount_cents INTEGER NOT NULL,
      status TEXT DEFAULT 'SUCCESS',
      raw_webhook_json TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (payment_link_id) REFERENCES payment_links(id)
    );

    CREATE TABLE IF NOT EXISTS ledger_entries (
      id TEXT PRIMARY KEY,
      payment_id TEXT NOT NULL,
      account TEXT NOT NULL,
      type TEXT CHECK(type IN ('DEBIT', 'CREDIT')),
      amount_cents INTEGER NOT NULL,
      description TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (payment_id) REFERENCES payments(id)
    );

    -- PROVIDER KYC & DETAILS
    CREATE TABLE IF NOT EXISTS kyc_requests (
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
      created_at TEXT DEFAULT (datetime('now')),
      completed_at TEXT,
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS kyc_checks (
      id TEXT PRIMARY KEY,
      request_id TEXT NOT NULL,
      type TEXT CHECK(type IN ('SUNAT', 'RENIEC', 'SCORING')),
      status TEXT DEFAULT 'PENDING',
      result_json TEXT,
      started_at TEXT,
      finished_at TEXT,
      attempts INTEGER DEFAULT 1,
      FOREIGN KEY (request_id) REFERENCES kyc_requests(id)
    );

    CREATE TABLE IF NOT EXISTS provider_locations (
      id TEXT PRIMARY KEY,
      provider_id TEXT NOT NULL,
      is_primary INTEGER DEFAULT 1,
      lat REAL,
      lng REAL,
      geohash TEXT,
      accuracy_m REAL,
      source TEXT CHECK(source IN ('GPS', 'MANUAL')),
      address_line TEXT,
      district TEXT,
      city TEXT,
      department TEXT DEFAULT 'Lima',
      fiscal_distance_m REAL DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (provider_id) REFERENCES provider_profiles(id)
    );

    CREATE TABLE IF NOT EXISTS settlement_accounts (
      id TEXT PRIMARY KEY,
      provider_id TEXT NOT NULL,
      bank TEXT NOT NULL,
      account_masked TEXT NOT NULL,
      cci TEXT NOT NULL,
      holder_name TEXT NOT NULL,
      holder_doc TEXT NOT NULL,
      verified_at TEXT DEFAULT (datetime('now')),
      status TEXT DEFAULT 'ACTIVE',
      FOREIGN KEY (provider_id) REFERENCES provider_profiles(id)
    );

    -- PROMOTIONS & APP CONFIG
    CREATE TABLE IF NOT EXISTS promotions (
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

    -- BUSINESS ENTITY (PRD Reconocimiento Inteligente de Comercios RUC SUNAT)
    CREATE TABLE IF NOT EXISTS businesses (
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
      fecha_consulta TEXT DEFAULT (datetime('now')),
      fecha_actualizacion TEXT DEFAULT (datetime('now')),
      usuario_propietario TEXT,
      session_id TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- PADRON REDUCIDO SUNAT (Basado en BarretoPalacios / SUNAT Oficial)
    CREATE TABLE IF NOT EXISTS sunat_contribuyentes (
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
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS device_tokens (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      platform TEXT,
      token TEXT,
      consent TEXT DEFAULT 'GRANTED',
      updated_at TEXT DEFAULT (datetime('now'))
    );

    -- NOTIFICACIONES DEL COMERCIO (sheet de la campana del Home)
    CREATE TABLE IF NOT EXISTS notification_preferences (
      merchant_id TEXT PRIMARY KEY,
      push_enabled INTEGER NOT NULL DEFAULT 1,
      last_seen_at TEXT,
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS workshop_reminders (
      merchant_id TEXT NOT NULL,
      workshop_id TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (merchant_id, workshop_id)
    );
  `);

  // Migrations for merchant KYC & KYC requests fields
  const schemaMigrations = [
    "ALTER TABLE merchant_profiles ADD COLUMN dni TEXT",
    "ALTER TABLE merchant_profiles ADD COLUMN full_name TEXT",
    "ALTER TABLE merchant_profiles ADD COLUMN phone TEXT",
    "ALTER TABLE merchant_profiles ADD COLUMN kyc_status TEXT DEFAULT 'PENDING'",
    "ALTER TABLE kyc_requests ADD COLUMN current_stage TEXT DEFAULT 'SCORING'",
    "ALTER TABLE kyc_requests ADD COLUMN updated_at TEXT DEFAULT (datetime('now'))",
    "ALTER TABLE kyc_requests ADD COLUMN dni_front TEXT",
    "ALTER TABLE kyc_requests ADD COLUMN dni_back TEXT",
    "ALTER TABLE kyc_requests ADD COLUMN selfie TEXT"
  ];
  for (const sql of schemaMigrations) {
    try { db.prepare(sql).run(); } catch (_) {}
  }

  seedData();
  seedSunatData();
}

function seedSunatData() {
  const count = db.prepare('SELECT count(*) as total FROM sunat_contribuyentes').get() as { total: number };
  if (count.total > 0) return;

  const insert = db.prepare(`
    INSERT INTO sunat_contribuyentes (
      ruc, nombre_razon_social, nombre_comercial, tipo_contribuyente,
      actividad_principal, actividades_secundarias, estado_contribuyente,
      condicion_domicilio, ubigeo, direccion_fiscal, departamento, provincia, distrito
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  // Padrón Oficial Reducido con Casos Reales
  insert.run(
    '20601234567',
    'DISTRIBUIDORA TEXTIL ANDINA S.A.C.',
    'ANDINA TEXTIL',
    'SOCIEDAD ANONIMA CERRADA',
    '4641 - Venta al por mayor de productos textiles, prendas de vestir',
    '4751 - Venta al por menor de hilados y telas; 1410 - Confección de ropa',
    'ACTIVO',
    'HABIDO',
    '150115',
    'Jr. Gamarra 1020 Int. 401',
    'LIMA',
    'LIMA',
    'LA VICTORIA'
  );

  insert.run(
    '20519482711',
    'CONFECCIONES DON LUCHO & HNOS. S.A.C.',
    'DON LUCHO GAMARRA',
    'SOCIEDAD ANONIMA CERRADA',
    '1410 - Fabricación de prendas de vestir',
    '4641 - Venta al por mayor de textiles; 4771 - Venta de prendas de vestir',
    'ACTIVO',
    'HABIDO',
    '150115',
    'Galería Santa Rosa, Tda. 204 - Jr. Gamarra 840',
    'LIMA',
    'LIMA',
    'LA VICTORIA'
  );

  insert.run(
    '20100041953',
    'ALICORP S.A.A.',
    'ALICORP',
    'SOCIEDAD ANONIMA ABIERTA',
    '1079 - Elaboración de otros productos alimenticios n.c.p.',
    '4630 - Venta al por mayor de alimentos, bebidas y tabaco',
    'ACTIVO',
    'HABIDO',
    '070101',
    'Av. Argentina 4793',
    'CALLAO',
    'CALLAO',
    'CARMEN DE LA LEGUA REYNOSO'
  );

  insert.run(
    '20100047218',
    'BANCO DE CREDITO DEL PERU',
    'BCP',
    'SOCIEDAD ANONIMA',
    '6419 - Otros tipos de intermediación monetaria',
    '6499 - Otras actividades de servicios financieros',
    'ACTIVO',
    'HABIDO',
    '150101',
    'Jr. Lampa 499',
    'LIMA',
    'LIMA',
    'LIMA'
  );

  insert.run(
    '20100190797',
    'LECHE GLORIA S.A.',
    'GLORIA',
    'SOCIEDAD ANONIMA',
    '1050 - Elaboración de productos lácteos',
    '4630 - Venta al por mayor de alimentos y bebidas',
    'ACTIVO',
    'HABIDO',
    '150115',
    'Av. República de Panamá 2461',
    'LIMA',
    'LIMA',
    'LA VICTORIA'
  );

  insert.run(
    '10458923011',
    'MENDOZA QUISPE CARLOS ALBERTO',
    'BODEGA SAN MARTÍN',
    'PERSONA NATURAL CON NEGOCIO',
    '4711 - Venta al por menor en comercios no especializados con predominio de alimentos',
    '4721 - Venta al por menor de frutas, verduras y lácteos',
    'ACTIVO',
    'HABIDO',
    '150132',
    'Jr. Los Andes 342',
    'LIMA',
    'LIMA',
    'SAN MARTIN DE PORRES'
  );

  insert.run(
    '10748392015',
    'RODRIGUEZ SOTO LUIS ENRIQUE',
    'CALZADOS EL ARTESANO',
    'PERSONA NATURAL CON NEGOCIO',
    '4772 - Venta al por menor de calzado y artículos de cuero',
    '1520 - Fabricación de calzado',
    'ACTIVO',
    'HABIDO',
    '130101',
    'Av. España 1240',
    'LA LIBERTAD',
    'TRUJILLO',
    'TRUJILLO'
  );

  // Caso para probar Advertencias de Estado / Domicilio según PRD
  insert.run(
    '20481920381',
    'INVERSIONES & SERVICIOS EL ROBLE E.I.R.L.',
    'EL ROBLE CONSTRUCCIÓN',
    'EMPRESA INDIVIDUAL DE RESP. LTDA',
    '4100 - Construcción de edificios',
    '4330 - Terminación y acabado de edificios',
    'SUSPENSION TEMPORAL',
    'NO HABIDO',
    '150103',
    'Av. Grau 520',
    'LIMA',
    'LIMA',
    'ATE'
  );

  insert.run(
    '20392817263',
    'COMERCIALIZADORA DEL CENTRO S.R.L.',
    'EL CENTRO MAYORISTA',
    'SOCIEDAD COMERCIAL DE RESP. LTDA.',
    '4690 - Venta al por mayor no especializada',
    '4719 - Otras actividades de venta al por menor',
    'ACTIVO',
    'NO HALLADO',
    '150113',
    'Jr. Junín 890',
    'LIMA',
    'LIMA',
    'JESUS MARIA'
  );
}

function seedData() {
  const count = db.prepare('SELECT count(*) as total FROM credit_levels').get() as { total: number };
  if (count.total > 0) return;

  // 1. Seed Credit Levels
  const insertLevel = db.prepare(`
    INSERT INTO credit_levels (level, name, down_payment_pct, max_line_cents, promote_after_on_time)
    VALUES (?, ?, ?, ?, ?)
  `);
  insertLevel.run(1, 'Brote', 50, 140000, 3);
  insertLevel.run(2, 'Raíz', 40, 350000, 3);
  insertLevel.run(3, 'Tallo', 30, 700000, 3);
  insertLevel.run(4, 'Rama', 20, 1200000, 3);
  insertLevel.run(5, 'Fruto', 10, 2000000, 3);
  insertLevel.run(6, 'Cosecha', 0, 3500000, 3);

  // 2. Seed Promotions
  const insertPromo = db.prepare(`
    INSERT INTO promotions (id, category, tag, headline, discount_pct, partner_name, description, condition, ends_in_days)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  insertPromo.run('promo_01', 'FASHION', 'Textil', '30% dcto en inicial', 30, 'Comercios Gamarra', 'Aplica en rollos de lino y algodón pima, hasta 3 cuotas.', 'Válido para compras mayores a S/ 200', 7);
  insertPromo.run('promo_02', 'FOOD', 'Alimentos', '0% de interés', 0, 'Red de Bodegas', 'Compra abarrotes al por mayor y financia con Kuota QR sin comisiones extra.', 'Solo pago puntual', 5);
  insertPromo.run('promo_03', 'FOOTWEAR', 'Calzado', 'Paga en 60 días', 0, 'Fabricantes Trujillanos', 'Cuotas quincenales diferidas para abastecimiento de temporada escolar.', 'Nivel 2 en adelante', 10);

  // 3. Seed Default Demo Merchant & Active Purchase (Matching screens 05, 07, 09, 10)
  const insertUser = db.prepare(`
    INSERT INTO users (id, phone, role, status, first_name, last_name)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  insertUser.run('usr_carlos', '+51987654321', 'MERCHANT', 'ACTIVE', 'Carlos', 'Mendoza');

  const insertMerchant = db.prepare(`
    INSERT INTO merchant_profiles (id, user_id, business_name, ruc, category, seniority_range, tier_hint, address, district, city)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  insertMerchant.run('mer_carlos', 'usr_carlos', 'Confecciones Carlos & Hnos.', '10458923011', 'FASHION', 'CONSOLIDATED', 'EXTENDED_ELIGIBLE', 'Jr. Gamarra 1020 Int. 302', 'La Victoria', 'Lima');

  const insertLine = db.prepare(`
    INSERT INTO credit_lines (id, merchant_id, level, total_limit_cents, used_cents, consecutive_on_time, status)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  // Used S/ 118.00 (financed portion of the S/ 236.00 purchase)
  insertLine.run('line_carlos', 'mer_carlos', 1, 140000, 11800, 1, 'ACTIVE');

  const insertScore = db.prepare(`
    INSERT INTO credit_scores (merchant_id, score, level)
    VALUES (?, ?, ?)
  `);
  insertScore.run('mer_carlos', 720, 1);

  // Default provider: Confecciones Don Lucho & Hnos.
  const insertProvUser = db.prepare(`
    INSERT INTO users (id, phone, role, status, first_name, last_name)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  insertProvUser.run('usr_donlucho', '+51984521893', 'PROVIDER', 'ACTIVE', 'Lucho', 'Quispe');

  const insertProv = db.prepare(`
    INSERT INTO provider_profiles (id, user_id, ruc, legal_name, category, seniority_range, kyc_status, fee_bps)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  insertProv.run('prov_donlucho', 'usr_donlucho', '20519482711', 'Confecciones Don Lucho & Hnos. S.A.C.', 'TEXTILES', 'GT_3Y', 'APPROVED', 100);

  const insertProvLoc = db.prepare(`
    INSERT INTO provider_locations (id, provider_id, is_primary, lat, lng, source, address_line, district, city)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  insertProvLoc.run('loc_donlucho', 'prov_donlucho', 1, -12.0645, -77.0142, 'GPS', 'Galería Santa Rosa, Tda. 204 - Jr. Gamarra 840', 'La Victoria', 'Lima');

  // Active Purchase: S/ 236.00 total (50% down payment S/ 118.00 paid, 3 installments of S/ 43.26)
  const insertPurchase = db.prepare(`
    INSERT INTO credit_purchases (id, merchant_id, line_id, provider_id, plan_code, total_cents, down_payment_pct, down_payment_cents, financed_cents, installments_count, status, receipt_number, issued_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  insertPurchase.run('pur_active_01', 'mer_carlos', 'line_carlos', 'prov_donlucho', 'KUOTA_3X', 23600, 50, 11800, 11800, 3, 'ACTIVE_ON_TIME', 'KQ-REC-8921-PE', '2026-10-24');

  // 3 installments: cuota 1 paid, cuota 2 due 07 Nov, cuota 3 due 21 Nov
  const insertInst = db.prepare(`
    INSERT INTO installments (id, purchase_id, number, amount_cents, principal_cents, interest_cents, due_date, status, paid_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  insertInst.run('inst_01', 'pur_active_01', 1, 4326, 3933, 393, '2026-10-31', 'PAID', '2026-10-31 10:15:00');
  insertInst.run('inst_02', 'pur_active_01', 2, 4326, 3933, 393, '2026-11-07', 'PENDING', null);
  insertInst.run('inst_03', 'pur_active_01', 3, 4326, 3934, 392, '2026-11-21', 'PENDING', null);

  // Seed sample products for Carlos
  const insertProd = db.prepare(`
    INSERT INTO products (id, merchant_id, name, price_cents, is_frequent, sort_order)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  insertProd.run('prod_01', 'mer_carlos', 'Blusa de lino italiana', 4500, 1, 1);
  insertProd.run('prod_02', 'mer_carlos', 'Polo Pima Oversize 24/1', 3500, 1, 2);
  insertProd.run('prod_03', 'mer_carlos', 'Pantalón drill confort', 6800, 0, 3);
}
