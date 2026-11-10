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

describe('Identidad por token de dispositivo (X-Merchant-Token)', () => {
  test('con el token exigido, el id del comercio por sí solo no abre nada', async () => {
    resetRateLimits();
    const a = await register('930000014', '73000014', '739164');
    const b = await register('930000015', '73000015', '739164');
    const loginA = await call('POST', '/auth/sessions', { pin: '739164', phone: '+51930000014', device_id: DEVICE });
    const loginB = await call('POST', '/auth/sessions', { pin: '739164', phone: '+51930000015', device_id: DEVICE });
    assert.ok(loginA.body.identity_token && loginB.body.identity_token);
    process.env.KUOTA_REQUIRE_MERCHANT_TOKEN = '1';
    try {
      const idOnly = { 'X-Merchant-Id': a.merchantId };
      assert.equal((await call('GET', '/merchants/me/home', undefined, idOnly)).status, 401, 'solo el id: rechazado');
      assert.equal((await call('GET', '/credit/line', undefined, idOnly)).status, 401);
      const mine = { ...idOnly, 'X-Merchant-Token': loginA.body.identity_token, 'X-Device-Id': DEVICE };
      assert.equal((await call('GET', '/merchants/me/home', undefined, mine)).status, 200, 'con su token: acceso');
      assert.equal((await call('GET', '/auth/me', undefined, mine)).status, 200);
      const theirs = { ...idOnly, 'X-Merchant-Token': loginB.body.identity_token, 'X-Device-Id': DEVICE };
      assert.equal((await call('GET', '/merchants/me/home', undefined, theirs)).status, 401, 'token de otro comercio: rechazado');
      const otherDevice = { ...mine, 'X-Device-Id': 'hardening_test_device_99' };
      assert.equal((await call('GET', '/merchants/me/home', undefined, otherDevice)).status, 401, 'token de otro dispositivo: rechazado');
      // Recuperar el PIN invalida los tokens anteriores y entrega uno nuevo.
      const rec = await call('POST', '/auth/pin/recover', { phone: '+51930000014', dni: '73000014', new_pin: '861953', device_id: DEVICE });
      assert.equal(rec.status, 201);
      assert.equal((await call('GET', '/merchants/me/home', undefined, mine)).status, 401, 'token viejo revocado');
      const fresh = { ...idOnly, 'X-Merchant-Token': rec.body.identity_token, 'X-Device-Id': DEVICE };
      assert.equal((await call('GET', '/merchants/me/home', undefined, fresh)).status, 200);
    } finally {
      delete process.env.KUOTA_REQUIRE_MERCHANT_TOKEN;
    }
  });
});

describe('Transparencia del costo del crédito', () => {
  test('la simulación informa la TEA real (no una cifra fija) y el costo total', async () => {
    const r = await call('POST', '/credit/simulations', { purchase_cents: 30000, installments: 3 });
    assert.equal(r.status, 200);
    assert.notEqual(r.body.tcea, 18.5);
    assert.ok(r.body.tea_pct > 90 && r.body.tea_pct < 114.13, `TEA ${r.body.tea_pct} debe quedar bajo el tope de referencia del BCRP`);
    assert.equal(r.body.tcea_pct, r.body.tea_pct);
    assert.equal(r.body.interest_cents, r.body.total_repayment_cents - r.body.financed_cents);
    const longer = await call('POST', '/credit/simulations', { purchase_cents: 30000, installments: 12 });
    assert.ok(longer.body.tea_pct < r.body.tea_pct, 'más cuotas con el mismo interés total = menor TEA');
  });
});

