// Didit local: imita la API de verificación de Didit (https://docs.didit.me) para
// desarrollar sin cuenta ni costo.
//   npm --prefix backend run didit:mock  →  http://localhost:3370
// - POST /v3/session/                  crea la sesión (x-api-key) y devuelve `url`
// - GET  /v3/session/:id/decision/     decisión con id_verifications, liveness_checks, face_matches
// - GET  /session/:id                  página de verificación: el "usuario" aprueba o falla
// Al decidir envía a Kuota el webhook status.updated firmado como Didit:
// X-Signature = HMAC-SHA256 hex del cuerpo crudo con DIDIT_WEBHOOK_SECRET, más X-Timestamp.
import 'dotenv/config';
import crypto from 'node:crypto';
import http from 'node:http';

const PORT = Number(process.env.DIDIT_MOCK_PORT) || 3370;
const API_KEY = process.env.DIDIT_MOCK_API_KEY || 'sk_test_local';
const WEBHOOK_URL = process.env.DIDIT_MOCK_WEBHOOK_URL || 'http://localhost:3001/api/v1/webhooks/didit';
const secret = () => {
  const s = process.env.DIDIT_WEBHOOK_SECRET;
  if (!s) throw new Error('Falta DIDIT_WEBHOOK_SECRET (en backend/.env), el mismo que usa Kuota.');
  return s;
};

interface Session {
  session_id: string;
  session_number: number;
  workflow_id: string;
  vendor_data: string;
  callback?: string;
  expected_details?: Record<string, any>;
  status: string;
  decision: Record<string, any> | null;
  created_at: string;
}
const sessions = new Map<string, Session>();
let counter = 1000;

const send = (res: http.ServerResponse, status: number, body: unknown, type = 'application/json') => {
  res.writeHead(status, { 'Content-Type': `${type}; charset=utf-8` });
  res.end(type === 'application/json' ? JSON.stringify(body) : String(body));
};

async function readBody(req: http.IncomingMessage): Promise<string> {
  let raw = '';
  for await (const c of req) raw += c;
  return raw;
}

const esc = (v: unknown) => String(v ?? '').replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]!);

function decisionFor(s: Session, outcome: string, dni: string) {
  const ok = outcome === 'approve';
  const review = outcome === 'review';
  const status = ok ? 'Approved' : review ? 'In Review' : 'Declined';
  return {
    session_id: s.session_id,
    session_number: s.session_number,
    status,
    vendor_data: s.vendor_data,
    workflow_id: s.workflow_id,
    id_verifications: [
      {
        node_id: 'feature_ocr_1',
        status: outcome === 'bad_document' ? 'Declined' : 'Approved',
        document_type: 'Identity Card',
        issuing_state: 'PER',
        document_number: dni,
        personal_number: dni,
        first_name: 'CARLOS ALBERTO',
        last_name: 'MENDOZA QUISPE'
      }
    ],
    liveness_checks: [{ node_id: 'feature_liveness_1', status: outcome === 'no_liveness' ? 'Declined' : 'Approved', score: outcome === 'no_liveness' ? 0.12 : 0.97 }],
    face_matches: [{ node_id: 'feature_face_match_1', status: review ? 'In Review' : ok ? 'Approved' : 'Declined', score: ok ? 0.93 : 0.41 }]
  };
}

async function sendWebhook(s: Session) {
  const body = JSON.stringify({
    event_id: crypto.randomUUID(),
    webhook_type: 'status.updated',
    timestamp: Math.floor(Date.now() / 1000),
    created_at: Math.floor(Date.now() / 1000),
    environment: 'sandbox',
    session_id: s.session_id,
    status: s.status,
    workflow_id: s.workflow_id,
    vendor_data: s.vendor_data,
    decision: s.decision
  });
  const ts = String(Math.floor(Date.now() / 1000));
  const sig = crypto.createHmac('sha256', secret()).update(body, 'utf8').digest('hex');
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const r = await fetch(WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'User-Agent': 'DiditWebhook/2.0 (local)', 'X-Timestamp': ts, 'X-Signature': sig },
        body
      });
      console.log(`[didit-local] webhook ${s.session_id} → HTTP ${r.status}`);
      if (r.ok) return true;
    } catch (e) {
      console.log(`[didit-local] webhook falló: ${(e as Error).message}`);
    }
    await new Promise((r) => setTimeout(r, 700 * attempt));
  }
  return false;
}

