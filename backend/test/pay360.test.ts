// Integración con 360pay contra un servidor simulado que responde como su API
// pública (ejemplos del OpenAPI de https://api.360pay.pe/docs/json/public).
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kuota-360-'));
process.env.KUOTA_DEV_SECRETS_FILE = path.join(tmp, 'secrets.json');
process.env.NODE_ENV = 'test';
process.env.KUOTA_360PAY_API_KEY = 'test-key';
process.env.KUOTA_360PAY_HOOK_ID = 'hook_test';

// ---- 360pay simulado
const calls: { method: string; url: string; key: string | undefined; body: any }[] = [];
const mock = http.createServer((req, res) => {
  let raw = '';
  req.on('data', (c) => (raw += c));
  req.on('end', () => {
    const body = raw ? JSON.parse(raw) : null;
    calls.push({ method: req.method!, url: req.url!, key: req.headers['x-api-key'] as string | undefined, body });
    const send = (status: number, json: unknown) => {
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(json));
    };
    if (req.headers['x-api-key'] !== 'test-key') return send(401, { success: false, message: 'Unauthorized' });
    if (req.method === 'POST' && req.url === '/v1/customers') {
      return send(201, { success: true, data: { _id: 'cus_' + crypto.randomBytes(6).toString('hex'), name: body.name, coupon_code: body.coupon_code } });
    }
    if (req.method === 'POST' && req.url === '/v1/coupons') {
      if (body.amount === 44.44) return send(400, { success: false, message: 'amount invalido' });
      return send(201, {
        success: true,
        data: { _id: 'cpn' + crypto.randomBytes(8).toString('hex'), customer_id: body.customer_id, coupon_code: 'KTA0001-0001', external_ref: body.external_ref, amount: body.amount, status: 'active' },
        message: 'Coupon created successfully'
      });
    }
    if (req.method === 'PUT' && /^\/v1\/coupons\/[^/]+\/annul$/.test(req.url!)) return send(200, { success: true, data: { status: 'annulled' } });
    send(404, { success: false, message: 'not found' });
  });
});
await new Promise<void>((r) => mock.listen(0, '127.0.0.1', () => r()));
process.env.KUOTA_360PAY_BASE_URL = `http://127.0.0.1:${(mock.address() as AddressInfo).port}/v1`;

const { useTestDatabase } = await import('./helpers.js');
const dropTestDatabase = await useTestDatabase();
const { createApp } = await import('../src/app.js');
const { db, closeDatabases } = await import('../src/db/database.js');
const { signWebhookBody } = await import('../src/security/webhook.js');
const { DEMO_MERCHANT_PIN } = await import('../src/security/schema.js');

