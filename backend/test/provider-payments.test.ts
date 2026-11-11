// Kuota Payments desde el perfil Provider: misma función de venta que el Emprendedor,
// sin abrir una puerta al robo de cuentas por coincidencia de teléfono.
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kuota-provpay-'));
process.env.KUOTA_DEV_SECRETS_FILE = path.join(tmp, 'secrets.json');
process.env.NODE_ENV = 'test';

const { useTestDatabase } = await import('./helpers.js');
const dropTestDatabase = await useTestDatabase();
const { createApp } = await import('../src/app.js');
const { closeDatabases } = await import('../src/db/database.js');
const { resetRateLimits } = await import('../src/security/guards.js');
const { secrets } = await import('../src/security/config.js');

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

const PIN = '739164';
const admin = { Authorization: `Bearer ${secrets.adminToken}` };

async function providerOnly(ruc: string, phone: string) {
  const sid = 'ses_provpay_' + crypto.randomBytes(4).toString('hex');
  const conf = await call('POST', '/businesses/confirm', { session_id: sid, ruc, legal_rep_dni: '47891234', whatsapp: phone });
  assert.equal(conf.status, 201, JSON.stringify(conf.body));
  assert.equal((await call('POST', `/onboarding/sessions/${sid}/security-pin`, { pin: PIN })).status, 200);
  const login = await call('POST', '/auth/sessions', { pin: PIN, phone: `+51${phone}`, device_id: 'provpay_device_00001' });
  assert.equal(login.status, 201);
  assert.equal(login.body.role, 'PROVIDER');
  return { 'X-Provider-Id': login.body.provider_id, 'X-Provider-Token': login.body.provider_token };
}

