// Pruebas de los controles de seguridad de Kuota Payments (node:test).
// Ejecutar: npm test  (usa una base y unos secretos temporales, no toca kuota.db)
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import type { AddressInfo } from 'node:net';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kuota-sec-'));
process.env.KUOTA_DEV_SECRETS_FILE = path.join(tmp, 'secrets.json');
process.env.NODE_ENV = 'test';

const { useTestDatabase } = await import('./helpers.js');
const dropTestDatabase = await useTestDatabase();
const { createApp } = await import('../src/app.js');
const { db, closeDatabases } = await import('../src/db/database.js');
const { secrets } = await import('../src/security/config.js');
const { hashPin } = await import('../src/security/crypto.js');
const { resetRateLimits } = await import('../src/security/guards.js');
const { signWebhookBody } = await import('../src/security/webhook.js');
const { signLink, publicCode } = await import('../src/security/links.js');
const { DEMO_MERCHANT_PIN } = await import('../src/security/schema.js');

const sqlTime = (d: Date) => d.toISOString().slice(0, 19).replace('T', ' ');

let base = '';
let server: ReturnType<ReturnType<typeof createApp>['listen']>;

before(async () => {
  const app = await createApp();
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve());
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1`;
  await createMerchant('mer_otro', '739164');
  await createMerchant('mer_lock', '739164');
  await createMerchant('mer_risk', '739164');
});

after(async () => {
  server?.close();
  await closeDatabases();
  await dropTestDatabase();
  fs.rmSync(tmp, { recursive: true, force: true });
});

// ---------------------------------------------------------------- helpers
type Json = Record<string, any>;

async function call(method: string, url: string, body?: unknown, headers: Record<string, string> = {}) {
  const res = await fetch(`${base}${url}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
    body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body)
  });
  const text = await res.text();
  return { status: res.status, body: (text ? JSON.parse(text) : {}) as Json, headers: res.headers };
}

const newDevice = () => crypto.randomBytes(12).toString('hex');
const idemKey = () => crypto.randomBytes(12).toString('hex');
const admin = { Authorization: `Bearer ${secrets.adminToken}` };

interface Session {
  merchantId: string;
  deviceId: string;
  headers: Record<string, string>;
}

// Dispositivo habitual de cada comercio (el primero no entra en enfriamiento).
const usualDevices = new Map<string, string>();
const usualDevice = (merchantId: string) => {
  if (!usualDevices.has(merchantId)) usualDevices.set(merchantId, newDevice());
  return usualDevices.get(merchantId)!;
};

async function login(merchantId = 'mer_carlos', pin = DEMO_MERCHANT_PIN, deviceId = usualDevice(merchantId)): Promise<Session> {
  resetRateLimits();
  const r = await call('POST', '/auth/sessions', { pin, device_id: deviceId, device_label: 'Prueba' }, { 'X-Merchant-Id': merchantId });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  return { merchantId, deviceId, headers: { Authorization: `Bearer ${r.body.access_token}`, 'X-Device-Id': deviceId } };
}

async function createMerchant(id: string, pin: string, kyc = 'APPROVED') {
  await db.run(
    "INSERT INTO users (id, phone, role, status, created_at) VALUES (?, ?, 'MERCHANT', 'ACTIVE', ?)",
    `usr_${id}`,
    `+519${crypto.randomInt(10_000_000, 99_999_999)}`,
    sqlTime(new Date(Date.now() - 60 * 86_400_000))
  );
  await db.prepare('INSERT INTO merchant_profiles (id, user_id, business_name, ruc, kyc_status) VALUES (?, ?, ?, ?, ?)').run(id, `usr_${id}`, `Comercio ${id}`, '20123456789', kyc);
  await db.prepare('INSERT INTO merchant_credentials (merchant_id, pin_hash, pin_updated_at) VALUES (?, ?, ?)').run(id, hashPin(pin), new Date().toISOString());
  await db.prepare('INSERT INTO credit_scores (merchant_id, score, level) VALUES (?, 600, 1)').run(id);
}

