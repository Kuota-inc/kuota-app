// Cobros a contactos: "¿este celular ya tiene cuenta Kuota?" sin exponer datos de más ni permitir barridos.
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kuota-contacts-'));
process.env.KUOTA_DEV_SECRETS_FILE = path.join(tmp, 'secrets.json');
process.env.NODE_ENV = 'test';
process.env.KUOTA_REQUIRE_MERCHANT_TOKEN = '1'; // como en producción: el token de identidad es obligatorio

const { useTestDatabase } = await import('./helpers.js');
const dropTestDatabase = await useTestDatabase();
const { createApp } = await import('../src/app.js');
const { closeDatabases } = await import('../src/db/database.js');
const { resetRateLimits } = await import('../src/security/guards.js');
const { phone9, maskedName } = await import('../src/routes/merchant.routes.js');

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

const PIN = '582947';

/** Emprendedor completo con celular y PIN; devuelve las cabeceras de su sesión de dispositivo. */
async function merchant(dni: string, fullName: string, phone: string, businessName: string) {
  const device = 'contacts_dev_' + crypto.randomBytes(4).toString('hex');
  const sid = (await call('POST', '/onboarding/sessions', { role: 'MERCHANT', device_id: device, accepted_terms_version: '2026.1', accepted_privacy_version: '2026.1' })).body.session_id;
  await call('POST', `/onboarding/sessions/${sid}/merchant-identity`, { account_type: 'PERSONAL', dni, full_name: fullName, phone, whatsapp_opt_in: true });
  await call('PUT', `/onboarding/sessions/${sid}/merchant-activity`, { category: 'FOOD', seniority_range: 'CONSOLIDATED', business_name: businessName });
  await call('PUT', `/onboarding/sessions/${sid}/products`, { products: [{ name: 'Pan', price_cents: 50, is_frequent: true }] });
  assert.equal((await call('POST', `/onboarding/sessions/${sid}/complete`, { business_name: businessName, phone })).status, 201);
  assert.equal((await call('POST', `/onboarding/sessions/${sid}/security-pin`, { pin: PIN })).status, 200);
  const login = await call('POST', '/auth/sessions', { pin: PIN, phone: `+51${phone}`, device_id: device });
  assert.equal(login.status, 201, JSON.stringify(login.body));
  return { 'X-Merchant-Id': login.body.merchant_id, 'X-Merchant-Token': login.body.identity_token, 'X-Device-Id': device } as Record<string, string>;
}

describe('Validación de contactos', () => {
  test('normaliza el celular y abrevia el nombre', () => {
    assert.equal(phone9('+51 984 123 456'), '984123456');
    assert.equal(phone9('984-123-456'), '984123456');
    assert.equal(phone9('51984123456'), '984123456');
    assert.equal(phone9('884123456'), null, 'los celulares empiezan con 9');
    assert.equal(phone9('98412345'), null);
    assert.equal(phone9(undefined), null);
    assert.equal(maskedName('HUAMANI LOVATON JOSUE HUMBERTO'), 'Huamani L*** J***');
    assert.equal(maskedName('  '), null);
  });

  test('dice si el celular ya tiene Kuota, sin dar más datos de los necesarios', async () => {
    resetRateLimits();
    const me = await merchant('73100001', 'PEREZ GOMEZ MARIA ELENA', '930100001', 'Bodega María');
    await merchant('73100002', 'QUISPE MAMANI LUIS ALBERTO', '930100002', '');

    const hit = await call('POST', '/merchants/me/contacts/lookup', { phone: '+51 930 100 002' }, me);
    assert.equal(hit.status, 200, JSON.stringify(hit.body));
    assert.equal(hit.body.registered, true);
    assert.equal(hit.body.is_self, false);
    assert.equal(hit.body.kind, 'EMPRENDEDOR');
    assert.equal(hit.body.phone_masked, '+51 ••• ••• 002');
    assert.ok(!JSON.stringify(hit.body).includes('QUISPE MAMANI'), 'no devuelve el nombre completo');
    assert.ok(!JSON.stringify(hit.body).includes('930100002'), 'no devuelve el celular completo');

    const miss = await call('POST', '/merchants/me/contacts/lookup', { phone: '930999999' }, me);
    assert.equal(miss.status, 200);
    assert.deepEqual([miss.body.registered, miss.body.display_name, miss.body.kind], [false, null, null]);

    const self = await call('POST', '/merchants/me/contacts/lookup', { phone: '930100001' }, me);
    assert.equal(self.body.registered, true);
    assert.equal(self.body.is_self, true, 'no se puede cobrar a uno mismo');

    const bad = await call('POST', '/merchants/me/contacts/lookup', { phone: '12345' }, me);
    assert.equal(bad.status, 422);
    assert.equal(bad.body.error.code, 'PHONE_INVALID');
  });

  test('con un token falso no responde (no sirve para averiguar quién usa Kuota)', async () => {
    resetRateLimits();
    const me = await merchant('73100003', 'RAMOS DIAZ ANA', '930100003', 'Tienda Ana');
    const r = await call('POST', '/merchants/me/contacts/lookup', { phone: '930100001' }, { ...me, 'X-Merchant-Token': 'A'.repeat(43) });
    assert.equal(r.status, 401);
    assert.equal(r.body.registered, undefined);
  });

  test('limita las consultas por minuto', async () => {
    resetRateLimits();
    const me = await merchant('73100004', 'SOTO RIOS PEDRO', '930100004', 'Bazar Pedro');
    let last = 0;
    for (let i = 0; i < 17; i++) last = (await call('POST', '/merchants/me/contacts/lookup', { phone: `9301${String(i).padStart(5, '0')}` }, me)).status;
    assert.equal(last, 429);
  });
});

