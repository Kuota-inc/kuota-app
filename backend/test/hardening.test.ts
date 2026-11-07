// Regresiones de la ronda de QA: dueño en pagos de cuotas, sesión de onboarding sin fugas,
// validación de compras y recuperación de PIN con DNI.
import { after, before, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kuota-hard-'));
process.env.KUOTA_DEV_SECRETS_FILE = path.join(tmp, 'secrets.json');
process.env.NODE_ENV = 'test';

const { useTestDatabase } = await import('./helpers.js');
const dropTestDatabase = await useTestDatabase();
const { createApp } = await import('../src/app.js');
const { closeDatabases } = await import('../src/db/database.js');
const { resetRateLimits } = await import('../src/security/guards.js');

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

const DEVICE = 'hardening_test_device_01';

async function register(phone: string, dni: string, pin: string) {
  const s = await call('POST', '/onboarding/sessions', { role: 'MERCHANT', device_id: DEVICE, accepted_terms_version: '2026.1', accepted_privacy_version: '2026.1' });
  const id = s.body.session_id as string;
  await call('POST', `/onboarding/sessions/${id}/merchant-identity`, { account_type: 'PERSONAL', dni, full_name: 'QA PRUEBA', phone, whatsapp_opt_in: true });
  await call('PUT', `/onboarding/sessions/${id}/merchant-activity`, { category: 'FOOD', seniority_range: 'CONSOLIDATED', business_name: 'Bodega QA' });
  await call('PUT', `/onboarding/sessions/${id}/products`, { products: [{ name: 'Pan', price_cents: 50, is_frequent: true }] });
  const done = await call('POST', `/onboarding/sessions/${id}/complete`, { business_name: 'Bodega QA', phone });
  assert.equal(done.status, 201);
  assert.equal((await call('POST', `/onboarding/sessions/${id}/security-pin`, { pin })).status, 200);
  return { sessionId: id, merchantId: done.body.merchant_id as string };
}

describe('Onboarding: la sesión no regala la cuenta', () => {
  test('GET de sesión no filtra DNI, teléfono ni hash de PIN; y el PIN no se sobrescribe', async () => {
    const a = await register('930000001', '73000001', '739164');
    const view = await call('GET', `/onboarding/sessions/${a.sessionId}`);
    const raw = JSON.stringify(view.body);
    assert.ok(!raw.includes('scrypt'), 'sin hash de PIN');
    assert.ok(!raw.includes('73000001'), 'sin DNI');
    assert.ok(!raw.includes('930000001'), 'sin teléfono');

    const takeover = await call('POST', `/onboarding/sessions/${a.sessionId}/security-pin`, { pin: '861953' });
    assert.equal(takeover.status, 409);
    assert.equal(takeover.body.error.code, 'PIN_ALREADY_SET');
    const login = await call('POST', '/auth/sessions', { pin: '739164', phone: '+51930000001', device_id: DEVICE });
    assert.equal(login.status, 201, 'el PIN original sigue vigente');
  });

  test('una sesión completada no se puede reescribir', async () => {
    const a = await register('930000002', '73000002', '739164');
    const r = await call('POST', `/onboarding/sessions/${a.sessionId}/merchant-identity`, { account_type: 'PERSONAL', dni: '73999999', full_name: 'OTRO', phone: '930000002' });
    assert.equal(r.status, 409);
    assert.equal(r.body.error.code, 'SESSION_COMPLETED');
  });
});

describe('Crédito: dueño y validación', () => {
  test('pagar cuota o liquidar compra de otro comercio o inexistente es 404 y no mueve la línea', async () => {
    const victim = await register('930000003', '73000003', '739164');
    const attacker = await register('930000004', '73000004', '739164');
    const v = { 'X-Merchant-Id': victim.merchantId };
    const att = { 'X-Merchant-Id': attacker.merchantId };

    const buy = await call('POST', '/credit/purchases', { provider_id: 'prov_donlucho', total_cents: 20000, installments: 3 }, v);
    assert.equal(buy.status, 201);
    const before = (await call('GET', '/credit/line', undefined, v)).body.line.used_cents;
    assert.ok(before > 0);
    const active = (await call('GET', '/credit/purchases/active', undefined, v)).body;

    assert.equal((await call('POST', `/credit/installments/${active.installments[0].id}/pay`, undefined, att)).status, 404);
    assert.equal((await call('POST', `/credit/purchases/${active.id}/settle`, undefined, att)).status, 404);
    assert.equal((await call('POST', '/credit/installments/ins_inexistente/pay', undefined, att)).status, 404);
    assert.equal((await call('POST', '/credit/purchases/pur_inexistente/settle', undefined, att)).status, 404);
    assert.equal((await call('GET', '/credit/line', undefined, v)).body.line.used_cents, before);

    // El dueño sí puede, y repetir no libera el crédito dos veces.
    assert.equal((await call('POST', `/credit/purchases/${active.id}/settle`, undefined, v)).status, 200);
    assert.equal((await call('GET', '/credit/line', undefined, v)).body.line.used_cents, 0);
    const again = await call('POST', `/credit/purchases/${active.id}/settle`, undefined, v);
    assert.equal(again.body.already_paid, true);
  });

  test('compras simultáneas no superan el límite ni la regla de una compra activa', async () => {
    const m = await register('930000005', '73000005', '739164');
    const h = { 'X-Merchant-Id': m.merchantId };
    const results = await Promise.all(
      Array.from({ length: 6 }, () => call('POST', '/credit/purchases', { provider_id: 'prov_donlucho', total_cents: 10000, installments: 3 }, h))
    );
    assert.equal(results.filter((r) => r.status === 201).length, 1);
  });

  test('un proveedor inexistente no recibe compras', async () => {
    const m = await register('930000013', '73000013', '739164');
    const r = await call('POST', '/credit/purchases', { provider_id: 'prov_fantasma01', total_cents: 10000, installments: 3 }, { 'X-Merchant-Id': m.merchantId });
    assert.equal(r.status, 422);
    assert.equal(r.body.error.code, 'PROVIDER_INVALID');
  });

  test('montos y cuotas inválidos se rechazan (incluida una simulación enorme)', async () => {
    const m = await register('930000006', '73000006', '739164');
    const h = { 'X-Merchant-Id': m.merchantId };
    for (const body of [
      { provider_id: 'prov_donlucho', total_cents: 20000, installments: 0 },
      { provider_id: 'prov_donlucho', total_cents: 20000, installments: -2 },
      { provider_id: 'prov_donlucho', total_cents: 20000, installments: 999999999 },
      { provider_id: 'prov_donlucho', total_cents: 1.5, installments: 3 },
      { provider_id: 'prov_donlucho', total_cents: '20000', installments: 3 },
      { provider_id: '<b>x</b>', total_cents: 20000, installments: 3 }
    ]) {
      assert.equal((await call('POST', '/credit/purchases', body, h)).status, 422, JSON.stringify(body));
    }
    assert.equal((await call('POST', '/credit/simulations', { purchase_cents: 30000, installments: 2000000000 })).status, 422);
  });
});

describe('Recuperación de PIN con DNI', () => {
  beforeEach(() => resetRateLimits());
  test('con el DNI correcto cambia el PIN, cierra sesiones y deja entrar con el nuevo', async () => {
    await register('930000007', '73000007', '739164');
    const old = await call('POST', '/auth/sessions', { pin: '739164', phone: '+51930000007', device_id: DEVICE });
    assert.equal(old.status, 201);
    const r = await call('POST', '/auth/pin/recover', { phone: '+51930000007', dni: '73000007', new_pin: '861953', device_id: DEVICE });
    assert.equal(r.status, 201);
    assert.ok(r.body.access_token);
    assert.equal((await call('POST', '/auth/sessions', { pin: '739164', phone: '+51930000007', device_id: DEVICE })).status, 401, 'el PIN viejo ya no sirve');
    assert.equal((await call('POST', '/auth/sessions', { pin: '861953', phone: '+51930000007', device_id: DEVICE })).status, 201);
    const closed = await call('GET', '/merchants/me/payments/limits', undefined, { Authorization: `Bearer ${old.body.access_token}`, 'X-Device-Id': DEVICE });
    assert.equal(closed.status, 401, 'la sesión anterior quedó cerrada');
  });

  test('cuenta inexistente y DNI incorrecto dan la misma respuesta; al 5.º fallo se bloquea', async () => {
    await register('930000008', '73000008', '739164');
    const ghost = await call('POST', '/auth/pin/recover', { phone: '+51930999999', dni: '73000008', new_pin: '861953', device_id: DEVICE });
    const bad = await call('POST', '/auth/pin/recover', { phone: '+51930000008', dni: '11111111', new_pin: '861953', device_id: DEVICE });
    assert.equal(ghost.status, 403);
    assert.deepEqual(ghost.body.error.code, bad.body.error.code);
    for (let i = 0; i < 4; i++) await call('POST', '/auth/pin/recover', { phone: '+51930000008', dni: `2222222${i}`, new_pin: '861953', device_id: DEVICE });
    const locked = await call('POST', '/auth/pin/recover', { phone: '+51930000008', dni: '73000008', new_pin: '861953', device_id: DEVICE });
    assert.equal(locked.status, 429, 'ni el DNI correcto pasa mientras dure el bloqueo');
    assert.equal((await call('POST', '/auth/sessions', { pin: '739164', phone: '+51930000008', device_id: DEVICE })).status, 201, 'el PIN original sigue intacto');
  });

  test('un dispositivo desvinculado no puede usar la recuperación y el PIN no cambia', async () => {
    await register('930000009', '73000009', '739164');
    const s = await call('POST', '/auth/sessions', { pin: '739164', phone: '+51930000009', device_id: DEVICE });
    assert.equal(s.status, 201);
    const other = 'hardening_test_device_02';
    const s2 = await call('POST', '/auth/sessions', { pin: '739164', phone: '+51930000009', device_id: other });
    assert.equal(s2.status, 201);
    const { paymentsDb } = await import('../src/db/client.js');
    await paymentsDb.prepare('UPDATE merchant_devices SET revoked_at = utc_now_text() WHERE device_id = ?').run(other);
    const r = await call('POST', '/auth/pin/recover', { phone: '+51930000009', dni: '73000009', new_pin: '861953', device_id: other });
    assert.equal(r.status, 403);
    assert.equal((await call('POST', '/auth/sessions', { pin: '739164', phone: '+51930000009', device_id: DEVICE })).status, 201, 'PIN intacto');
  });
});

describe('Ventas, score y proveedores', () => {
  test('la búsqueda trata % _ y NUL como texto y las ventas manuales nunca son verificadas', async () => {
    const m = await register('930000010', '73000010', '739164');
    const h = { 'X-Merchant-Id': m.merchantId };
    const sale = await call('POST', '/merchants/me/sales', { amount_cents: 1500, concept: 'Pan 100%', source: 'PAYMENT_LINK' }, h);
    assert.equal(sale.status, 201);
    assert.equal(sale.body.verified, 0, 'source falsificado no verifica');
    assert.equal((await call('POST', '/merchants/me/sales', { amount_cents: -5 }, h)).status, 422);
    assert.equal((await call('GET', '/merchants/me/sales?q=%00', undefined, h)).status, 200);
    const wild = await call('GET', '/merchants/me/sales?q=%25', undefined, h);
    assert.equal(wild.status, 200);
    assert.equal(wild.body.length, 1, '% busca el símbolo, no todo');
    const none = await call('GET', '/merchants/me/sales?q=_', undefined, h);
    assert.equal(none.body.length, 0, '_ no es comodín');
  });

  test('las señales de score tienen lista cerrada y no se repiten', async () => {
    const m = await register('930000011', '73000011', '739164');
    const h = { 'X-Merchant-Id': m.merchantId };
    assert.equal((await call('POST', '/credit/scoring/signals', { type: 'PAYMENT_CAPTURED' }, h)).status, 422);
    const a = await call('POST', '/credit/scoring/signals', { type: 'LOCATION_SHARED', ref_id: 'x1' }, h);
    assert.equal(a.status, 201);
    const b = await call('POST', '/credit/scoring/signals', { type: 'LOCATION_SHARED', ref_id: 'x1' }, h);
    assert.equal(b.body.duplicate, true);
  });

  test('los datos del KYC salen enmascarados y las rutas de proveedor exigen su token', async () => {
    const m = await register('930000012', '73000012', '739164');
    const s = await call('GET', `/onboarding/sessions/${m.sessionId}`);
    assert.ok(!JSON.stringify(s.body).includes('73000012'));
    const bad = { 'X-Provider-Id': 'prov_donlucho', 'X-Provider-Token': 'no-es-el-token' };
    assert.equal((await call('PUT', '/providers/settlement-account', { bank: 'BCP', cci: '00219400123456789012' }, bad)).status, 401);
    assert.equal((await call('POST', '/providers/activate', undefined, bad)).status, 401);
  });
});