async function createLink(s: Session, amount: number, extra: Record<string, string> = {}) {
  return call('POST', '/payment-links', { amount_cents: amount, concept: 'Prueba' }, { ...s.headers, 'Idempotency-Key': idemKey(), ...extra });
}

async function createActiveLink(s: Session, amount: number) {
  const created = await createLink(s, amount);
  assert.equal(created.status, 201, JSON.stringify(created.body));
  const issued = await call('POST', `/payment-links/${created.body.id}/issue`, undefined, s.headers);
  assert.equal(issued.status, 200, JSON.stringify(issued.body));
  return issued.body as Json & { id: string; code: string };
}

function webhook(payload: unknown, opts: { eventId?: string; ts?: number; signature?: string } = {}) {
  const raw = JSON.stringify(payload);
  const ts = opts.ts ?? Math.floor(Date.now() / 1000);
  return call('POST', '/webhooks/360pay', raw, {
    'X-Signature-256': opts.signature ?? signWebhookBody(raw, ts),
    'X-360pay-Timestamp': String(ts),
    'X-360pay-Event-ID': opts.eventId ?? `evt_${crypto.randomBytes(8).toString('hex')}`
  });
}

const captured = (code: string, amount: number, gatewayRef = `GW-${crypto.randomBytes(6).toString('hex')}`) => ({
  type: 'payment_captured',
  payment: { reference: code, amount_minor: amount, currency: 'PEN', method: 'YAPE', gateway_ref: gatewayRef }
});


// ------------------------------------------------------------------ pruebas
describe('PIN y sesión', () => {
  test('el PIN se guarda como hash, nunca en texto plano', async () => {
    const row = await db.prepare("SELECT pin_hash FROM merchant_credentials WHERE merchant_id = 'mer_carlos'").get() as { pin_hash: string };
    assert.match(row.pin_hash, /^scrypt\$/);
    assert.ok(!row.pin_hash.includes(DEMO_MERCHANT_PIN));
  });

  test('las rutas del comercio exigen sesión', async () => {
    const r = await call('POST', '/payment-links', { amount_cents: 1000 }, { 'Idempotency-Key': idemKey() });
    assert.equal(r.status, 401);
    assert.equal(r.body.error.code, 'SESSION_REQUIRED');
  });

  test('PIN incorrecto descuenta intentos y al quinto bloquea', async () => {
    const device = newDevice();
    for (let i = 1; i <= 4; i++) {
      resetRateLimits();
      const r = await call('POST', '/auth/sessions', { pin: '000001', device_id: device }, { 'X-Merchant-Id': 'mer_lock' });
      assert.equal(r.status, 401);
      assert.equal(r.body.error.attempts_left, 5 - i);
    }
    resetRateLimits();
    const locked = await call('POST', '/auth/sessions', { pin: '000001', device_id: device }, { 'X-Merchant-Id': 'mer_lock' });
    assert.equal(locked.status, 423);
    resetRateLimits();
    const evenRight = await call('POST', '/auth/sessions', { pin: '739164', device_id: device }, { 'X-Merchant-Id': 'mer_lock' });
    assert.equal(evenRight.status, 423, 'durante el bloqueo ni el PIN correcto entra');
  });

  test('la sesión queda ligada al dispositivo que la abrió', async () => {
    const s = await login();
    const r = await call('GET', '/payment-links', undefined, { ...s.headers, 'X-Device-Id': newDevice() });
    assert.equal(r.status, 401);
    assert.equal(r.body.error.code, 'DEVICE_MISMATCH');
  });

  test('un token alterado se rechaza', async () => {
    const s = await login();
    const forged = s.headers.Authorization.slice(0, -2) + (s.headers.Authorization.endsWith('A') ? 'BB' : 'AA');
    const r = await call('GET', '/payment-links', undefined, { ...s.headers, Authorization: forged });
    assert.equal(r.status, 401);
  });
});