describe('Páginas legales y Libro de Reclamaciones', () => {
  const origin = () => base.replace('/api/v1', '');
  const body = {
    kind: 'RECLAMO', full_name: 'Ana Prueba Quispe', doc_type: 'DNI', doc_number: '47891234', phone: '987654321',
    email: 'ana@example.com', service: 'Cobros y links de pago', description: 'No se acreditó mi cobro de S/ 50 del día de ayer.'
  };

  test('privacidad, términos y reclamaciones se sirven y reflejan la normativa', async () => {
    for (const [path, needle] of [['/legal/privacidad', '29733'], ['/legal/terminos', 'TEA/TCEA'], ['/reclamaciones', '15 días hábiles']] as const) {
      const r = await fetch(origin() + path);
      assert.equal(r.status, 200, path);
      assert.match(await r.text(), new RegExp(needle), path);
    }
    const docs = await call('GET', '/legal/documents');
    assert.ok(!docs.body.privacy.url.includes('kuota.pe'), 'enlaces propios, no a un dominio inexistente');
  });

  test('registrar un reclamo devuelve número de hoja y fecha límite de 15 días hábiles', async () => {
    resetRateLimits();
    const r = await call('POST', '/complaints', body);
    assert.equal(r.status, 201);
    assert.match(r.body.code, /^HR-\d{4}-\d{6}$/);
    const due = new Date(r.body.due_at).getTime() - Date.now();
    assert.ok(due > 18 * 86400_000 && due < 24 * 86400_000, 'entre 18 y 24 días calendario');
    const bad = await call('POST', '/complaints', { ...body, email: 'no-es-correo' });
    assert.equal(bad.status, 422);
    assert.equal((await call('POST', '/complaints', { ...body, kind: 'OTRO' })).status, 422);
  });

  test('operaciones ve los reclamos y los responde (token admin)', async () => {
    resetRateLimits();
    const made = await call('POST', '/complaints', body);
    const { secrets } = await import('../src/security/config.js');
    const admin = { Authorization: `Bearer ${secrets.adminToken}` };
    assert.equal((await call('GET', '/internal/complaints')).status, 401);
    const list = await call('GET', '/internal/complaints', undefined, admin);
    assert.ok(list.body.data.some((c: any) => c.code === made.body.code));
    assert.equal((await call('POST', `/internal/complaints/${made.body.code}/respond`, { response: 'Acreditamos tu cobro.' }, admin)).status, 200);
    assert.equal((await call('POST', `/internal/complaints/${made.body.code}/respond`, { response: 'Otra vez' }, admin)).status, 404);
  });
});

describe('Avisos por correo de los reclamos', () => {
  test('al registrar sale la copia al cliente y la alerta a operaciones; al responder, la respuesta al cliente', async () => {
    resetRateLimits();
    const sent: any[] = [];
    const realFetch = globalThis.fetch;
    process.env.RESEND_API_KEY = 're_test';
    process.env.KUOTA_COMPLAINTS_EMAIL = 'ops@example.com';
    globalThis.fetch = (async (url: any, init?: any) => {
      if (String(url).includes('api.resend.com')) {
        sent.push(JSON.parse(init.body));
        return new Response('{"id":"msg_1"}', { status: 200 });
      }
      return realFetch(url, init);
    }) as typeof fetch;
    try {
      const made = await call('POST', '/complaints', {
        kind: 'RECLAMO', full_name: 'Luis <b>Prueba</b>', doc_type: 'DNI', doc_number: '47891234', phone: '987654321',
        email: 'luis@example.com', description: 'Cobro duplicado <script>alert(1)</script> el viernes'
      });
      assert.equal(made.status, 201);
      assert.equal(made.body.email_sent, true);
      assert.equal(sent.length, 2);
      assert.deepEqual(sent.map((m) => m.to[0]).sort(), ['luis@example.com', 'ops@example.com']);
      assert.ok(sent[0].subject.includes(made.body.code) || sent[1].subject.includes(made.body.code));
      assert.ok(!sent.some((m) => m.html.includes('<script>')), 'el contenido del cliente va escapado en el correo');

      const { secrets } = await import('../src/security/config.js');
      const admin = { Authorization: `Bearer ${secrets.adminToken}` };
      const resp = await call('POST', `/internal/complaints/${made.body.code}/respond`, { response: 'Ya devolvimos el cobro duplicado.' }, admin);
      assert.equal(resp.status, 200);
      assert.equal(resp.body.email_sent, true);
      assert.equal(sent.length, 3);
      assert.equal(sent[2].to[0], 'luis@example.com');
      assert.ok(sent[2].html.includes('devolvimos'));
    } finally {
      globalThis.fetch = realFetch;
      delete process.env.RESEND_API_KEY;
      delete process.env.KUOTA_COMPLAINTS_EMAIL;
    }
  });

  test('sin proveedor de correo el reclamo se registra igual', async () => {
    resetRateLimits();
    const r = await call('POST', '/complaints', {
      kind: 'QUEJA', full_name: 'Marta Sin Correo', doc_type: 'DNI', doc_number: '47891235', phone: '987654322',
      email: 'marta@example.com', description: 'Esperé mucho tiempo en la atención.'
    });
    assert.equal(r.status, 201);
    assert.equal(r.body.email_sent, false);
  });
});

