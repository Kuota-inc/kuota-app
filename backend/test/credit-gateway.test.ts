// Sin pasarela de pagos (modo no simulado) no se puede "pagar" una cuota ni liquidar una compra sin mover dinero:
// si no, bastaría pedir crédito, tocar "Pagar" y volver a pedir.
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kuota-gateway-'));
process.env.KUOTA_DEV_SECRETS_FILE = path.join(tmp, 'secrets.json');
process.env.NODE_ENV = 'test';
process.env.KUOTA_SANDBOX = '0'; // como producción con banco real

const { useTestDatabase } = await import('./helpers.js');
const dropTestDatabase = await useTestDatabase();
const { createApp } = await import('../src/app.js');
const { closeDatabases } = await import('../src/db/database.js');

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

describe('Pagos de crédito sin pasarela', () => {
  test('no se puede marcar una cuota como pagada sin dinero', async () => {
    const r = await fetch(`${base}/credit/installments/inst_cualquiera/pay`, { method: 'POST' });
    assert.equal(r.status, 409);
    assert.equal(((await r.json()) as any).error.code, 'PAYMENT_GATEWAY_REQUIRED');
  });

  test('ni liquidar una compra', async () => {
    const r = await fetch(`${base}/credit/purchases/pur_cualquiera/settle`, { method: 'POST' });
    assert.equal(r.status, 409);
    assert.equal(((await r.json()) as any).error.code, 'PAYMENT_GATEWAY_REQUIRED');
  });
});