describe('Links de cobro', () => {
  test('monto inválido (decimal, negativo o menor a S/ 1) se rechaza', async () => {
    const s = await login();
    for (const amount of [10.5, -500, 50]) {
      const r = await createLink(s, amount);
      assert.equal(r.status, 422, `monto ${amount}`);
    }
  });

  test('exige Idempotency-Key y un reintento no duplica el link', async () => {
    const s = await login();
    const missing = await call('POST', '/payment-links', { amount_cents: 2000 }, s.headers);
    assert.equal(missing.status, 400);
    const key = idemKey();
    const a = await call('POST', '/payment-links', { amount_cents: 2000 }, { ...s.headers, 'Idempotency-Key': key });
    const b = await call('POST', '/payment-links', { amount_cents: 2000 }, { ...s.headers, 'Idempotency-Key': key });
    assert.equal(a.status, 201);
    assert.equal(b.body.id, a.body.id);
    assert.equal(b.headers.get('idempotent-replayed'), 'true');
    const other = await call('POST', '/payment-links', { amount_cents: 2500 }, { ...s.headers, 'Idempotency-Key': key });
    assert.equal(other.status, 409);
  });

  test('token de 128 bits y URL con MAC; un código inventado da 404', async () => {
    const s = await login();
    const link = await createActiveLink(s, 3000);
    const token = (await db.prepare('SELECT token FROM payment_links WHERE id = ?').get(link.id) as { token: string }).token;
    assert.equal(Buffer.from(token, 'base64url').length, 16);
    const ok = await call('GET', `/payment-links/public/${link.code}`);
    assert.equal(ok.status, 200);
    assert.equal(ok.body.amount_cents, 3000);
    assert.equal(ok.body.merchant.name, 'Confecciones Carlos & Hnos.');
    assert.ok(!('token' in ok.body) && !('sig' in ok.body));
    const forged = await call('GET', `/payment-links/public/${token}.AAAAAAAAAAAA`);
    assert.equal(forged.status, 404);
  });

  test('otro comercio no puede ver, emitir ni cancelar el link (BOLA)', async () => {
    const owner = await login();
    const created = await createLink(owner, 4000);
    const intruder = await login('mer_otro', '739164');
    for (const [method, url] of [
      ['GET', `/payment-links/${created.body.id}`],
      ['POST', `/payment-links/${created.body.id}/issue`],
      ['POST', `/payment-links/${created.body.id}/cancel`],
      ['PATCH', `/payment-links/${created.body.id}/customer`]
    ]) {
      const r = await call(method, url, method === 'PATCH' ? { customer_name: 'x' } : undefined, intruder.headers);
      assert.equal(r.status, 404, `${method} ${url}`);
    }
  });

  test('monto, titular y vencimiento son inmutables en la base', async () => {
    const id = (await db.get<{ id: string }>("SELECT id FROM payment_links WHERE merchant_id = 'mer_carlos' LIMIT 1"))!.id;
    await assert.rejects(db.run('UPDATE payment_links SET amount_cents = 1 WHERE id = ?', id), /inmutables/);
    await assert.rejects(db.run("UPDATE payment_links SET merchant_id = 'mer_otro' WHERE id = ?", id), /inmutables/);
  });

  test('un link vencido no se muestra ni se cobra', async () => {
    const fields = {
      id: 'lnk_vencido01',
      merchant_id: 'mer_carlos',
      token: crypto.randomBytes(16).toString('base64url'),
      amount_cents: 1500,
      fee_cents: 15,
      net_cents: 1485,
      currency: 'PEN',
      expires_at: new Date(Date.now() - 60_000).toISOString()
    };
    await db.prepare(`
      INSERT INTO payment_links (id, merchant_id, token, amount_cents, fee_cents, net_cents, fee_bps, currency, status, expires_at, sig)
      VALUES (@id, @merchant_id, @token, @amount_cents, @fee_cents, @net_cents, 100, @currency, 'ACTIVE', @expires_at, @sig)
    `).run({ ...fields, sig: signLink(fields) });
    const view = await call('GET', `/payment-links/public/${publicCode(fields.token)}`);
    assert.equal(view.status, 410);
    const pay = await webhook(captured(publicCode(fields.token), 1500));
    assert.equal(pay.body.status, 'REJECTED');
    assert.equal(pay.body.reason, 'LINK_EXPIRED');
  });

  test('el endpoint de pago sin firma está retirado', async () => {
    const r = await call('POST', '/payment-links/webhook', { token: 'x' });
    assert.equal(r.status, 410);
  });
});