describe('Correo por SMTP', () => {
  test('con KUOTA_SMTP_URL los avisos de reclamos salen por SMTP con el remitente configurado', async () => {
    resetRateLimits();
    const { testOutbox } = await import('../src/services/mailer.js');
    testOutbox.length = 0;
    process.env.KUOTA_SMTP_URL = 'json';
    process.env.KUOTA_MAIL_FROM = 'Kuota <avisos@kuota.pro>';
    process.env.KUOTA_COMPLAINTS_EMAIL = 'kuota.contact@gmail.com';
    try {
      const made = await call('POST', '/complaints', {
        kind: 'RECLAMO', full_name: 'Rosa Smtp', doc_type: 'DNI', doc_number: '47891240', phone: '987654333',
        email: 'rosa@example.com', description: 'Probando el envío por SMTP del libro de reclamaciones.'
      });
      assert.equal(made.status, 201);
      assert.equal(made.body.email_sent, true);
      assert.equal(testOutbox.length, 2);
      assert.ok(testOutbox.every((m) => m.from === 'Kuota <avisos@kuota.pro>'));
      assert.deepEqual(testOutbox.flatMap((m) => m.to).sort(), ['kuota.contact@gmail.com', 'rosa@example.com']);
    } finally {
      delete process.env.KUOTA_SMTP_URL;
      delete process.env.KUOTA_MAIL_FROM;
      delete process.env.KUOTA_COMPLAINTS_EMAIL;
    }
  });
});

