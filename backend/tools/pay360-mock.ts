// 360pay local: imita la API pública de 360pay (https://api.360pay.pe/docs) para
// desarrollar sin cuenta, sin costo y sin túnel.
//   npm --prefix backend run pay360:mock   →  http://localhost:3360  (consola)
//                                              http://localhost:3360/v1 (API)
// - API: POST /customers, POST /coupons, GET /coupons/:id, PUT /coupons/:id/annul,
//        GET /settlements, GET /settlements/:id/coupons  (cabecera x-api-key)
// - Consola: lista los cupones y permite "pagarlos" como lo haría un banco.
// - Al pagar envía a Kuota el webhook PAYMENT_PAID real: array firmado con
//   HMAC-SHA256 sobre "<timestamp ISO>.<cuerpo>", X-360Pay-Event-Id, X-360Pay-Hook-Id
//   y hasta 3 reintentos (entrega at-least-once).
// Datos en memoria: se pierden al reiniciar.
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';

const PORT = Number(process.env.PAY360_MOCK_PORT) || 3360;
const API_KEY = process.env.PAY360_MOCK_API_KEY || 'sandbox-local';
const HOOK_ID = process.env.PAY360_MOCK_HOOK_ID || 'hook_local';
const WEBHOOK_URL = process.env.PAY360_MOCK_WEBHOOK_URL || 'http://localhost:3001/api/v1/webhooks/360pay';

/** El signing_secret del hook es el mismo que Kuota usa para verificar (KUOTA_WEBHOOK_SECRET). */
function signingSecret(): string {
  if (process.env.KUOTA_WEBHOOK_SECRET) return process.env.KUOTA_WEBHOOK_SECRET;
  const file = path.resolve(process.cwd(), '.dev-secrets.json');
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')).webhookSecret;
  } catch {
    throw new Error('No encuentro el secreto: define KUOTA_WEBHOOK_SECRET o arranca antes el backend (crea .dev-secrets.json).');
  }
}

const oid = () => crypto.randomBytes(12).toString('hex'); // estilo ObjectId de 360pay
const now = () => new Date().toISOString();

interface Customer { _id: string; name: string; coupon_code: string; email?: string; phone?: string; document_type?: string; document_number?: string; created_at: string; count: number }
interface Coupon { _id: string; business_id: string; customer_id: string; coupon_code: string; external_ref: string; amount: number; description?: string; status: 'active' | 'paid' | 'annulled'; issue_date: string; expiry_date?: string; paid_at?: string; operation_number?: string; bank_tx_id?: string; settlement_id?: string; created_at: string; updated_at: string }
interface Delivery { _id: string; event_id: string; coupon_id: string; status: 'delivered' | 'failed' | 'dead'; attempt_count: number; last_http_status: number | null; last_error: string | null; created_at: string }

const BUSINESS_ID = oid();
const customers = new Map<string, Customer>();
const coupons = new Map<string, Coupon>();
const deliveries: Delivery[] = [];
const settlements = new Map<string, { _id: string; batch_id: string; date: string; total_amount: number; coupon_ids: string[]; created_at: string }>();

const ok = (data: unknown, message?: string) => ({ success: true, data, ...(message ? { message } : {}) });
const err = (message: string) => ({ success: false, message });

function send(res: http.ServerResponse, status: number, body: unknown, type = 'application/json') {
  res.writeHead(status, { 'Content-Type': `${type}; charset=utf-8` });
  res.end(type === 'application/json' ? JSON.stringify(body) : String(body));
}

async function readJson(req: http.IncomingMessage): Promise<any> {
  let raw = '';
  for await (const chunk of req) raw += chunk;
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return { __invalid: true };
  }
}