describe('Límites y confirmación con PIN', () => {
  test('nivel básico: el monto sobre el límite por cobro se rechaza', async () => {
    const s = await login();
    const r = await createLink(s, 150_000);
    assert.equal(r.status, 422);
    assert.equal(r.body.error.code, 'LIMIT_PER_TX');
  });

  test('monto alto pide PIN; el permiso es de un solo uso y solo para ese monto', async () => {
    const s = await login();
    const first = await createLink(s, 60_000);
    assert.equal(first.status, 403);
    assert.equal(first.body.error.code, 'STEP_UP_REQUIRED');
    assert.match(first.body.error.step_up.summary, /S\/ 600\.00/);

    const grant = await call('POST', '/auth/step-up', { pin: DEMO_MERCHANT_PIN, action: 'CREATE_LINK', params: { amount_cents: 60_000 } }, s.headers);
    assert.equal(grant.status, 201);
    const token = grant.body.step_up_token as string;

    const wrongAmount = await createLink(s, 70_000, { 'X-Step-Up-Token': token });
    assert.equal(wrongAmount.status, 403, 'el permiso no sirve para otro monto');
    const ok = await createLink(s, 60_000, { 'X-Step-Up-Token': token });
    assert.equal(ok.status, 201);
    const reused = await createLink(s, 60_000, { 'X-Step-Up-Token': token });
    assert.equal(reused.status, 403, 'el permiso no se reutiliza');

    const consent = await db.prepare("SELECT * FROM consent_records WHERE merchant_id = 'mer_carlos' AND action = 'CREATE_LINK' ORDER BY created_at DESC LIMIT 1").get() as Json;
    assert.equal(consent.device_id, s.deviceId);
    assert.match(consent.summary, /600\.00/);
  });

  test('bajar límites rige ya; subirlos pide PIN y queda pendiente', async () => {
    const s = await login('mer_otro', '739164');
    const lower = await call('PUT', '/merchants/me/payments/limits', { per_tx_cents: 100_000, daily_cents: 500_000, daily_count: 20 }, s.headers);
    assert.equal(lower.status, 200);
    assert.equal(lower.body.per_tx_cents, 100_000);

    const raise = { per_tx_cents: 300_000, daily_cents: 500_000, daily_count: 20 };
    const denied = await call('PUT', '/merchants/me/payments/limits', raise, s.headers);
    assert.equal(denied.status, 403);
    const grant = await call('POST', '/auth/step-up', { pin: '739164', action: 'RAISE_LIMITS', params: raise }, s.headers);
    const pending = await call('PUT', '/merchants/me/payments/limits', raise, { ...s.headers, 'X-Step-Up-Token': grant.body.step_up_token });
    assert.equal(pending.status, 200);
    assert.equal(pending.body.per_tx_cents, 100_000, 'la subida no rige todavía');
    assert.equal(pending.body.pending.per_tx_cents, 300_000);

    const aboveTier = await call('PUT', '/merchants/me/payments/limits', { per_tx_cents: 900_000, daily_cents: 2_000_000, daily_count: 20 }, s.headers);
    assert.equal(aboveTier.status, 422);
  });

  test('dispositivo nuevo: enfriamiento con límites reducidos y alerta', async () => {
    await login('mer_otro', '739164'); // dispositivo habitual
    const s = await login('mer_otro', '739164', newDevice());
    const limits = await call('GET', '/merchants/me/payments/limits', undefined, s.headers);
    assert.ok(limits.body.cooldown_until, 'el dispositivo nuevo entra en enfriamiento');
    assert.ok(limits.body.per_tx_cents <= 125_000);
    const alerts = await call('GET', '/merchants/me/payments/alerts', undefined, s.headers);
    assert.ok(alerts.body.data.some((a: Json) => a.kind === 'NEW_DEVICE'));
  });

  test('desvincular otro dispositivo exige PIN y corta sus sesiones', async () => {
    const victim = await login('mer_otro', '739164', newDevice());
    const s = await login('mer_otro', '739164');
    const denied = await call('DELETE', `/merchants/me/payments/devices/${victim.deviceId}`, undefined, s.headers);
    assert.equal(denied.status, 403);
    const grant = await call('POST', '/auth/step-up', { pin: '739164', action: 'REVOKE_DEVICE', params: { device_id: victim.deviceId } }, s.headers);
    const ok = await call('DELETE', `/merchants/me/payments/devices/${victim.deviceId}`, undefined, { ...s.headers, 'X-Step-Up-Token': grant.body.step_up_token });
    assert.equal(ok.status, 200);
    const after = await call('GET', '/payment-links', undefined, victim.headers);
    assert.equal(after.status, 401);
  });
});

