// Pruebas integrales de Inicio y Conciliación del perfil Proveedor:
// 1. Fuente única de verdad (/providers/orders unifica orders aKuotas! + payment_links Kuota Payments).
// 2. Distinción entre link no pagado (UNPAID), pago recibido del cliente (PENDING_SETTLEMENT = "Por confirmar")
//    y liquidación al vendedor (SETTLED = "Cancelado"), separados de pedidos aKuotas!.
// 3. Simulación en sandbox con ventana configurable (5 min por defecto) y distinción de Anulado / Fallido.
// 4. Protección en producción: vencer las 48h estimadas NO liquida sin evidencia firmada de 360pay;
//    conserva estado pendiente y señala settlement_overdue = true.
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kuota-prov-reconcil-'));
process.env.KUOTA_DEV_SECRETS_FILE = path.join(tmp, 'secrets.json');
process.env.NODE_ENV = 'test';

const { useTestDatabase } = await import('./helpers.js');
const dropTestDatabase = await useTestDatabase();
const { createApp } = await import('../src/app.js');
const { closeDatabases } = await import('../src/db/database.js');
const { paymentsDb } = await import('../src/db/client.js');
const { signWebhookBody } = await import('../src/security/webhook.js');

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

const DEVICE = 'prov_reconcil_device_001';

