// KYC con Didit contra un servidor simulado con la forma de su API v3.
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kuota-kyc-'));
process.env.KUOTA_DEV_SECRETS_FILE = path.join(tmp, 'secrets.json');
process.env.NODE_ENV = 'test';
process.env.DIDIT_API_KEY = 'sk_test_x';
process.env.DIDIT_WORKFLOW_ID = 'wf-test';
process.env.DIDIT_WEBHOOK_SECRET = 'didit-secret-for-tests';

const sessions: { body: any; id: string }[] = [];
const mock = http.createServer((req, res) => {
  let raw = '';
  req.on('data', (c) => (raw += c));
  req.on('end', () => {
    res.setHeader('Content-Type', 'application/json');
    if (req.headers['x-api-key'] !== 'sk_test_x') return res.writeHead(401).end('{"detail":"bad key"}');
    if (req.method === 'POST' && req.url === '/v3/session/') {
      const id = crypto.randomUUID();
      sessions.push({ body: JSON.parse(raw), id });
      return res.writeHead(201).end(JSON.stringify({ session_id: id, url: `https://verify.example/${id}`, status: 'Not Started' }));
    }
    if (req.method === 'GET' && /^\/v3\/session\/[^/]+\/decision\/$/.test(req.url!)) {
      return res.writeHead(200).end(JSON.stringify({ status: 'In Progress' }));
    }
    res.writeHead(404).end('{}');
  });
});
await new Promise<void>((r) => mock.listen(0, '127.0.0.1', () => r()));
process.env.DIDIT_BASE_URL = `http://127.0.0.1:${(mock.address() as AddressInfo).port}`;

const { useTestDatabase } = await import('./helpers.js');
const dropTestDatabase = await useTestDatabase();
const { createApp } = await import('../src/app.js');
const { db, closeDatabases } = await import('../src/db/database.js');

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

function signed(payload: unknown) {
  const raw = JSON.stringify(payload);
  const sig = crypto.createHmac('sha256', 'didit-secret-for-tests').update(raw).digest('hex');
  return { raw, headers: { 'X-Timestamp': String(Math.floor(Date.now() / 1000)), 'X-Signature': sig } };
}

const decision = (status: string, dni: string) => ({
  status,
  id_verifications: [{ status, document_type: 'Identity Card', personal_number: dni, document_number: dni }],
  liveness_checks: [{ status, score: 0.97 }],
  face_matches: [{ status, score: 0.93 }]
});

async function newRequest(dni: string, phone: string, docType: 'DNI' | 'CE' = 'DNI') {
  const s = await call('POST', '/onboarding/sessions', { role: 'MERCHANT', device_id: 't', accepted_terms_version: '2026.1', accepted_privacy_version: '2026.1' });
  const sid = s.body.id ?? s.body.session_id;
  const r = await call('POST', `/onboarding/sessions/${sid}/merchant-identity`, { account_type: 'PERSONAL', doc_type: docType, dni, full_name: 'ANA TORRES RUIZ', phone, whatsapp_opt_in: true });
  return r.body.request_id as string;
}