// ------------------------------------------------------------- webhook
async function deliver(paid: Coupon[]) {
  const eventId = `evt_${crypto.randomBytes(16).toString('hex')}`;
  const body = JSON.stringify(
    paid.map((c) => ({
      event: 'ticket.paid',
      _id: c._id,
      external_ref: c.external_ref,
      payment_reference: c.coupon_code,
      amount: c.amount,
      status: 'paid',
      paid_at: c.paid_at,
      operation_number: c.operation_number,
      bank_tx_id: c.bank_tx_id
    }))
  );
  const delivery: Delivery = { _id: oid(), event_id: eventId, coupon_id: paid[0]._id, status: 'failed', attempt_count: 0, last_http_status: null, last_error: null, created_at: now() };
  deliveries.unshift(delivery);
  for (let attempt = 1; attempt <= 4; attempt++) {
    delivery.attempt_count = attempt;
    const ts = now();
    const signature = 'sha256=' + crypto.createHmac('sha256', signingSecret()).update(`${ts}.${body}`, 'utf8').digest('hex');
    try {
      const r = await fetch(WEBHOOK_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-360Pay-Event-Id': eventId,
          'X-360Pay-Delivery-Id': delivery._id,
          'X-360Pay-Hook-Id': HOOK_ID,
          'X-360Pay-Timestamp': ts,
          'X-360Pay-Signature': signature,
          'X-360Pay-Attempt': String(attempt)
        },
        body
      });
      delivery.last_http_status = r.status;
      if (r.ok) {
        delivery.status = 'delivered';
        delivery.last_error = null;
        console.log(`[360pay-local] webhook ${eventId} entregado (intento ${attempt})`);
        return delivery;
      }
      delivery.last_error = `Webhook responded with HTTP ${r.status}`;
    } catch (e) {
      delivery.last_error = (e as Error).message;
    }
    await new Promise((r) => setTimeout(r, 500 * attempt));
  }
  delivery.status = 'dead';
  console.log(`[360pay-local] webhook ${eventId} sin entregar: ${delivery.last_error}`);
  return delivery;
}

function settle(c: Coupon) {
  const day = (c.paid_at ?? now()).slice(0, 10);
  let s = [...settlements.values()].find((x) => x.date === day);
  if (!s) {
    s = { _id: oid(), batch_id: `BATCH-${day}`, date: day, total_amount: 0, coupon_ids: [], created_at: now() };
    settlements.set(s._id, s);
  }
  s.coupon_ids.push(c._id);
  s.total_amount = Math.round((s.total_amount + c.amount) * 100) / 100;
  c.settlement_id = s._id;
}

// ------------------------------------------------------------- consola
const esc = (v: unknown) => String(v ?? '').replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]!);

