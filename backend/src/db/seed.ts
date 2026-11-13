// Datos semilla: niveles de crédito y promociones (referencia) y, fuera de
// producción, la cuenta demo (mer_carlos, Don Lucho) y un padrón SUNAT reducido.
import { db } from './client.js';

/** Padrón SUNAT reducido de demostración (solo fuera de producción). */
export async function seedSunatData() {
  const count = await db.prepare('SELECT count(*) as total FROM sunat_contribuyentes').get() as { total: number };
  if (count.total > 0) return;

  const insert = db.prepare(`
    INSERT INTO sunat_contribuyentes (
      ruc, nombre_razon_social, nombre_comercial, tipo_contribuyente,
      actividad_principal, actividades_secundarias, estado_contribuyente,
      condicion_domicilio, ubigeo, direccion_fiscal, departamento, provincia, distrito
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  // Padrón Oficial Reducido con Casos Reales
  await insert.run(
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

  await insert.run(
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

  await insert.run(
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

  await insert.run(
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

  await insert.run(
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

  await insert.run(
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

  await insert.run(
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
  await insert.run(
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

  await insert.run(
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

/** Datos de referencia (niveles de crédito y promociones) y la cuenta demo. */
export async function seedData() {
  const count = await db.prepare('SELECT count(*) as total FROM credit_levels').get() as { total: number };
  if (count.total > 0) return;

  // 1. Seed Credit Levels
  const insertLevel = db.prepare(`
    INSERT INTO credit_levels (level, name, down_payment_pct, max_line_cents, promote_after_on_time)
    VALUES (?, ?, ?, ?, ?)
  `);
  await insertLevel.run(1, 'Brote', 50, 140000, 3);
  await insertLevel.run(2, 'Raíz', 40, 350000, 3);
  await insertLevel.run(3, 'Tallo', 30, 700000, 3);
  await insertLevel.run(4, 'Rama', 20, 1200000, 3);
  await insertLevel.run(5, 'Fruto', 10, 2000000, 3);
  await insertLevel.run(6, 'Cosecha', 0, 3500000, 3);

  // Lo que sigue es la cuenta demo: nunca en producción.
  if (process.env.NODE_ENV === 'production') return;

  // Promociones de ejemplo: solo en desarrollo (en producción serían ofertas inventadas para usuarios reales).
  const insertPromo = db.prepare(`
    INSERT INTO promotions (id, category, tag, headline, discount_pct, partner_name, description, condition, ends_in_days)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  await insertPromo.run('promo_01', 'FASHION', 'Textil', '30% dcto en inicial', 30, 'Comercios Gamarra', 'Aplica en rollos de lino y algodón pima, hasta 3 cuotas.', 'Válido para compras mayores a S/ 200', 7);
  await insertPromo.run('promo_02', 'FOOD', 'Alimentos', '0% de interés', 0, 'Red de Bodegas', 'Compra abarrotes al por mayor y financia con Kuota QR sin comisiones extra.', 'Solo pago puntual', 5);
  await insertPromo.run('promo_03', 'FOOTWEAR', 'Calzado', 'Paga en 60 días', 0, 'Fabricantes Trujillanos', 'Cuotas quincenales diferidas para abastecimiento de temporada escolar.', 'Nivel 2 en adelante', 10);


  // 3. Seed Default Demo Merchant & Active Purchase (Matching screens 05, 07, 09, 10)
  const insertUser = db.prepare(`
    INSERT INTO users (id, phone, role, status, first_name, last_name)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  await insertUser.run('usr_carlos', '+51987654321', 'MERCHANT', 'ACTIVE', 'Carlos', 'Mendoza');

  const insertMerchant = db.prepare(`
    INSERT INTO merchant_profiles (id, user_id, business_name, ruc, category, seniority_range, tier_hint, address, district, city)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  await insertMerchant.run('mer_carlos', 'usr_carlos', 'Confecciones Carlos & Hnos.', '10458923011', 'FASHION', 'CONSOLIDATED', 'EXTENDED_ELIGIBLE', 'Jr. Gamarra 1020 Int. 302', 'La Victoria', 'Lima');

  const insertLine = db.prepare(`
    INSERT INTO credit_lines (id, merchant_id, level, total_limit_cents, used_cents, consecutive_on_time, status)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  // Used S/ 118.00 (financed portion of the S/ 236.00 purchase)
  await insertLine.run('line_carlos', 'mer_carlos', 1, 140000, 11800, 1, 'ACTIVE');

  const insertScore = db.prepare(`
    INSERT INTO credit_scores (merchant_id, score, level)
    VALUES (?, ?, ?)
  `);
  await insertScore.run('mer_carlos', 720, 1);

  // Default provider: Confecciones Don Lucho & Hnos.
  const insertProvUser = db.prepare(`
    INSERT INTO users (id, phone, role, status, first_name, last_name)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  await insertProvUser.run('usr_donlucho', '+51984521893', 'PROVIDER', 'ACTIVE', 'Lucho', 'Quispe');

  const insertProv = db.prepare(`
    INSERT INTO provider_profiles (id, user_id, ruc, legal_name, category, seniority_range, kyc_status, fee_bps)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  await insertProv.run('prov_donlucho', 'usr_donlucho', '20519482711', 'Confecciones Don Lucho & Hnos. S.A.C.', 'TEXTILES', 'GT_3Y', 'APPROVED', 100);
  await db.prepare(`UPDATE provider_profiles SET qr_code = ? WHERE id = ?`).run('KUOTA-PROV-DONLUCHO-01', 'prov_donlucho');

  const insertProvLoc = db.prepare(`
    INSERT INTO provider_locations (id, provider_id, is_primary, lat, lng, source, address_line, district, city)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  await insertProvLoc.run('loc_donlucho', 'prov_donlucho', 1, -12.0645, -77.0142, 'GPS', 'Galería Santa Rosa, Tda. 204 - Jr. Gamarra 840', 'La Victoria', 'Lima');

  // Active Purchase: S/ 236.00 total (50% down payment S/ 118.00 paid, 3 installments of S/ 43.26)
  const insertPurchase = db.prepare(`
    INSERT INTO credit_purchases (id, merchant_id, line_id, provider_id, plan_code, total_cents, down_payment_pct, down_payment_cents, financed_cents, installments_count, status, receipt_number, issued_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  await insertPurchase.run('pur_active_01', 'mer_carlos', 'line_carlos', 'prov_donlucho', 'KUOTA_3X', 23600, 50, 11800, 11800, 3, 'ACTIVE_ON_TIME', 'KQ-REC-8921-PE', '2026-10-24');

  // 3 installments: cuota 1 paid, cuota 2 due 07 Nov, cuota 3 due 21 Nov
  const insertInst = db.prepare(`
    INSERT INTO installments (id, purchase_id, number, amount_cents, principal_cents, interest_cents, due_date, status, paid_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  await insertInst.run('inst_01', 'pur_active_01', 1, 4326, 3933, 393, '2026-10-31', 'PAID', '2026-10-31 10:15:00');
  await insertInst.run('inst_02', 'pur_active_01', 2, 4326, 3933, 393, '2026-11-07', 'PENDING', null);
  await insertInst.run('inst_03', 'pur_active_01', 3, 4326, 3934, 392, '2026-11-21', 'PENDING', null);

  // Seed sample products for Carlos
  const insertProd = db.prepare(`
    INSERT INTO products (id, merchant_id, name, price_cents, is_frequent, sort_order)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  await insertProd.run('prod_01', 'mer_carlos', 'Blusa de lino italiana', 4500, 1, 1);
  await insertProd.run('prod_02', 'mer_carlos', 'Polo Pima Oversize 24/1', 3500, 1, 2);
  await insertProd.run('prod_03', 'mer_carlos', 'Pantalón drill confort', 6800, 0, 3);
}