describe('PRD BUG-01 y BUG-02: acceso', () => {
  test('BUG-01: un proveedor crea su PIN con el id de sesión del celular, inicia sesión y ve su panel', async () => {
    resetRateLimits();
    const sid = 'ses_provider_' + Date.now(); // id inventado por la app: el servidor no lo conoce
    const conf = await call('POST', '/businesses/confirm', { session_id: sid, ruc: '20100190797', legal_rep_dni: '47891234', whatsapp: '984000111' });
    assert.equal(conf.status, 201);
    const pinStep = await call('POST', `/onboarding/sessions/${sid}/security-pin`, { pin: '739164' });
    assert.equal(pinStep.status, 200, 'antes respondía "Sesión de registro no encontrada"');
    assert.equal((await call('POST', `/onboarding/sessions/${sid}/security-pin`, { pin: '861953' })).status, 409, 'no se pisa el PIN');

    const login = await call('POST', '/auth/sessions', { pin: '739164', phone: '+51984000111', device_id: 'provider_device_000001' });
    assert.equal(login.status, 201);
    assert.equal(login.body.role, 'PROVIDER');
    assert.equal(login.body.provider_id, conf.body.provider_id);
    const mine = { 'X-Provider-Id': login.body.provider_id, 'X-Provider-Token': login.body.provider_token };
    const me = await call('GET', '/providers/me', undefined, mine);
    assert.equal(me.status, 200);
    assert.ok(!JSON.stringify(me.body).includes('20100190797'), 'RUC enmascarado');
    // Sesión única: el token del registro dejó de valer al iniciar sesión.
    const old = { 'X-Provider-Id': conf.body.provider_id, 'X-Provider-Token': conf.body.provider_token };
    assert.equal((await call('GET', '/providers/me', undefined, old)).status, 401);

    const bad = await call('POST', '/auth/sessions', { pin: '000111', phone: '+51984000111', device_id: 'provider_device_000001' });
    assert.equal(bad.status, 401);
    assert.equal((await call('POST', '/providers/logout', undefined, mine)).status, 204);
    assert.equal((await call('GET', '/providers/me', undefined, mine)).status, 401, 'tras cerrar sesión el token no sirve');
  });

  test('BUG-02: iniciar sesión en un equipo cierra la sesión y el token del otro', async () => {
    resetRateLimits();
    await register('930000020', '73000020', '739164');
    const A = 'single_session_device_A1';
    const B = 'single_session_device_B1';
    const la = await call('POST', '/auth/sessions', { pin: '739164', phone: '+51930000020', device_id: A });
    assert.equal(la.status, 201);
    const hdrA = { Authorization: `Bearer ${la.body.access_token}`, 'X-Device-Id': A };
    assert.equal((await call('GET', '/merchants/me/payments/limits', undefined, hdrA)).status, 200);

    const lb = await call('POST', '/auth/sessions', { pin: '739164', phone: '+51930000020', device_id: B });
    assert.equal(lb.status, 201);
    assert.equal((await call('GET', '/merchants/me/payments/limits', undefined, hdrA)).status, 401, 'la sesión del equipo A se cerró');
    process.env.KUOTA_REQUIRE_MERCHANT_TOKEN = '1';
    try {
      const idA = { 'X-Merchant-Id': lb.body.merchant_id, 'X-Merchant-Token': la.body.identity_token, 'X-Device-Id': A };
      assert.equal((await call('GET', '/auth/me', undefined, idA)).status, 401, 'el token de A ya no sirve');
      const idB = { 'X-Merchant-Id': lb.body.merchant_id, 'X-Merchant-Token': lb.body.identity_token, 'X-Device-Id': B };
      assert.equal((await call('GET', '/auth/me', undefined, idB)).status, 200);
    } finally {
      delete process.env.KUOTA_REQUIRE_MERCHANT_TOKEN;
    }

    // "Cerrar sesión en otros dispositivos" desde B no afecta a B.
    resetRateLimits();
    const hdrB = { Authorization: `Bearer ${lb.body.access_token}`, 'X-Device-Id': B };
    const closed = await call('POST', '/auth/sessions/others/close', undefined, hdrB);
    assert.equal(closed.status, 200);
    assert.equal((await call('GET', '/merchants/me/payments/limits', undefined, hdrB)).status, 200);
  });
});

describe('Proveedor: recuperar el PIN', () => {
  test('con el DNI del representante se restablece el PIN y se inicia sesión', async () => {
    resetRateLimits();
    const sid = 'ses_provider_rec_' + Date.now();
    const conf = await call('POST', '/businesses/confirm', { session_id: sid, ruc: '20100047218', legal_rep_dni: '47891777', whatsapp: '984000222' });
    assert.equal(conf.status, 201);
    assert.equal((await call('POST', `/onboarding/sessions/${sid}/security-pin`, { pin: '739164' })).status, 200);
    const bad = await call('POST', '/auth/pin/recover', { phone: '+51984000222', dni: '11111111', new_pin: '861953', device_id: 'provider_device_000002' });
    assert.equal(bad.status, 403);
    const ok = await call('POST', '/auth/pin/recover', { phone: '+51984000222', dni: '47891777', new_pin: '861953', device_id: 'provider_device_000002' });
    assert.equal(ok.status, 201);
    assert.equal(ok.body.role, 'PROVIDER');
    assert.equal((await call('POST', '/auth/sessions', { pin: '739164', phone: '+51984000222', device_id: 'provider_device_000002' })).status, 401, 'el PIN viejo ya no sirve');
    assert.equal((await call('POST', '/auth/sessions', { pin: '861953', phone: '+51984000222', device_id: 'provider_device_000002' })).status, 201);
  });
});