function page(s: Session) {
  const dni = s.expected_details?.identification_number ?? '';
  const done = s.status !== 'Not Started' && s.status !== 'In Progress';
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Didit local · Verificación</title><style>body{font:15px system-ui,sans-serif;margin:0;background:#0b1020;color:#fff;display:flex;justify-content:center}
main{max-width:420px;width:100%;padding:24px}h1{font-size:20px}p{color:#aab}.card{background:#151c33;border-radius:16px;padding:16px;margin:12px 0}
button{width:100%;padding:12px;border:0;border-radius:12px;margin:6px 0;font-size:15px;cursor:pointer}.ok{background:#22c55e}.no{background:#ef4444;color:#fff}.rv{background:#f59e0b}
input{width:100%;padding:10px;border-radius:10px;border:0;margin-top:6px}</style></head><body><main>
<h1>Verificación de identidad (Didit local)</h1><p>Simulador para desarrollo. En producción aquí el usuario fotografía su DNI y hace la prueba de vida en Didit.</p>
${done ? `<div class="card">Resultado: <b>${esc(s.status)}</b>. Ya puedes volver a Kuota.</div>` : `
<form method="post" action="/session/${s.session_id}/complete"><div class="card"><label>DNI que aparece en el documento<input name="dni" value="${esc(dni)}" maxlength="8"></label></div>
<button class="ok" name="outcome" value="approve">Documento y rostro válidos (aprobar)</button>
<button class="rv" name="outcome" value="review">Dudoso (enviar a revisión)</button>
<button class="no" name="outcome" value="no_liveness">Falla la prueba de vida</button>
<button class="no" name="outcome" value="bad_document">Documento inválido</button></form>`}
${s.callback && done ? `<p><a style="color:#8ab4ff" href="${esc(s.callback)}">Volver a Kuota</a></p>` : ''}
</main></body></html>`;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);
  const p = url.pathname;

  const pageMatch = p.match(/^\/session\/([^/]+)$/);
  if (req.method === 'GET' && pageMatch) {
    const s = sessions.get(pageMatch[1]);
    if (!s) return send(res, 404, 'Sesión no encontrada', 'text/plain');
    if (s.status === 'Not Started') s.status = 'In Progress';
    return send(res, 200, page(s), 'text/html');
  }
  const completeMatch = p.match(/^\/session\/([^/]+)\/complete$/);
  if (req.method === 'POST' && completeMatch) {
    const s = sessions.get(completeMatch[1]);
    if (!s) return send(res, 404, 'Sesión no encontrada', 'text/plain');
    const form = new URLSearchParams(await readBody(req));
    const outcome = form.get('outcome') ?? 'approve';
    const dni = (form.get('dni') ?? '').replace(/\D/g, '').slice(0, 8);
    s.decision = decisionFor(s, outcome, dni);
    s.status = s.decision.status;
    await sendWebhook(s);
    res.writeHead(303, { Location: `/session/${s.session_id}` });
    return res.end();
  }

  if (!p.startsWith('/v3/')) return send(res, 404, { detail: 'Not found' });
  if (req.headers['x-api-key'] !== API_KEY) return send(res, req.headers['x-api-key'] ? 401 : 403, { detail: 'Invalid API key' });

  if (req.method === 'POST' && p === '/v3/session/') {
    const b = JSON.parse((await readBody(req)) || '{}');
    if (!b.workflow_id) return send(res, 400, { workflow_id: ['Invalid workflow_id.'] });
    const open = [...sessions.values()].find((s) => s.workflow_id === b.workflow_id && s.vendor_data === b.vendor_data && !s.decision);
    if (open) return send(res, 201, { session_id: open.session_id, session_number: open.session_number, url: `http://localhost:${PORT}/session/${open.session_id}`, status: open.status, workflow_id: open.workflow_id, vendor_data: open.vendor_data });
    const s: Session = {
      session_id: crypto.randomUUID(),
      session_number: ++counter,
      workflow_id: b.workflow_id,
      vendor_data: b.vendor_data ?? '',
      callback: b.callback,
      expected_details: b.expected_details,
      status: 'Not Started',
      decision: null,
      created_at: new Date().toISOString()
    };
    sessions.set(s.session_id, s);
    return send(res, 201, { session_id: s.session_id, session_kind: 'user', session_number: s.session_number, url: `http://localhost:${PORT}/session/${s.session_id}`, status: s.status, workflow_id: s.workflow_id, vendor_data: s.vendor_data });
  }
  const decMatch = p.match(/^\/v3\/session\/([^/]+)\/decision\/?$/);
  if (req.method === 'GET' && decMatch) {
    const s = sessions.get(decMatch[1]);
    if (!s) return send(res, 404, { detail: 'Not found' });
    return send(res, 200, s.decision ?? { session_id: s.session_id, status: s.status, vendor_data: s.vendor_data });
  }
  send(res, 404, { detail: 'Not found' });
});

server.listen(PORT, () => console.log(`Didit local en http://localhost:${PORT} (API /v3, x-api-key: ${API_KEY}); webhooks → ${WEBHOOK_URL}`));