describe('KYC con Didit', () => {
  let requestId = '';
  let sessionId = '';

  test('iniciar la verificación crea la sesión en Didit con el DNI esperado', async () => {
    requestId = await newRequest('41234567', '922333444');
    const v = await call('POST', `/onboarding/merchant-kyc/${requestId}/verification`);
    assert.equal(v.status, 200);
    assert.equal(v.body.provider, 'DIDIT');
    assert.match(v.body.url, /^https:\/\/verify\.example\//);
    const created = sessions.at(-1)!;
    sessionId = created.id;
    assert.equal(created.body.workflow_id, 'wf-test');
    assert.equal(created.body.vendor_data, requestId);
    assert.equal(created.body.expected_details.identification_number, '41234567');
    const st = await call('GET', `/onboarding/merchant-kyc/${requestId}`);
    assert.equal(st.body.status, 'IN_PROGRESS');
  });

  test('con Didit activo no se aceptan fotos por la API ni se guardan imágenes', async () => {
    const r = await call('POST', `/onboarding/merchant-kyc/${requestId}/documents`, { dni_front: 'data:x', dni_back: 'data:y', selfie: 'data:z' });
    assert.equal(r.status, 409);
    const cols = await db.all<{ column_name: string }>("SELECT column_name FROM information_schema.columns WHERE table_name = 'kyc_requests'");
    assert.ok(!cols.some((c) => ['dni_front', 'dni_back', 'selfie'].includes(c.column_name)));
  });

  test('webhook sin firma válida: 401', async () => {
    const { raw } = signed({ session_id: sessionId, status: 'Approved' });
    const r = await call('POST', '/webhooks/didit', raw, { 'X-Timestamp': String(Math.floor(Date.now() / 1000)), 'X-Signature': 'deadbeef' });
    assert.equal(r.status, 401);
  });

  test('aprobado con el mismo DNI: nivel Ampliado; el reintento no repite', async () => {
    const event = { event_id: 'evt-1', webhook_type: 'status.updated', session_id: sessionId, status: 'Approved', vendor_data: requestId, decision: decision('Approved', '41234567') };
    const { raw, headers } = signed(event);
    const r = await call('POST', '/webhooks/didit', raw, headers);
    assert.equal(r.body.outcome, 'APPROVED');
    const again = await call('POST', '/webhooks/didit', raw, headers);
    assert.equal(again.body.duplicate, true);
    const st = await call('GET', `/onboarding/merchant-kyc/${requestId}`);
    assert.equal(st.body.status, 'APPROVED');
    const m = await db.get<{ kyc_status: string }>('SELECT m.kyc_status FROM merchant_profiles m JOIN kyc_requests k ON k.session_id = m.session_id WHERE k.public_id = ?', requestId);
    assert.equal(m!.kyc_status, 'APPROVED');
    const summary = JSON.parse((await db.get<{ decision_summary_json: string }>('SELECT decision_summary_json FROM kyc_requests WHERE public_id = ?', requestId))!.decision_summary_json);
    assert.equal(summary.document.number_matches, true);
  });

  test('Didit aprueba pero el DNI del documento es otro: se rechaza (suplantación)', async () => {
    const rid = await newRequest('49876543', '933444555');
    await call('POST', `/onboarding/merchant-kyc/${rid}/verification`);
    const sid = sessions.at(-1)!.id;
    const { raw, headers } = signed({ event_id: 'evt-2', webhook_type: 'status.updated', session_id: sid, status: 'Approved', decision: decision('Approved', '11111111') });
    const r = await call('POST', '/webhooks/didit', raw, headers);
    assert.equal(r.body.outcome, 'REJECTED');
    const st = await call('GET', `/onboarding/merchant-kyc/${rid}`);
    assert.equal(st.body.reason, 'DNI_MISMATCH');
  });

  test('carnet de extranjería con letras: Didit lo aprueba con el número del carnet; otro carnet se rechaza', async () => {
    const ce = (status: string, num: string) => ({
      status,
      id_verifications: [{ status, document_type: 'Residence Permit', document_number: num }],
      liveness_checks: [{ status, score: 0.97 }],
      face_matches: [{ status, score: 0.93 }]
    });
    const rid = await newRequest('A12345678', '955111222', 'CE');
    assert.ok(rid, 'el registro con carnet crea la solicitud');
    await call('POST', `/onboarding/merchant-kyc/${rid}/verification`);
    const sid = sessions.at(-1)!.id;
    const ok = signed({ event_id: 'evt-ce-1', webhook_type: 'status.updated', session_id: sid, status: 'Approved', decision: ce('Approved', 'a1234-5678') });
    assert.equal((await call('POST', '/webhooks/didit', ok.raw, ok.headers)).body.outcome, 'APPROVED', 'las letras del carnet no deben provocar un rechazo');

    const rid2 = await newRequest('B98765432', '955111333', 'CE');
    await call('POST', `/onboarding/merchant-kyc/${rid2}/verification`);
    const sid2 = sessions.at(-1)!.id;
    const bad = signed({ event_id: 'evt-ce-2', webhook_type: 'status.updated', session_id: sid2, status: 'Approved', decision: ce('Approved', 'B98765431') });
    assert.equal((await call('POST', '/webhooks/didit', bad.raw, bad.headers)).body.outcome, 'REJECTED');
  });

  test('declinado y en revisión se reflejan tal cual', async () => {
    const rid = await newRequest('45555666', '944555666');
    await call('POST', `/onboarding/merchant-kyc/${rid}/verification`);
    const sid = sessions.at(-1)!.id;
    const review = signed({ event_id: 'evt-3', webhook_type: 'status.updated', session_id: sid, status: 'In Review', decision: decision('In Review', '45555666') });
    assert.equal((await call('POST', '/webhooks/didit', review.raw, review.headers)).body.outcome, 'IN_REVIEW');
    const declined = signed({ event_id: 'evt-4', webhook_type: 'status.updated', session_id: sid, status: 'Declined', decision: decision('Declined', '45555666') });
    assert.equal((await call('POST', '/webhooks/didit', declined.raw, declined.headers)).body.outcome, 'REJECTED');
  });
});