describe('Integridad de los datos del Emprendedor', () => {
  test('el comprobante nunca inventa un monto', async () => {
    resetRateLimits();
    const me = await merchant('73100005', 'LUNA VEGA CARLOS', '930100005', 'Ferretería Luna');
    const none = await call('POST', '/merchants/me/sales/ocr', {}, me);
    assert.equal(none.status, 422);
    assert.equal(none.body.error.code, 'AMOUNT_REQUIRED');
    const zero = await call('POST', '/merchants/me/sales/ocr', { amount_cents: 0 }, me);
    assert.equal(zero.status, 422);
    const ok = await call('POST', '/merchants/me/sales/ocr', { amount_cents: 12550, source: 'YAPE' }, me);
    assert.equal(ok.status, 200, JSON.stringify(ok.body));
    assert.equal(ok.body.amount_cents, 12550);
    assert.equal(ok.body.verified, false);
    assert.equal(ok.body.operation_ref, null, 'sin referencia real no se inventa una');
  });

  test('todas las pantallas muestran el mismo score', async () => {
    resetRateLimits();
    const me = await merchant('73100006', 'TORRES PAZ ROSA', '930100006', 'Bodega Rosa');
    const a = (await call('GET', '/credit/score/me', undefined, me)).body;
    const b = (await call('GET', '/merchants/me/score', undefined, me)).body;
    const c = (await call('GET', '/merchants/me/kuotear', undefined, me)).body;
    assert.ok(Number.isInteger(a.total) && a.total > 0);
    assert.equal(b.score, a.total);
    assert.equal(c.score.value, a.total);
    assert.equal(c.score.label, a.label);
  });

  test('el saludo del Home sigue la hora de Lima', async () => {
    resetRateLimits();
    const me = await merchant('73100007', 'CRUZ LEON JUAN', '930100007', 'Tienda Juan');
    const h = (await call('GET', '/merchants/me/home', undefined, me)).body;
    const hour = Number(new Intl.DateTimeFormat('en-US', { hour: 'numeric', hourCycle: 'h23', timeZone: 'America/Lima' }).format(new Date())) % 24;
    assert.equal(h.greeting_prefix, hour < 12 ? 'Buenos días' : hour < 19 ? 'Buenas tardes' : 'Buenas noches');
  });
});