describe('Perfiles: RUC, paywall de Kuota Payments y perfil Provider', () => {
  test('con DNI no se vende ni se abre Provider; con RUC sí, tras el paywall, y el login ofrece los dos perfiles', async () => {
    resetRateLimits();
    await register('930000031', '73000031', '739164');
    const login = await call('POST', '/auth/sessions', { pin: '739164', phone: '+51930000031', device_id: 'profiles_device_00001' });
    assert.equal(login.status, 201);
    assert.deepEqual(login.body.profiles, ['EMPRENDEDOR'], 'un solo perfil entra directo');
    const hdr = { Authorization: `Bearer ${login.body.access_token}`, 'X-Device-Id': 'profiles_device_00001', 'X-Merchant-Id': login.body.merchant_id };

    const a0 = await call('GET', '/merchants/me/profile-access', undefined, hdr);
    assert.equal(a0.status, 200);
    assert.equal(a0.body.ruc_verified, false);
    assert.equal(a0.body.next_step, 'ADD_RUC');
    assert.equal(a0.body.can_have_provider, false);
    assert.equal((await call('POST', '/merchants/me/sales/activate', {}, hdr)).body.error.code, 'RUC_REQUIRED');
    assert.equal((await call('POST', '/merchants/me/provider-profile', {}, hdr)).body.error.code, 'RUC_REQUIRED');

    // RUC mal digitado: no se completa.
    assert.equal((await call('GET', '/merchants/me/ruc/lookup/123', undefined, hdr)).status, 422);
    const look = await call('GET', '/merchants/me/ruc/lookup/20392817263', undefined, hdr);
    assert.equal(look.status, 200);
    assert.ok(look.body.razon_social, 'muestra la razón social para confirmar');
    // RUC de empresa: no se verifica solo por existir en SUNAT; queda en revisión (KYB) hasta que operaciones apruebe.
    const added = await call('POST', '/merchants/me/ruc', { ruc: '20392817263' }, hdr);
    assert.equal(added.status, 202);
    assert.equal(added.body.review, 'PENDING');
    const pending = await call('GET', '/merchants/me/profile-access', undefined, hdr);
    assert.equal(pending.body.next_step, 'RUC_IN_REVIEW');
    assert.equal((await call('POST', '/merchants/me/sales/activate', { plan: 'BASIC' }, hdr)).body.error.code, 'RUC_REQUIRED', 'en revisión no se vende');
    const { secrets } = await import('../src/security/config.js');
    const adminH = { Authorization: `Bearer ${secrets.adminToken}` };
    const queue = await call('GET', '/internal/ruc-reviews', undefined, adminH);
    assert.ok(queue.body.data.some((r: Json) => r.id === login.body.merchant_id), 'aparece en la cola de revisión');
    assert.equal((await call('POST', `/internal/ruc-reviews/${login.body.merchant_id}/approve`, {}, adminH)).status, 200);

    const a1 = await call('GET', '/merchants/me/profile-access', undefined, hdr);
    assert.equal(a1.body.ruc_verified, true);
    assert.equal(a1.body.next_step, 'PAYWALL');
    assert.ok(!JSON.stringify(a1.body).includes('20392817263'), 'RUC enmascarado');

    // Otro teléfono no puede reclamar el mismo RUC.
    await register('930000032', '73000032', '739164');
    const login2 = await call('POST', '/auth/sessions', { pin: '739164', phone: '+51930000032', device_id: 'profiles_device_00002' });
    const hdr2 = { Authorization: `Bearer ${login2.body.access_token}`, 'X-Device-Id': 'profiles_device_00002', 'X-Merchant-Id': login2.body.merchant_id };
    assert.equal((await call('POST', '/merchants/me/ruc', { ruc: '20392817263' }, hdr2)).body.error.code, 'RUC_ALREADY_REGISTERED');

    assert.equal((await call('POST', '/merchants/me/sales/activate', { plan: 'BASIC' }, hdr)).status, 200);
    assert.equal((await call('GET', '/merchants/me/profile-access', undefined, hdr)).body.next_step, 'SELL');

    // Perfil Provider con el RUC y la clave del mismo usuario.
    const prov = await call('POST', '/merchants/me/provider-profile', {}, hdr);
    assert.equal(prov.status, 201);
    resetRateLimits();
    const dual = await call('POST', '/auth/sessions', { pin: '739164', phone: '+51930000031', device_id: 'profiles_device_00001' });
    assert.equal(dual.status, 201);
    assert.deepEqual(dual.body.profiles, ['EMPRENDEDOR', 'PROVIDER'], 'dos perfiles: el modal de elección');
    assert.equal(dual.body.provider.provider_id, prov.body.provider_id);
    const mine = { 'X-Provider-Id': dual.body.provider.provider_id, 'X-Provider-Token': dual.body.provider.provider_token };
    assert.equal((await call('GET', '/providers/me', undefined, mine)).status, 200);
  });

  test('un comercio nuevo no puede crear links hasta activar Kuota Payments', async () => {
    resetRateLimits();
    await register('930000033', '73000033', '739164');
    const login = await call('POST', '/auth/sessions', { pin: '739164', phone: '+51930000033', device_id: 'profiles_device_00003' });
    const hdr = { Authorization: `Bearer ${login.body.access_token}`, 'X-Device-Id': 'profiles_device_00003', 'Idempotency-Key': 'idem-profiles-0000001' };
    const r = await call('POST', '/payment-links', { amount_cents: 30000 }, hdr);
    assert.equal(r.status, 403);
    assert.equal(r.body.error.code, 'PAYMENTS_NOT_ACTIVE');
  });
});