describe('Webhook firmado de 360pay', () => {
  test('sin firma, con firma inválida o fuera de la ventana: 401', async () => {
    const s = await login();
    const link = await createActiveLink(s, 2200);
    const payload = captured(link.code, 2200);
    assert.equal((await webhook(payload, { signature: 'sha256=00' })).status, 401);
    assert.equal((await webhook(payload, { ts: Math.floor(Date.now() / 1000) - 3600 })).status, 401);
    const raw = JSON.stringify(payload);
    const noSig = await call('POST', '/webhooks/360pay', raw, { 'X-360pay-Timestamp': String(Math.floor(Date.now() / 1000)), 'X-360pay-Event-ID': 'evt_sinfirma01' });
    assert.equal(noSig.status, 401);
  });

  test('pago válido: link pagado, libro cuadrado; repetición sin efecto', async () => {
    const s = await login();
    const link = await createActiveLink(s, 5000);
    const eventId = 'evt_pago_valido_01';
    const payload = captured(link.code, 5000, 'GW-valido01');
    const first = await webhook(payload, { eventId });
    assert.equal(first.status, 200);
    assert.equal(first.body.status, 'PROCESSED');

    const row = await db.prepare('SELECT status FROM payment_links WHERE id = ?').get(link.id) as { status: string };
    assert.equal(row.status, 'PAID');
    const ledger = await db
      .prepare('SELECT type, SUM(amount_cents) AS s FROM ledger_entries WHERE payment_id = ? GROUP BY type')
      .all(first.body.payment_id) as { type: string; s: number }[];
    assert.deepEqual(Object.fromEntries(ledger.map((l) => [l.type, l.s])), { CREDIT: 5000, DEBIT: 5000 });

    const replay = await webhook(payload, { eventId });
    assert.equal(replay.body.duplicate, true);
    const count = await db.prepare('SELECT COUNT(*) AS n FROM payments WHERE payment_link_id = ?').get(link.id) as { n: number };
    assert.equal(count.n, 1, 'la repetición no crea otro pago');

    const sameIdOtherBody = await webhook(captured(link.code, 9999), { eventId });
    assert.equal(sameIdOtherBody.status, 409);

    const secondCapture = await webhook(captured(link.code, 5000));
    assert.equal(secondCapture.body.reason, 'ALREADY_PAID', 'uso único');
  });

  test('monto distinto al del link: se rechaza y alerta al comercio', async () => {
    const s = await login();
    const link = await createActiveLink(s, 3300);
    const r = await webhook(captured(link.code, 33));
    assert.equal(r.body.status, 'REJECTED');
    assert.equal(r.body.reason, 'AMOUNT_MISMATCH');
    const row = await db.prepare('SELECT status FROM payment_links WHERE id = ?').get(link.id) as { status: string };
    assert.equal(row.status, 'ACTIVE');
  });

  test('un monto alterado en la base invalida la firma del link', async () => {
    const s = await login();
    const link = await createActiveLink(s, 2700);
    await db.exec('DROP TRIGGER payment_links_guard ON payments.payment_links'); // simula a un atacante con acceso a la base
    // Cuadra comisión + neto para pasar el CHECK; la firma igual deja de coincidir.
    await db.prepare('UPDATE payment_links SET amount_cents = 270000, net_cents = 270000 - fee_cents WHERE id = ?').run(link.id);
    const view = await call('GET', `/payment-links/public/${link.code}`);
    assert.equal(view.status, 404);
    const pay = await webhook(captured(link.code, 270000));
    assert.equal(pay.body.reason, 'LINK_TAMPERED');
    await db.prepare('DELETE FROM payment_links WHERE id = ?').run(link.id);
    await db.exec(
      'CREATE TRIGGER payment_links_guard BEFORE UPDATE ON payments.payment_links FOR EACH ROW EXECUTE FUNCTION payments.payment_links_guard()'
    ); // restaura el trigger
  });

  test('sandbox: el pago simulado pasa por la misma verificación de firma', async () => {
    const s = await login();
    const link = await createActiveLink(s, 1800);
    resetRateLimits();
    const r = await call('POST', '/sandbox/360pay/pay', { code: link.code, method: 'PLIN' });
    assert.equal(r.status, 200);
    assert.equal(r.body.webhook.status, 'PROCESSED');
  });
});

