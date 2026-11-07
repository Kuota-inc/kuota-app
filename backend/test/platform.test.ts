// Plataforma sobre Postgres: migraciones, aislamiento entre el núcleo y la zona
// de dinero (roles con privilegio mínimo) y pruebas de humo de los flujos del núcleo.
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kuota-plat-'));
process.env.KUOTA_DEV_SECRETS_FILE = path.join(tmp, 'secrets.json');
process.env.NODE_ENV = 'test';

const { useTestDatabase } = await import('./helpers.js');
const dropTestDatabase = await useTestDatabase();
const { createApp } = await import('../src/app.js');
const { db, closeDatabases } = await import('../src/db/database.js');
const { migrate } = await import('../src/db/migrate.js');

let base = '';
let server: ReturnType<Awaited<ReturnType<typeof createApp>>['listen']>;

before(async () => {
  const app = await createApp();
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve());
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1`;
});

after(async () => {
  server?.close();
  await closeDatabases();
  await dropTestDatabase();
  fs.rmSync(tmp, { recursive: true, force: true });
});

type Json = Record<string, any>;
async function call(method: string, url: string, body?: unknown, extra: Record<string, string> = {}) {
  const res = await fetch(`${base}${url}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...extra },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const text = await res.text();
  return { status: res.status, body: (text ? JSON.parse(text) : {}) as Json };
}

/** Ejecuta `sql` con un rol de grupo, dentro de una transacción que lo revierte todo. */
async function asRole(role: string, sql: string, ...params: unknown[]) {
  return db.tx(async () => {
    await db.exec(`SET LOCAL ROLE ${role}`);
    const rows = await db.all(sql, ...params);
    throw Object.assign(new Error('rollback'), { rows });
  }).catch((e: any) => {
    if (e.message === 'rollback') return e.rows;
    throw e;
  });
}

describe('Migraciones', () => {
  test('están registradas y volver a correrlas no hace nada', async () => {
    const before = await db.all<{ version: string }>('SELECT version FROM public.schema_migrations ORDER BY version');
    assert.deepEqual(
      before.map((r) => r.version),
      ['0001_core.sql', '0002_payments.sql', '0003_roles.sql', '0004_pay360_coupons.sql', '0005_kyc_didit.sql', '0006_provider_settlement.sql', '0007_openpay.sql', '0008_scoring_level1.sql', '0009_provider_access.sql']
    );
    await migrate(db);
    const again = await db.get<{ n: number }>('SELECT COUNT(*) AS n FROM public.schema_migrations');
    assert.equal(again!.n, 9);
  });

  test('las tablas de dinero viven en el esquema payments', async () => {
    const rows = await db.all<{ table_schema: string }>(
      "SELECT table_schema FROM information_schema.tables WHERE table_name IN ('payment_links', 'ledger_entries', 'audit_log')"
    );
    assert.equal(rows.length, 3);
    assert.ok(rows.every((r) => r.table_schema === 'payments'));
  });
});

describe('Aislamiento del módulo de pagos (roles)', () => {
  test('el núcleo no puede leer ni escribir en la zona de dinero', async () => {
    await assert.rejects(asRole('kuota_core_rw', 'SELECT * FROM payments.payment_links'), /permission denied/);
    await assert.rejects(asRole('kuota_core_rw', 'SELECT * FROM payments.merchant_credentials'), /permission denied/);
    const ok = await asRole('kuota_core_rw', 'SELECT id FROM public.merchant_profiles LIMIT 1');
    assert.equal(ok.length, 1);
  });

  test('pagos no puede editar ni borrar las tablas de solo agregado (privilegio, además del trigger)', async () => {
    await assert.rejects(asRole('kuota_payments_rw', "UPDATE payments.audit_log SET result = 'OK'"), /permission denied/);
    await assert.rejects(asRole('kuota_payments_rw', 'DELETE FROM payments.ledger_entries'), /permission denied/);
  });

  test('pagos solo toca del núcleo lo que necesita', async () => {
    const merchants = await asRole('kuota_payments_rw', 'SELECT id, kyc_status FROM public.merchant_profiles LIMIT 1');
    assert.equal(merchants.length, 1);
    await assert.rejects(asRole('kuota_payments_rw', 'SELECT * FROM public.credit_purchases'), /permission denied/);
    await assert.rejects(asRole('kuota_payments_rw', "UPDATE public.merchant_profiles SET kyc_status = 'APPROVED'"), /permission denied/);
    await assert.rejects(asRole('kuota_payments_rw', 'UPDATE public.credit_scores SET level = 6'), /permission denied/);
  });
});