function consoleHtml() {
  const rows = [...coupons.values()]
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .map(
      (c) => `<tr><td><code>${esc(c.coupon_code)}</code></td><td>${esc(c.external_ref)}</td><td>${esc(c.description)}</td><td>S/ ${c.amount.toFixed(2)}</td>
      <td><span class="st ${c.status}">${c.status}</span></td>
      <td>${c.status === 'active' ? `<form method="post" action="/console/coupons/${c._id}/pay"><button>Pagar (banco)</button></form>` : esc(c.paid_at ?? '')}</td></tr>`
    )
    .join('');
  const dels = deliveries
    .slice(0, 10)
    .map((d) => `<tr><td><code>${esc(d.event_id)}</code></td><td>${esc(d.status)}</td><td>${d.attempt_count}</td><td>${esc(d.last_http_status)}</td><td>${esc(d.last_error)}</td></tr>`)
    .join('');
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>360pay local</title><style>
body{font:14px system-ui,sans-serif;margin:24px;color:#151c27;background:#f9f9ff}h1{margin:0 0 4px}p{color:#4a5f7e;margin:0 0 16px}
table{border-collapse:collapse;width:100%;background:#fff;margin-bottom:24px}td,th{border-bottom:1px solid #e1e8f8;padding:8px;text-align:left}
button{background:#1a3bb0;color:#fff;border:0;border-radius:8px;padding:6px 12px;cursor:pointer}.st{padding:2px 8px;border-radius:99px;font-size:12px}
.active{background:#e7eefe}.paid{background:#d1fae5}.annulled{background:#fee2e2}</style></head><body>
<h1>360pay local</h1><p>Simulador de la API pública de 360pay para desarrollo. Pagar un cupón envía el webhook PAYMENT_PAID firmado a <code>${esc(WEBHOOK_URL)}</code>.</p>
<h2>Cupones</h2><table><tr><th>Código</th><th>external_ref</th><th>Descripción</th><th>Monto</th><th>Estado</th><th></th></tr>${rows || '<tr><td colspan="6">Aún no hay cupones. Emite un link de cobro en Kuota.</td></tr>'}</table>
<h2>Entregas de webhook</h2><table><tr><th>Evento</th><th>Estado</th><th>Intentos</th><th>HTTP</th><th>Error</th></tr>${dels || '<tr><td colspan="5">Sin entregas.</td></tr>'}</table>
<script>setTimeout(()=>location.reload(),4000)</script></body></html>`;
}

// ------------------------------------------------------------- servidor
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);
  const p = url.pathname;

  if (req.method === 'GET' && p === '/') return send(res, 200, consoleHtml(), 'text/html');
  const payMatch = p.match(/^\/console\/coupons\/([^/]+)\/pay$/);
  if (req.method === 'POST' && payMatch) {
    const c = coupons.get(payMatch[1]);
    if (c && c.status === 'active') {
      c.status = 'paid';
      c.paid_at = now();
      c.operation_number = `OP-${crypto.randomInt(10_000_000, 99_999_999)}`;
      c.bank_tx_id = 'BCP';
      c.updated_at = now();
      settle(c);
      await deliver([c]);
    }
    res.writeHead(303, { Location: '/' });
    return res.end();
  }

  if (!p.startsWith('/v1/')) return send(res, 404, err('Not found'));
  const key = (req.headers['x-api-key'] as string | undefined) ?? (req.headers.authorization ?? '').replace(/^Bearer\s+/i, '');
  if (key !== API_KEY) return send(res, 401, err('Unauthorized'));
  const route = p.slice(3);

  if (req.method === 'POST' && route === '/customers') {
    const b = await readJson(req);
    if (!b.name || !b.coupon_code) return send(res, 400, err('name y coupon_code son obligatorios'));
    const existing = [...customers.values()].find((c) => c.coupon_code === b.coupon_code);
    if (existing) return send(res, 201, ok(existing, 'Customer already exists'));
    const c: Customer = { _id: oid(), name: b.name, coupon_code: b.coupon_code, email: b.email, phone: b.phone, document_type: b.document_type, document_number: b.document_number, created_at: now(), count: 0 };
    customers.set(c._id, c);
    return send(res, 201, ok(c, 'Customer created successfully'));
  }
  if (req.method === 'POST' && route === '/coupons') {
    const b = await readJson(req);
    if (typeof b.amount !== 'number' || b.amount <= 0 || !b.external_ref) return send(res, 400, err('amount y external_ref son obligatorios'));
    let customer = b.customer_id ? customers.get(b.customer_id) : undefined;
    if (!customer && b.customer?.name && b.customer?.coupon_code) {
      customer = { _id: oid(), ...b.customer, created_at: now(), count: 0 } as Customer;
      customers.set(customer._id, customer);
    }
    if (!customer) return send(res, 400, err('customer_id o customer es obligatorio'));
    customer.count += 1;
    const c: Coupon = {
      _id: oid(),
      business_id: BUSINESS_ID,
      customer_id: customer._id,
      coupon_code: `${customer.coupon_code}-${String(customer.count).padStart(4, '0')}`,
      external_ref: b.external_ref,
      amount: Math.round(b.amount * 100) / 100,
      description: b.description,
      status: 'active',
      issue_date: b.issue_date ?? now(),
      expiry_date: b.expiry_date,
      created_at: now(),
      updated_at: now()
    };
    coupons.set(c._id, c);
    return send(res, 201, ok(c, 'Coupon created successfully'));
  }
  const couponMatch = route.match(/^\/coupons\/([^/]+)(\/annul)?$/);
  if (couponMatch) {
    const c = coupons.get(couponMatch[1]);
    if (!c) return send(res, 404, err('Coupon not found'));
    if (req.method === 'GET' && !couponMatch[2]) return send(res, 200, ok(c));
    if (req.method === 'PUT' && couponMatch[2]) {
      if (c.status === 'paid') return send(res, 409, err('Coupon already paid'));
      c.status = 'annulled';
      c.updated_at = now();
      return send(res, 200, ok(c, 'Coupon annulled'));
    }
  }
  if (req.method === 'GET' && route === '/settlements') {
    const data = [...settlements.values()].map(({ coupon_ids, ...s }) => ({ ...s, coupons_count: coupon_ids.length }));
    return send(res, 200, { success: true, data, meta: { total: data.length, page: 1, limit: 50, total_pages: 1 } });
  }
  const settMatch = route.match(/^\/settlements\/([^/]+)\/coupons$/);
  if (req.method === 'GET' && settMatch) {
    const s = settlements.get(settMatch[1]) ?? [...settlements.values()].find((x) => x.batch_id === settMatch[1]);
    if (!s) return send(res, 404, err('Settlement not found'));
    return send(res, 200, { success: true, data: s.coupon_ids.map((id) => coupons.get(id)) });
  }
  send(res, 404, err('Not found'));
});

server.listen(PORT, () => {
  console.log(`360pay local en http://localhost:${PORT} (API en /v1, x-api-key: ${API_KEY}); webhooks → ${WEBHOOK_URL}`);
});