describe('Foto de perfil', () => {
  const jpeg = (size = 900, extra?: Buffer) =>
    Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), extra ?? Buffer.alloc(0), Buffer.alloc(size, 7), Buffer.from([0xff, 0xd9])]);
  const dataUrl = (b: Buffer, mime = 'jpeg') => `data:image/${mime};base64,${b.toString('base64')}`;
  const abs = (u: string) => base.replace('/api/v1', '') + u;

  test('se guarda, la ve quien busca o paga, y se puede cambiar y quitar', async () => {
    resetRateLimits();
    const me = await merchant('73100008', 'DIAZ ROJAS ELENA', '930100008', 'Panadería Elena');
    const viewer = await merchant('73100009', 'GARCIA SOTO MARIO', '930100009', 'Bazar Mario');
    const photo = jpeg();

    const put = await call('PUT', '/merchants/me/avatar', { image: dataUrl(photo) }, me);
    assert.equal(put.status, 200, JSON.stringify(put.body));
    assert.match(put.body.avatar_url, /^\/api\/v1\/public\/avatar\/[a-f0-9]{32}$/);

    // Pública (sin sesión), con la imagen exacta y caché larga porque la URL cambia con cada foto.
    const img = await fetch(abs(put.body.avatar_url));
    assert.equal(img.status, 200);
    assert.equal(img.headers.get('content-type'), 'image/jpeg');
    assert.match(img.headers.get('cache-control') ?? '', /immutable/);
    assert.deepEqual(Buffer.from(await img.arrayBuffer()), photo);

    // La ve el dueño en su perfil y quien lo busca por celular.
    const summary = await call('GET', '/merchants/me/welcome-summary', undefined, me);
    assert.equal(summary.body.business.avatar_url, put.body.avatar_url);
    const found = await call('POST', '/merchants/me/contacts/lookup', { phone: '930100008' }, viewer);
    assert.equal(found.body.avatar_url, put.body.avatar_url);

    // Cambiarla invalida la URL anterior; quitarla la deja sin foto.
    const put2 = await call('PUT', '/merchants/me/avatar', { image: dataUrl(jpeg(1200)) }, me);
    assert.notEqual(put2.body.avatar_url, put.body.avatar_url);
    assert.equal((await fetch(abs(put.body.avatar_url))).status, 404);
    assert.equal((await fetch(abs(put2.body.avatar_url))).status, 200);
    assert.equal((await call('DELETE', '/merchants/me/avatar', undefined, me)).body.avatar_url, null);
    assert.equal((await fetch(abs(put2.body.avatar_url))).status, 404);
    const none = await call('POST', '/merchants/me/contacts/lookup', { phone: '930100008' }, viewer);
    assert.equal(none.body.avatar_url, null);
  });

  test('rechaza archivos que no son una foto JPEG segura', async () => {
    resetRateLimits();
    const me = await merchant('73100010', 'VEGA LUNA PABLO', '930100010', 'Taller Pablo');
    const bad = async (image: unknown) => (await call('PUT', '/merchants/me/avatar', { image }, me)).status;
    assert.equal(await bad(dataUrl(jpeg(), 'png')), 422, 'PNG');
    assert.equal(await bad(dataUrl(jpeg(), 'svg+xml')), 422, 'SVG (puede traer scripts)');
    assert.equal(await bad('javascript:alert(1)'), 422);
    assert.equal(await bad(dataUrl(Buffer.alloc(900, 1))), 422, 'sin cabecera JPEG');
    assert.equal(await bad(dataUrl(jpeg(100))), 422, 'demasiado pequeña');
    assert.equal(await bad(dataUrl(jpeg(130_000))), 422, 'demasiado grande');
    assert.equal(await bad(dataUrl(jpeg(900, Buffer.from('Exif\0\0GPS')))), 422, 'con datos de ubicación (EXIF)');
    assert.equal(await bad(undefined), 422);
  });

  test('sin sesión válida no se puede cambiar la foto de otro; el token falso no sirve', async () => {
    resetRateLimits();
    const me = await merchant('73100011', 'PAZ RIOS ANA', '930100011', 'Tienda Ana P');
    const r = await call('PUT', '/merchants/me/avatar', { image: dataUrl(jpeg()) }, { ...me, 'X-Merchant-Token': 'A'.repeat(43) });
    assert.equal(r.status, 401);
    assert.equal((await fetch(abs('/api/v1/public/avatar/not-a-token'))).status, 404);
    assert.equal((await fetch(abs('/api/v1/public/avatar/' + 'a'.repeat(32)))).status, 404);
  });
});

describe('Identidad pública del comercio (lo que ve quien paga)', () => {
  test('incluye la foto solo si el comercio la puso', async () => {
    const { merchantPublicIdentity } = await import('../src/security/links.js');
    const base = { business_name: 'Panadería Elena', kyc_status: 'APPROVED', ruc: '20123456789', city: 'Lima' };
    assert.equal(merchantPublicIdentity(base).avatar_url, null);
    assert.equal(merchantPublicIdentity({ ...base, avatar_token: 'a'.repeat(32) }).avatar_url, `/api/v1/public/avatar/${'a'.repeat(32)}`);
  });
});