describe('Flujos del núcleo sobre Postgres', () => {
  test('inicio, catálogos y crédito de la cuenta demo', async () => {
    for (const url of ['/health', '/public/stats', '/catalogs/business-categories', '/merchants/me/home', '/merchants/me/kuotear', '/credit/line', '/credit/levels']) {
      const r = await call('GET', url);
      assert.equal(r.status, 200, url);
    }
    const sim = await call('POST', '/credit/simulations', { purchase_cents: 30000, installments: 3 });
    assert.equal(sim.status, 200);
  });

  test('venta manual y búsqueda sin distinguir mayúsculas', async () => {
    const created = await call('POST', '/merchants/me/sales', { amount_cents: 1500, concept: 'Venta Manual Polo', source: 'MANUAL' });
    assert.equal(created.status, 201);
    const found = await call('GET', '/merchants/me/sales?q=manual');
    assert.equal(found.status, 200);
    const list = Array.isArray(found.body) ? found.body : found.body.data ?? found.body.sales;
    assert.ok(JSON.stringify(list).includes('Venta Manual Polo'));
  });

  test('pagar una cuota y liquidar la compra activa', async () => {
    assert.equal((await call('POST', '/credit/installments/inst_02/pay')).status, 200);
    assert.equal((await call('POST', '/credit/purchases/pur_active_01/settle')).status, 200);
  });

  test('onboarding de comercio completo, con RUC provisional numérico y PIN', async () => {
    const s = await call('POST', '/onboarding/sessions', { role: 'MERCHANT', device_id: 'test', accepted_terms_version: '2026.1', accepted_privacy_version: '2026.1' });
    assert.equal(s.status, 201);
    const id = s.body.id ?? s.body.session_id;
    const identity = await call('POST', `/onboarding/sessions/${id}/merchant-identity`, {
      account_type: 'PERSONAL',
      dni: '47891234',
      full_name: 'CARLOS ALBERTO MENDOZA QUISPE',
      phone: '911222333',
      whatsapp_opt_in: true
    });
    assert.equal(identity.status, 201);
    assert.equal((await call('PUT', `/onboarding/sessions/${id}/merchant-activity`, { category: 'FOOD', seniority_range: 'CONSOLIDATED', business_name: 'Bodega Test' })).status, 200);
    assert.equal((await call('PUT', `/onboarding/sessions/${id}/products`, { products: [{ name: 'Pan', price_cents: 50, is_frequent: true }] })).status, 200);
    const done = await call('POST', `/onboarding/sessions/${id}/complete`, { business_name: 'Bodega Test', phone: '911222333' });
    assert.equal(done.status, 201);
    const profile = await call('GET', `/onboarding/sessions/${id}`);
    assert.match(profile.body.merchant_profile.ruc, /^10\d{9}$/);
    const again = await call('POST', `/onboarding/sessions/${id}/complete`, { business_name: 'Bodega Test', phone: '911222333' });
    assert.ok(again.status < 500, 'repetir el cierre no es un error del servidor');
    const pin = await call('POST', `/onboarding/sessions/${id}/security-pin`, { pin: '739164' });
    assert.equal(pin.status, 200);
    const cred = await db.get<{ pin_hash: string }>('SELECT pin_hash FROM merchant_credentials WHERE merchant_id = ?', done.body.merchant_id);
    assert.match(cred!.pin_hash, /^scrypt\$/);

    // Con su identificador, el comercio nuevo ve SU panel: sin deudas ni compras demo.
    const me = { 'X-Merchant-Id': done.body.merchant_id };
    const home = await call('GET', '/merchants/me/home', undefined, me);
    assert.equal(home.body.greeting_name, 'CARLOS');
    assert.equal(home.body.credit.used_cents, 0);
    assert.equal(home.body.next_installment, null);
    assert.equal((await call('GET', '/credit/purchases/active', undefined, me)).body, null);
    assert.equal((await call('GET', '/merchants/me/welcome-summary', undefined, me)).body.business.name, 'Bodega Test');
  });

  test('onboarding de proveedor con RUC del padrón local', async () => {
    const s = await call('POST', '/onboarding/sessions', { role: 'PROVIDER', device_id: 'test', accepted_terms_version: '2026.1', accepted_privacy_version: '2026.1' });
    const id = s.body.id ?? s.body.session_id;
    assert.equal((await call('GET', '/kyc/business-lookup/20519482711')).status, 200);
    const kyc = await call('POST', '/kyc/requests', { session_id: id, ruc: '20519482711', legal_rep_dni: '47891234', whatsapp: '984521893' });
    assert.equal(kyc.status, 201);
    for (const [method, url, body] of [
      ['PUT', '/providers/activity', { category: 'TEXTILES', seniority_range: 'GT_3Y' }],
      ['PUT', '/providers/notifications', { consent: 'GRANTED' }],
      ['PUT', '/providers/settlement-account', { bank: 'BCP', cci: '00219400123456789012', holder_name: 'DON LUCHO SAC', holder_doc: '20519482711' }],
      ['GET', '/providers/savings-estimate', undefined],
      ['POST', '/providers/activate', undefined],
      ['GET', '/providers/recommended', undefined]
    ] as const) {
      const r = await call(method, url, body);
      assert.ok(r.status < 300, `${method} ${url} → ${r.status}`);
    }
  });

  test('preferencias de notificación persisten', async () => {
    assert.equal((await call('PUT', '/merchants/me/notifications/preferences', { push_enabled: false, workshop_reminder: true })).status, 200);
    const r = await call('GET', '/merchants/me/notifications/preferences');
    assert.equal(r.body.push_enabled, false);
    assert.equal(r.body.workshop.reminder_set, true);
  });
});