describe('Proveedor: Inicio y Conciliación (Kuota Payments + aKuotas!)', () => {
  test('flujo completo: link sin pagar, pago recibido ("Por confirmar"), ventana sandbox 5m -> "Cancelado", anulado, fallido y bloqueo en producción', async () => {
    // 1. Registrar proveedor y abrir su cuenta de cobros Kuota Payments
    const ses = await call('POST', '/onboarding/sessions', {
      role: 'PROVIDER',
      device_id: DEVICE,
      accepted_terms_version: '2026.1',
      accepted_privacy_version: '2026.1'
    });
    const sessionId = ses.body.session_id as string;

    const biz = await call('POST', '/businesses/confirm', {
      session_id: sessionId,
      ruc: '20100190797',
      legal_rep_dni: '47891234',
      whatsapp: '944556677'
    });
    assert.equal(biz.status, 201);
    const providerId = biz.body.provider_id as string;
    const providerToken = biz.body.provider_token as string;

    // Configurar PIN fuerte del proveedor
    const pin = '739164';
    const setPin = await call('POST', `/onboarding/sessions/${sessionId}/security-pin`, { pin });
    assert.equal(setPin.status, 200);

    // Abrir sesión de Kuota Payments para el proveedor
    const paySes = await call(
      'POST',
      '/providers/payments/session',
      { pin, device_id: DEVICE, device_label: 'Android QA' },
      { 'X-Provider-Id': providerId, 'X-Provider-Token': providerToken }
    );
    assert.equal(paySes.status, 201);
    const merchantId = paySes.body.merchant_id as string;
    const accessToken = paySes.body.access_token as string;
    const identityToken = paySes.body.identity_token as string;

    // Activar Kuota Payments para el comercio del proveedor
    await paymentsDb.run('UPDATE merchant_profiles SET payments_active = TRUE, ruc_verified = TRUE WHERE id = ?', merchantId);

    const authHeaders = {
      Authorization: `Bearer ${accessToken}`,
      'X-Device-Id': DEVICE,
      'X-Merchant-Id': merchantId,
      'X-Merchant-Token': identityToken,
      'X-Provider-Id': providerId,
      'X-Provider-Token': providerToken
    };

    // 2. Crear 3 links:
    //    - Link A (S/ 100.00): se emite y lo paga el cliente
    //    - Link B (S/ 50.00): se emite pero NO se paga (debe quedar UNPAID, nunca "Por confirmar" como recibido)
    //    - Link C (S/ 80.00): se emite y se anula ("CANCELLED")
    //    - Link D (S/ 60.00): se emite y sufre un intento de pago rechazado ("FAILED")
    const createIssuedLink = async (amountCents: number, concept: string, key: string) => {
      let created = await call(
        'POST',
        '/payment-links',
        { amount_cents: amountCents, concept },
        { ...authHeaders, 'Idempotency-Key': key }
      );
      if (created.status === 428 && created.body?.error?.code === 'STEP_UP_REQUIRED') {
        const step = await call(
          'POST',
          '/auth/step-up',
          { pin, action: 'CREATE_LINK', params: { amount_cents: amountCents } },
          authHeaders
        );
        assert.equal(step.status, 200, JSON.stringify(step.body));
        created = await call(
          'POST',
          '/payment-links',
          { amount_cents: amountCents, concept },
          { ...authHeaders, 'Idempotency-Key': key + '_su', 'X-Step-Up-Token': step.body.step_up_token }
        );
      }
      assert.equal(created.status, 201, JSON.stringify(created.body));
      const issued = await call('POST', `/payment-links/${created.body.id}/issue`, {}, authHeaders);
      assert.equal(issued.status, 200, JSON.stringify(issued.body));
      return issued.body as { id: string; code: string; amount_cents: number; fee_cents: number; net_cents: number };
    };

    const linkA = await createIssuedLink(10000, 'Venta pagada A', 'idem_link_a_0000000001');
    const linkB = await createIssuedLink(5000, 'Link sin pagar B', 'idem_link_b_0000000002');
    const linkC = await createIssuedLink(8000, 'Link anulado C', 'idem_link_c_0000000003');
    const linkD = await createIssuedLink(6000, 'Link intento fallido D', 'idem_link_d_0000000004');

    // Anular Link C
    const cancelledC = await call('POST', `/payment-links/${linkC.id}/cancel`, {}, authHeaders);
    assert.equal(cancelledC.status, 200);
    assert.equal(cancelledC.body.settlement_status, 'CANCELLED');

    // Intento de pago fallido en Link D
    const rejectedD = await call('POST', '/sandbox/360pay/pay', { code: linkD.code, method: 'YAPE', outcome: 'reject' });
    assert.equal(rejectedD.status, 200);

    // Pagar Link A en sandbox
    process.env.KUOTA_SETTLEMENT_WINDOW_MS = '300000'; // 5 minutos
    const paidA = await call('POST', '/sandbox/360pay/pay', { code: linkA.code, method: 'YAPE' });
    assert.equal(paidA.status, 200);

    // 3. Consultar /providers/orders SIN sesión Bearer (simulando recarga / cierre y reapertura de la app)
    const reloadView = await call(
      'GET',
      '/providers/orders',
      undefined,
      { 'X-Provider-Id': providerId, 'X-Provider-Token': providerToken }
    );
    assert.equal(reloadView.status, 200);
    const linksOnReload = reloadView.body.payment_links as Array<Record<string, any>>;
    assert.equal(linksOnReload.length, 4, 'todos los links se cargan desde /providers/orders sin requerir sesión en memoria');

    const viewA = linksOnReload.find((l) => l.id === linkA.id)!;
    const viewB = linksOnReload.find((l) => l.id === linkB.id)!;
    const viewC = linksOnReload.find((l) => l.id === linkC.id)!;
    const viewD = linksOnReload.find((l) => l.id === linkD.id)!;

    // Link A: pagado por el cliente, esperando liquidación (dentro de los 5 min) -> PENDING_SETTLEMENT ("Por confirmar")
    assert.equal(viewA.status, 'PAID');
    assert.equal(viewA.settled_at, null);
    assert.equal(viewA.settlement_status, 'PENDING_SETTLEMENT');
    assert.equal(viewA.settlement_overdue, false);
    assert.ok(viewA.net_cents < viewA.amount_cents, 'neto descuenta comisión Kuota + IGV');

    // Link B: activo pero NO pagado -> UNPAID (nunca marcado como pago recibido)
    assert.equal(viewB.status, 'ACTIVE');
    assert.equal(viewB.settlement_status, 'UNPAID');

    // Link C: anulado -> CANCELLED
    assert.equal(viewC.status, 'CANCELLED');
    assert.equal(viewC.settlement_status, 'CANCELLED');

    // Link D: intento fallido -> FAILED
    assert.equal(viewD.settlement_status, 'FAILED');
    assert.equal(viewD.last_attempt_failed, true);

    // 4. Simulación tras cumplir la ventana de 5 minutos en sandbox (sin temporizador de pantalla ni cambiar fecha del dispositivo)
    const sixMinAgo = new Date(Date.now() - 6 * 60 * 1000).toISOString();
    await paymentsDb.run('UPDATE payments.payment_links SET paid_at = ? WHERE id = ?', sixMinAgo, linkA.id);

    const afterWindowView = await call(
      'GET',
      '/providers/orders',
      undefined,
      { 'X-Provider-Id': providerId, 'X-Provider-Token': providerToken }
    );
    assert.equal(afterWindowView.status, 200);
    const settledA = (afterWindowView.body.payment_links as Array<Record<string, any>>).find((l) => l.id === linkA.id)!;
    assert.equal(settledA.status, 'PAID');
    assert.ok(settledA.settled_at, 'settled_at se confirma automáticamente en sandbox al cumplir los 5 minutos');
    assert.equal(settledA.settlement_status, 'SETTLED');

    // 5. En producción (o cobro real live_): pasar las 48h NO confirma la liquidación sin evidencia de 360pay
    const linkProd = await createIssuedLink(20000, 'Venta producción E', 'idem_link_e_0000000005');
    const threeDaysAgo = new Date(Date.now() - 72 * 3600 * 1000).toISOString();
    await paymentsDb.run(
      "UPDATE payments.payment_links SET status = 'PAID', paid_at = ?, gateway_ref = 'live_360_real_tx' WHERE id = ?",
      threeDaysAgo,
      linkProd.id
    );

    const prodCheck = await call(
      'GET',
      '/providers/orders',
      undefined,
      { 'X-Provider-Id': providerId, 'X-Provider-Token': providerToken }
    );
    const viewProdBeforeWebhook = (prodCheck.body.payment_links as Array<Record<string, any>>).find((l) => l.id === linkProd.id)!;
    assert.equal(viewProdBeforeWebhook.settled_at, null, 'en producción NO se liquida solo por cumplir 48h');
    assert.equal(viewProdBeforeWebhook.settlement_status, 'PENDING_SETTLEMENT');
    assert.equal(viewProdBeforeWebhook.settlement_overdue, true, 'señala que se cumplió el plazo estimado');
    assert.match(viewProdBeforeWebhook.settlement_sla_note, /360pay/);

    // Cuando llega la evidencia firmada de 360pay (ticket.settled), entonces SÍ pasa a SETTLED
    const webhookPayload = JSON.stringify([
      {
        event: 'ticket.settled',
        _id: 'live_360_real_tx',
        external_ref: linkProd.id,
        amount: 200,
        status: 'settled',
        settled_at: new Date().toISOString()
      }
    ]);
    const ts = new Date().toISOString();
    const whRes = await call('POST', '/webhooks/360pay', JSON.parse(webhookPayload), {
      'X-360Pay-Signature': signWebhookBody(webhookPayload, ts),
      'X-360Pay-Timestamp': ts,
      'X-360Pay-Event-Id': 'evt_settle_prod_001'
    });
    assert.equal(whRes.status, 200);

    const prodAfterWebhook = await call(
      'GET',
      '/providers/orders',
      undefined,
      { 'X-Provider-Id': providerId, 'X-Provider-Token': providerToken }
    );
    const viewProdAfterWebhook = (prodAfterWebhook.body.payment_links as Array<Record<string, any>>).find((l) => l.id === linkProd.id)!;
    assert.ok(viewProdAfterWebhook.settled_at, 'liquidado tras recibir webhook firmado de 360pay');
    assert.equal(viewProdAfterWebhook.settlement_status, 'SETTLED');
    assert.equal(viewProdAfterWebhook.settlement_overdue, false);
  });
});