describe('Antifraude', () => {
  test('ráfaga de links: se retiene para revisión y el analista la libera', async () => {
    const rule = await call('PUT', '/internal/risk/rules/link_velocity_review', { params: { max_links: 2 } }, admin);
    assert.equal(rule.status, 200);
    const s = await login('mer_risk', '739164');
    await createLink(s, 1000);
    await createLink(s, 1000);
    const held = await createLink(s, 1000);
    assert.equal(held.status, 201);
    assert.equal(held.body.status, 'ON_HOLD');
    assert.equal(held.body.risk.decision, 'REVIEW');
    const issue = await call('POST', `/payment-links/${held.body.id}/issue`, undefined, s.headers);
    assert.equal(issue.status, 409);

    const queue = await call('GET', '/internal/risk/reviews', undefined, admin);
    assert.ok(queue.body.data.some((r: Json) => r.link_id === held.body.id && r.reasons[0].rule === 'link_velocity_review'));
    const resolved = await call('POST', `/internal/risk/reviews/${held.body.id}/resolve`, { resolution: 'RELEASE', label: 'LEGIT', analyst: 'qa' }, admin);
    assert.equal(resolved.body.status, 'DRAFT');
    const issued = await call('POST', `/payment-links/${held.body.id}/issue`, undefined, s.headers);
    assert.equal(issued.status, 200);
    await call('PUT', '/internal/risk/rules/link_velocity_review', { params: { max_links: 10 } }, admin);

    const metrics = await call('GET', '/internal/risk/metrics', undefined, admin);
    assert.ok(metrics.body.decisions.REVIEW >= 1);
    assert.equal(metrics.body.false_positive_rate, 1);
  });

  test('dispositivo en lista negra: bloqueo sin revelar la regla', async () => {
    const s = await login('mer_risk', '739164', newDevice());
    await call('POST', '/internal/risk/lists', { list: 'BLACK', kind: 'DEVICE', value: s.deviceId, reason: 'prueba' }, admin);
    const r = await createLink(s, 1000);
    assert.equal(r.status, 403);
    assert.equal(r.body.error.code, 'RISK_BLOCKED');
    assert.ok(!JSON.stringify(r.body).includes('list_black'));
  });

  test('las rutas internas exigen el token de operaciones', async () => {
    assert.equal((await call('GET', '/internal/risk/metrics')).status, 401);
    assert.equal((await call('GET', '/internal/risk/metrics', undefined, { Authorization: 'Bearer x' })).status, 401);
  });

  test('apagar una función (incidente) la pausa sin redeploy', async () => {
    await call('PUT', '/internal/features/LINK_CREATE', { enabled: false, reason: 'simulacro' }, admin);
    const s = await login();
    const r = await createLink(s, 1000);
    assert.equal(r.status, 503);
    await call('PUT', '/internal/features/LINK_CREATE', { enabled: true }, admin);
  });
});