describe('Kuota Payments en el perfil Provider', () => {
  test('un proveedor sin cuenta Emprendedor abre Kuota Payments con su PIN y vende igual', async () => {
    resetRateLimits();
    const prov = await providerOnly('20100190797', '984000222');
    const device = 'provpay_device_00001';

    // Sin token de proveedor no hay nada.
    assert.equal((await call('POST', '/providers/payments/session', { pin: PIN, device_id: device })).status, 401);
    // PIN incorrecto: rechazado.
    const bad = await call('POST', '/providers/payments/session', { pin: '000111', device_id: device }, prov);
    assert.equal(bad.status, 401);
    assert.equal(bad.body.error.code, 'PIN_INVALID');

    const s = await call('POST', '/providers/payments/session', { pin: PIN, device_id: device }, prov);
    assert.equal(s.status, 201, JSON.stringify(s.body));
    assert.ok(s.body.merchant_id && s.body.access_token && s.body.identity_token);
    // Repetirlo usa la MISMA cuenta de cobros (no crea otra).
    resetRateLimits();
    const again = await call('POST', '/providers/payments/session', { pin: PIN, device_id: device }, prov);
    assert.equal(again.body.merchant_id, s.body.merchant_id);

    const hdr = { Authorization: `Bearer ${again.body.access_token}`, 'X-Device-Id': device, 'X-Merchant-Id': again.body.merchant_id };
    // KYC del proveedor aún en revisión: el RUC no se verifica solo.
    const access = await call('GET', '/merchants/me/profile-access', undefined, hdr);
    assert.equal(access.body.next_step, 'RUC_IN_REVIEW');
    assert.equal((await call('POST', `/internal/ruc-reviews/${again.body.merchant_id}/approve`, {}, admin)).status, 200);

    // Mismo flujo que el Emprendedor: paywall y luego vender.
    assert.equal((await call('GET', '/merchants/me/profile-access', undefined, hdr)).body.next_step, 'PAYWALL');
    assert.equal((await call('POST', '/merchants/me/sales/activate', { plan: 'BASIC' }, hdr)).status, 200);
    const link = await call('POST', '/payment-links', { amount_cents: 30000, concept: 'Rollo de tela' }, { ...hdr, 'Idempotency-Key': crypto.randomBytes(12).toString('hex') });
    assert.equal(link.status, 201, JSON.stringify(link.body));
    assert.equal(link.body.fee_cents, 531, '1 % con mínimo S/ 4.50 + IGV');

    // Y ahora el login con teléfono + PIN abre los dos perfiles.
    resetRateLimits();
    const both = await call('POST', '/auth/sessions', { pin: PIN, phone: '+51984000222', device_id: device });
    assert.equal(both.status, 201);
    assert.deepEqual(both.body.profiles, ['EMPRENDEDOR', 'PROVIDER']);
    assert.equal(both.body.merchant_id, s.body.merchant_id);

    // Abrir la sesión de cobros con el PIN (candado de la app) rota el token del Provider: el anterior deja de
    // valer y el cliente tiene que guardar el nuevo (si no, al cambiar a Provider se cierra toda la sesión).
    resetRateLimits();
    const merchantHdr = { 'X-Merchant-Id': both.body.merchant_id, 'X-Merchant-Token': both.body.identity_token, 'X-Device-Id': device };
    const reopened = await call('POST', '/auth/sessions', { pin: PIN, device_id: device }, merchantHdr);
    assert.equal(reopened.status, 201, JSON.stringify(reopened.body));
    const fresh = reopened.body.provider;
    assert.ok(fresh?.provider_token && fresh.provider_token !== both.body.provider.provider_token, 'devuelve un token de Provider nuevo');
    const stale = { 'X-Provider-Id': both.body.provider.provider_id, 'X-Provider-Token': both.body.provider.provider_token };
    assert.equal((await call('GET', '/providers/me', undefined, stale)).status, 401, 'el token anterior ya no vale');
    const current = { 'X-Provider-Id': fresh.provider_id, 'X-Provider-Token': fresh.provider_token };
    assert.equal((await call('GET', '/providers/me', undefined, current)).status, 200);
  });

  test('no se apropia de una cuenta Emprendedor ajena declarando su teléfono como WhatsApp', async () => {
    resetRateLimits();
    // Víctima: Emprendedor con el celular 930000099.
    const sid = (await call('POST', '/onboarding/sessions', { role: 'MERCHANT', device_id: 'victim_device_00001', accepted_terms_version: '2026.1', accepted_privacy_version: '2026.1' })).body.session_id;
    await call('POST', `/onboarding/sessions/${sid}/merchant-identity`, { account_type: 'PERSONAL', dni: '73000099', full_name: 'VICTIMA PRUEBA', phone: '930000099', whatsapp_opt_in: true });
    await call('PUT', `/onboarding/sessions/${sid}/merchant-activity`, { category: 'FOOD', seniority_range: 'CONSOLIDATED', business_name: 'Bodega Víctima' });
    await call('PUT', `/onboarding/sessions/${sid}/products`, { products: [{ name: 'Pan', price_cents: 50, is_frequent: true }] });
    assert.equal((await call('POST', `/onboarding/sessions/${sid}/complete`, { business_name: 'Bodega Víctima', phone: '930000099' })).status, 201);
    assert.equal((await call('POST', `/onboarding/sessions/${sid}/security-pin`, { pin: '582947' })).status, 200);

    // Atacante: proveedor que declara el celular de la víctima, con SU propio PIN.
    const sidA = 'ses_attacker_' + crypto.randomBytes(4).toString('hex');
    const conf = await call('POST', '/businesses/confirm', { session_id: sidA, ruc: '20100047218', legal_rep_dni: '47891234', whatsapp: '930000099' });
    if (conf.status !== 201) return; // el registro ya lo impide: mejor aún
    await call('POST', `/onboarding/sessions/${sidA}/security-pin`, { pin: PIN });
    const prov = { 'X-Provider-Id': conf.body.provider_id, 'X-Provider-Token': conf.body.provider_token };
    const r = await call('POST', '/providers/payments/session', { pin: PIN, device_id: 'attacker_device_0001' }, prov);
    assert.equal(r.status, 409);
    assert.equal(r.body.error.code, 'EMPRENDEDOR_EXISTS');
    assert.ok(!r.body.access_token, 'no recibe sesión de la víctima');
  });
});