describe('Identidad: DNI o carnet de extranjería', () => {
  test('un extranjero se registra con carnet de extranjería, se valida el formato y recupera el PIN con su carnet', async () => {
    resetRateLimits();
    const s = await call('POST', '/onboarding/sessions', { role: 'MERCHANT', device_id: DEVICE, accepted_terms_version: '2026.1', accepted_privacy_version: '2026.1' });
    const id = s.body.session_id as string;
    const base = { account_type: 'PERSONAL', full_name: 'MARIA EXTRANJERA QA', phone: '930000041', whatsapp_opt_in: true };
    // Formato inválido: un CE no es un DNI de 8 dígitos ni lleva símbolos raros.
    const bad = await call('POST', `/onboarding/sessions/${id}/merchant-identity`, { ...base, doc_type: 'CE', dni: '1234' });
    assert.equal(bad.status, 422);
    assert.equal(bad.body.error.code, 'CE_INVALID');
    // Sin doc_type sigue siendo DNI, y un CE en el campo de DNI se rechaza.
    assert.equal((await call('POST', `/onboarding/sessions/${id}/merchant-identity`, { ...base, dni: '001234567' })).body.error.code, 'DNI_INVALID');
    const ok = await call('POST', `/onboarding/sessions/${id}/merchant-identity`, { ...base, doc_type: 'CE', dni: '001-234-567' });
    assert.equal(ok.status, 201, JSON.stringify(ok.body));
    await call('PUT', `/onboarding/sessions/${id}/merchant-activity`, { category: 'FOOD', seniority_range: 'CONSOLIDATED', business_name: 'Bodega CE' });
    await call('PUT', `/onboarding/sessions/${id}/products`, { products: [{ name: 'Pan', price_cents: 50, is_frequent: true }] });
    const done = await call('POST', `/onboarding/sessions/${id}/complete`, { business_name: 'Bodega CE', phone: '930000041' });
    assert.equal(done.status, 201);
    assert.equal((await call('POST', `/onboarding/sessions/${id}/security-pin`, { pin: '739164' })).status, 200);

    // Recuperar el PIN con el carnet (con o sin guiones) funciona; con otro número no.
    resetRateLimits();
    const wrong = await call('POST', '/auth/pin/recover', { phone: '+51930000041', dni: '001234568', new_pin: '582941', device_id: 'ce_device_000000001' });
    assert.notEqual(wrong.status, 201);
    resetRateLimits();
    const rec = await call('POST', '/auth/pin/recover', { phone: '+51930000041', dni: '001234567', new_pin: '582941', device_id: 'ce_device_000000001' });
    assert.equal(rec.status, 201, JSON.stringify(rec.body));
  });
});