let base = '';
let server: http.Server;
before(async () => {
  const app = await createApp();
  await new Promise<void>((r) => {
    server = app.listen(0, () => r());
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1`;
});
after(async () => {
  server?.close();
  mock.close();
  await closeDatabases();
  await dropTestDatabase();
  fs.rmSync(tmp, { recursive: true, force: true });
});

async function call(method: string, url: string, body?: unknown, headers: Record<string, string> = {}) {
  const res = await fetch(`${base}${url}`, { method, headers: { 'Content-Type': 'application/json', ...headers }, body: typeof body === 'string' ? body : body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  return { status: res.status, body: (text ? JSON.parse(text) : {}) as Record<string, any> };
}

const device = crypto.randomBytes(12).toString('hex');
let auth: Record<string, string>;
async function issue(amount: number) {
  const created = await call('POST', '/payment-links', { amount_cents: amount, concept: 'Polos' }, { ...auth, 'Idempotency-Key': crypto.randomBytes(12).toString('hex') });
  return call('POST', `/payment-links/${created.body.id}/issue`, undefined, auth);
}

describe('360pay: cupones y webhook PAYMENT_PAID', () => {
  before(async () => {
    const s = await call('POST', '/auth/sessions', { pin: DEMO_MERCHANT_PIN, device_id: device });
    auth = { Authorization: `Bearer ${s.body.access_token}`, 'X-Device-Id': device };
  });

  test('emitir un link crea el cliente y el cupón en 360pay (monto en soles)', async () => {
    const r = await issue(2550);
    assert.equal(r.status, 200);
    assert.equal(r.body.payment_code, 'KTA0001-0001');
    const coupon = calls.find((c) => c.url === '/v1/coupons')!;
    assert.equal(coupon.key, 'test-key');
    assert.equal(coupon.body.amount, 25.5);
    assert.equal(coupon.body.external_ref, r.body.id);
    assert.ok(calls.some((c) => c.url === '/v1/customers'));
  });

  test('si 360pay rechaza el cupón, el link no se activa', async () => {
    const r = await issue(4444); // el simulado rechaza S/ 44.44
    assert.equal(r.status, 502);
    assert.equal(r.body.error.code, 'PAY360_UNAVAILABLE');
  });

  test('webhook real: array firmado con timestamp ISO acredita el cobro; reintento sin efecto', async () => {
    const r = await issue(3000);
    const link = await db.get<{ pay360_coupon_id: string }>('SELECT pay360_coupon_id FROM payment_links WHERE id = ?', r.body.id);
    const items = [
      { event: 'ticket.paid', _id: link!.pay360_coupon_id, external_ref: r.body.id, payment_reference: 'KTA0001-0001', amount: 30, status: 'paid', paid_at: new Date().toISOString(), operation_number: 'OP-1', bank_tx_id: 'BCP' }
    ];
    const raw = JSON.stringify(items);
    const ts = new Date().toISOString();
    const headers = { 'X-360Pay-Signature': signWebhookBody(raw, ts), 'X-360Pay-Timestamp': ts, 'X-360Pay-Event-Id': 'evt_real_0001', 'X-360Pay-Hook-Id': 'hook_test' };
    const first = await call('POST', '/webhooks/360pay', raw, headers);
    assert.equal(first.status, 200);
    assert.equal(first.body.results[0].status, 'PROCESSED');
    const again = await call('POST', '/webhooks/360pay', raw, headers);
    assert.equal(again.body.duplicate, true);
    const pays = await db.get<{ n: number }>('SELECT COUNT(*) AS n FROM payments WHERE payment_link_id = ?', r.body.id);
    assert.equal(pays!.n, 1);

    // 360pay corrige el código bancario con otro event id: no es un segundo cobro ni una excepción.
    const ts2 = new Date().toISOString();
    const fix = await call('POST', '/webhooks/360pay', raw, { ...headers, 'X-360Pay-Timestamp': ts2, 'X-360Pay-Signature': signWebhookBody(raw, ts2), 'X-360Pay-Event-Id': 'evt_real_0002' });
    assert.equal(fix.body.results[0].status, 'IGNORED');
  });

  test('hook desconocido o firma con timestamp viejo: 401', async () => {
    const raw = '[]';
    const ts = new Date().toISOString();
    const other = await call('POST', '/webhooks/360pay', raw, { 'X-360Pay-Signature': signWebhookBody(raw, ts), 'X-360Pay-Timestamp': ts, 'X-360Pay-Event-Id': 'evt_x_0001', 'X-360Pay-Hook-Id': 'otro' });
    assert.equal(other.status, 401);
    const old = new Date(Date.now() - 10 * 60_000).toISOString();
    const stale = await call('POST', '/webhooks/360pay', raw, { 'X-360Pay-Signature': signWebhookBody(raw, old), 'X-360Pay-Timestamp': old, 'X-360Pay-Event-Id': 'evt_x_0002', 'X-360Pay-Hook-Id': 'hook_test' });
    assert.equal(stale.status, 401);
  });

  test('cancelar el link anula el cupón en 360pay', async () => {
    const r = await issue(1200);
    const c = await call('POST', `/payment-links/${r.body.id}/cancel`, undefined, auth);
    assert.equal(c.body.status, 'CANCELLED');
    assert.ok(calls.some((x) => x.method === 'PUT' && x.url.endsWith('/annul')));
  });
});
