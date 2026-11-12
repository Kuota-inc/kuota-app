// Backend falso para la demo: intercepta fetch hacia /api/v1 y responde con datos
// grabados del backend real (recorded*.json). Sin red, sin servidor.
import rec from './recorded.json';
import rec2 from './recorded2.json';

export const DEMO_PIN = '123456';
const R = rec as Record<string, { status: number; body: any }>;
const R2 = rec2 as Record<string, { status: number; body: any }>;

let linkAmount = 5000;
let linkConcept: string | null = 'Pedido';
let linkPaid = false;
const CODE = 'demoKuota.7Hq2Lw9XpZ';

const json = (status: number, body: unknown) =>
  new Response(status === 204 ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const err = (status: number, code: string, message: string, extra: object = {}) => json(status, { error: { code, message, ...extra } });

function link(status: 'DRAFT' | 'ACTIVE' | 'PAID') {
  const fee = Math.round(linkAmount * 0.01);
  return {
    ...R2.issueLink.body,
    id: 'lnk_demo', code: CODE, amount_cents: linkAmount, fee_cents: fee, net_cents: linkAmount - fee,
    concept: linkConcept, status, url: status === 'DRAFT' ? null : `${location.origin}/pay/${CODE}`,
    paid_at: status === 'PAID' ? new Date().toISOString() : null
  };
}

function handle(method: string, path: string, body: any, _headers: Record<string, string>): Response {
  const p = path.split('?')[0];
  const pinOk = (v: unknown) => v === DEMO_PIN;
  const bad = () => err(401, 'PIN_INVALID', 'PIN incorrecto. Te quedan 4 intentos.', { attempts_left: 4 });

  // PIN y sesión
  if (p === '/auth/sessions' && method === 'POST')
    return pinOk(body?.pin) ? json(201, { access_token: 'demo.token', token_type: 'Bearer', expires_at: new Date(Date.now() + 3600e3).toISOString() }) : bad();
  if (p === '/auth/step-up') return pinOk(body?.pin) ? json(200, { step_up_token: 'demo.stepup' }) : bad();
  if (p === '/auth/pin/change')
    return pinOk(body?.current_pin) ? json(200, { success: true, sessions_closed: 0, cooldown_until: new Date(Date.now() + 864e5).toISOString() }) : bad();
  if (p === '/auth/me') return json(200, { merchant_id: 'mer_demo' });

  // Cobros por link
  if (p === '/payment-links' && method === 'POST') {
    linkAmount = body?.amount_cents ?? 5000; linkConcept = body?.concept ?? null; linkPaid = false;
    return json(201, link('DRAFT'));
  }
  if (/^\/payment-links\/[^/]+\/issue$/.test(p)) return json(200, link('ACTIVE'));
  if (/^\/payment-links\/[^/]+\/cancel$/.test(p)) return json(200, { ...link('ACTIVE'), status: 'CANCELLED' });
  if (p.startsWith('/payment-links/public/'))
    return json(200, { ...R2.publicLink.body, code: CODE, amount_cents: linkAmount, concept: linkConcept });
  if (/^\/payment-links\/lnk_/.test(p)) return json(200, link(linkPaid ? 'PAID' : 'ACTIVE'));
  if (p === '/sandbox/360pay/pay') { linkPaid = true; return json(200, R2.pay.body); }
  if (p === '/payment-links/quote') return json(200, { amount_cents: body?.amount_cents, fee_cents: Math.round((body?.amount_cents ?? 0) * 0.01) });

  // Seguridad de pagos
  if (p === '/merchants/me/payments/limits') return json(200, R2.limits.body);
  if (p === '/merchants/me/payments/limits/pending') return json(200, R2.limits.body);
  if (p === '/merchants/me/payments/devices') return json(200, R2.devices.body);
  if (p.startsWith('/merchants/me/payments/devices/')) return json(200, { success: true });
  if (p === '/merchants/me/payments/alerts') return json(200, R2.alerts.body);

  // Onboarding
  if (p === '/onboarding/sessions') return json(201, { ...R2.createSession.body, role: body?.role });
  if (p.startsWith('/onboarding/reniec/')) return json(200, { full_name: 'CARLOS MENDOZA QUISPE' });
  if (p.endsWith('/merchant-identity')) return json(201, R2.identity.body);
  if (p.startsWith('/onboarding/merchant-kyc/') && p.endsWith('/verification')) return json(200, { provider: 'DEMO', url: null, status: 'IN_PROGRESS' });
  if (p.startsWith('/onboarding/merchant-kyc/') || p.startsWith('/kyc/requests/') && method === 'GET') {
    const b = R2.kyc.body;
    return json(200, { ...b, status: 'APPROVED', progress_pct: 100, result: { ...b.result, status: 'APPROVED', razon_social: 'SUPERMERCADOS PERUANOS S.A.', legal_rep_dni: '43872190' } });
  }
  if (p.startsWith('/kyc/requests/') && p.endsWith('/verification')) return json(200, { provider: 'DEMO', url: null, status: 'IN_PROGRESS' });
  if (p === '/kyc/requests') return json(201, R2.provKyc.body);
  if (p === '/businesses/confirm') return json(201, R2.biz.body);
  if (p === '/geo/reverse') return json(200, R2.geo.body);
  if (p === '/geo/ip-lookup') return json(200, { lat: -12.04, lng: -77.03, city: 'Lima' });
  if (p === '/geo/search') return json(200, []);
  if (p === '/credit/simulations') {
    const c = body?.purchase_cents ?? 30000, n = body?.installments ?? 3, dp = Math.round(c / 2), fin = c - dp, inst = Math.round((fin * 1.0998) / n);
    return json(200, { ...R2.sim.body, purchase_cents: c, down_payment_cents: dp, financed_cents: fin, installments_count: n, installment_cents: inst, total_repayment_cents: inst * n,
      schedule: Array.from({ length: n }, (_, i) => ({ number: i + 1, due_date: new Date(Date.now() + (i + 1) * 14 * 864e5).toISOString().slice(0, 10), amount_cents: inst })) });
  }
  if (p === '/merchants/me/sales' && method === 'POST') return json(201, R2.manualSale.body);
  if (p === '/merchants/me/notifications/preferences' && method === 'PUT') return json(200, R2.notifPut.body);
  if (p === '/merchants/me/notifications/seen') return json(200, { unread_count: 0 });
  if (p === '/credit/purchases' && method === 'POST') return json(201, { success: true, purchase_id: 'pur_demo' });

  // Lecturas grabadas
  const hit = R[p] ?? R[path];
  if (hit && method === 'GET') return json(hit.status, hit.body);
  if (p.startsWith('/kyc/business-lookup/')) return json(200, R['/kyc/business-lookup/20100070970'].body);

  // Cualquier otra escritura: éxito genérico
  if (method !== 'GET') return json(200, { success: true });
  return err(404, 'DEMO_NOT_MOCKED', `Sin dato de demo para ${p}`);
}

export function installMock() {
  const real = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const i = url.indexOf('/api/v1');
    if (i < 0) return real(input, init);
    let body: any = null;
    try { body = init.body ? JSON.parse(init.body as string) : null; } catch { /* sin cuerpo JSON */ }
    await new Promise((r) => setTimeout(r, 350)); // latencia creíble
    return handle((init.method || 'GET').toUpperCase(), url.slice(i + 7), body, (init.headers || {}) as Record<string, string>);
  };
}