describe('Bitácora y conciliación', () => {
  test('la bitácora es de solo agregado y su cadena verifica', async () => {
    await assert.rejects(db.run('UPDATE audit_log SET result = ? WHERE seq = 1', 'OK'), /solo agregado/);
    await assert.rejects(db.run('DELETE FROM ledger_entries'), /solo agregado/);
    await assert.rejects(db.exec('TRUNCATE payments.audit_log'), /solo agregado/);
    const v = await call('GET', '/internal/audit/verify', undefined, admin);
    assert.equal(v.body.ok, true);
    assert.ok(v.body.count > 10);
    const details = (await db.prepare('SELECT details_json FROM audit_log WHERE details_json IS NOT NULL').all() as { details_json: string }[]).map(
      (r) => JSON.parse(r.details_json) as Json
    );
    const leaked = details.some((d) => Object.values(d).some((v) => v === DEMO_MERCHANT_PIN || v === '739164'));
    assert.ok(!leaked, 'el PIN nunca llega a la bitácora');
  });

  test('conciliación: detecta capturas no abonadas y diferencias con 360pay', async () => {
    const s = await login();
    const link = await createActiveLink(s, 4100);
    await webhook(captured(link.code, 4100, 'GW-recon0001'));
    const ours = await db.prepare('SELECT gateway_ref, amount_cents FROM payments').all() as { gateway_ref: string; amount_cents: number }[];
    const report = [
      ...ours.filter((p) => p.gateway_ref !== 'GW-recon0001').map((p) => ({ gateway_ref: p.gateway_ref, amount_minor: p.amount_cents, status: 'CAPTURED' })),
      { gateway_ref: 'GW-recon0001', amount_minor: 4000, status: 'CAPTURED' },
      { gateway_ref: 'GW-fantasma01', amount_minor: 900, status: 'CAPTURED' }
    ];
    const r = await call('POST', '/internal/reconciliation/run', { provider_report: report }, admin);
    assert.equal(r.status, 200);
    const types = new Set(r.body.exceptions.map((e: Json) => e.type));
    assert.ok(types.has('AMOUNT_MISMATCH_PROVIDER'));
    assert.ok(types.has('MISSING_IN_KUOTA'));
    assert.ok(types.has('CAPTURED_NOT_CREDITED'), 'el pago con monto distinto queda como excepción');
    assert.ok(!types.has('LEDGER_UNBALANCED') && !types.has('LEDGER_GLOBAL_UNBALANCED'));
  });

  test('alterar una fila de la bitácora rompe la cadena', async () => {
    await db.exec('DROP TRIGGER audit_log_append_only ON payments.audit_log');
    await db.prepare("UPDATE audit_log SET result = 'OK' WHERE seq = (SELECT MIN(seq) FROM audit_log WHERE result = 'DENIED')").run();
    const v = await call('GET', '/internal/audit/verify', undefined, admin);
    assert.equal(v.body.ok, false);
    assert.ok(v.body.broken_at_seq);
  });
});
