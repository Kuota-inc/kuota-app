// Páginas legales públicas (Privacidad, Términos) y Libro de Reclamaciones virtual.
//   GET  /legal/privacidad   GET /legal/terminos   GET /reclamaciones
//   POST /api/v1/complaints  (registra el reclamo o queja y devuelve el número de hoja)
// Datos de la empresa (razón social, RUC, domicilio, correo) salen de variables de entorno:
// KUOTA_COMPANY_NAME, KUOTA_COMPANY_RUC, KUOTA_COMPANY_ADDRESS, KUOTA_CONTACT_EMAIL.
import { Router, type Request, type Response } from 'express';
import { db } from '../db/database.js';
import { randomId } from '../security/crypto.js';
import { rateLimit } from '../security/guards.js';
import { fail } from '../security/http.js';

export const legalRouter = Router();

const company = () => ({
  name: process.env.KUOTA_COMPANY_NAME || 'Kuota',
  ruc: process.env.KUOTA_COMPANY_RUC || '',
  address: process.env.KUOTA_COMPANY_ADDRESS || '',
  email: process.env.KUOTA_CONTACT_EMAIL || ''
});

const esc = (s: unknown) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const STYLE = `
:root{--brand:#00248b;--brand2:#1a3bb0;--ink:#0b1d4d;--mut:#5a6b8c;--line:#e1e8f8}
*{box-sizing:border-box}
body{margin:0;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;color:var(--ink);background:#f4f7ff;line-height:1.6}
header{background:linear-gradient(150deg,var(--brand),var(--brand2));color:#fff;padding:22px 20px 26px}
header .brand{display:flex;align-items:center;gap:9px;font-weight:800;font-size:19px}
header .brand i{width:32px;height:32px;border-radius:10px;background:rgba(255,255,255,.18);display:flex;align-items:center;justify-content:center;font-style:normal}
header h1{font-size:22px;margin:14px 0 2px}
header p{margin:0;opacity:.9;font-size:13px;color:#fff}
main{max-width:760px;margin:-14px auto 40px;background:#fff;border-radius:20px 20px 16px 16px;padding:22px 20px 28px;box-shadow:0 10px 30px rgba(0,36,139,.08)}
h2{font-size:16px;color:var(--brand);margin:22px 0 6px}
p,li{font-size:14.5px;color:#24324f}
ul{padding-left:20px}
a{color:var(--brand2)}
.note{background:#eef3ff;border:1px solid var(--line);border-radius:12px;padding:10px 14px;font-size:13px;color:var(--mut)}
label{display:block;font-size:13px;font-weight:700;margin:14px 0 5px}
input,select,textarea{width:100%;font:inherit;font-size:15px;padding:12px 13px;border:1.5px solid var(--line);border-radius:12px;background:#fff;color:var(--ink)}
input:focus,select:focus,textarea:focus{outline:none;border-color:var(--brand2);box-shadow:0 0 0 3px rgba(26,59,176,.12)}
textarea{min-height:110px;resize:vertical}
.row{display:grid;grid-template-columns:1fr 1fr;gap:12px}
@media(max-width:520px){.row{grid-template-columns:1fr}}
button{margin-top:20px;width:100%;border:0;border-radius:14px;padding:15px;font:inherit;font-weight:800;font-size:16px;color:#fff;background:linear-gradient(135deg,var(--brand),var(--brand2));cursor:pointer}
button:disabled{opacity:.6;cursor:progress}
.err{display:none;margin-top:14px;background:#fef3f2;border:1px solid #fecdca;color:#b42318;border-radius:12px;padding:10px 12px;font-size:13.5px}
.ok{text-align:center;padding:10px 0}
.ok .code{display:inline-block;margin:10px 0;font-size:22px;font-weight:800;letter-spacing:1px;background:#e7f8f1;color:#0e9f6e;border-radius:12px;padding:8px 18px}
footer{text-align:center;font-size:12px;color:var(--mut);padding:0 20px 30px}
`;

function page(title: string, subtitle: string, body: string, extraScript = ''): string {
  return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="theme-color" content="#00248b"><title>${esc(title)} · Kuota</title><style>${STYLE}</style></head><body>
<header><div class="brand"><i>K</i>Kuota</div><h1>${esc(title)}</h1><p>${esc(subtitle)}</p></header>
<main>${body}</main>
<footer>© ${new Date().getFullYear()} Kuota · <a href="/legal/privacidad">Privacidad</a> · <a href="/legal/terminos">Términos</a> · <a href="/reclamaciones">Libro de Reclamaciones</a></footer>
${extraScript ? `<script>${extraScript}</script>` : ''}</body></html>`;
}

function send(res: Response, html: string) {
  res.removeHeader('Content-Security-Policy');
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'");
  res.setHeader('Cache-Control', 'public, max-age=300');
  res.type('html').send(html);
}

function contactLine(): string {
  const c = company();
  const parts = [c.email ? `correo <a href="mailto:${esc(c.email)}">${esc(c.email)}</a>` : '', 'el <a href="/reclamaciones">Libro de Reclamaciones virtual</a>'].filter(Boolean);
  return parts.join(' o por ');
}

// ----------------------------------------------------------------------------- Privacidad
legalRouter.get('/legal/privacidad', (_req: Request, res: Response) => {
  const c = company();
  const who = `${esc(c.name)}${c.ruc ? ` (RUC ${esc(c.ruc)})` : ''}${c.address ? `, con domicilio en ${esc(c.address)}` : ''}`;
  send(
    res,
    page(
      'Política de Privacidad',
      'Tratamiento de datos personales · Ley 29733 y su Reglamento (DS 016-2024-JUS) · Versión 2026.1',
      `<p>${who}, es el <b>titular del banco de datos personales</b> y responsable del tratamiento de los datos que recoge a través de la app y el sitio de Kuota.</p>
<h2>1. Datos que tratamos</h2>
<ul>
<li><b>Identificación:</b> nombres, DNI, RUC, fecha y datos de verificación de identidad.</li>
<li><b>Contacto:</b> número de celular, correo electrónico y, si lo autorizas, ubicación del negocio.</li>
<li><b>Verificación (KYC):</b> imagen del documento, selfie y prueba de vida, procesados por un proveedor de verificación de identidad.</li>
<li><b>Financieros y comerciales:</b> ventas, cobros, cuentas de abono (CCI), línea de crédito, cuotas, historial de pagos y score.</li>
<li><b>Técnicos y de seguridad:</b> identificador y tipo de dispositivo, dirección IP, registros de acceso y de operaciones.</li>
</ul>
<h2>2. Para qué los usamos (finalidades)</h2>
<ul>
<li>Crear y administrar tu cuenta, verificar tu identidad y prevenir fraude y lavado de activos.</li>
<li>Evaluar y otorgar tu línea de crédito, calcular tu score y gestionar cobranzas.</li>
<li>Emitir links y QR de cobro, procesar pagos y conciliar abonos.</li>
<li>Cumplir obligaciones legales y atender requerimientos de autoridades.</li>
<li>Atender consultas, reclamos y brindar soporte.</li>
</ul>
<p>El uso de tus datos para <b>ofertas comerciales o publicidad</b> requiere tu consentimiento separado y puedes retirarlo en cualquier momento.</p>
<h2>3. Base legal y consentimiento</h2>
<p>Tratamos tus datos con tu <b>consentimiento libre, previo, expreso, informado e inequívoco</b> al registrarte, y sin necesidad de este cuando es indispensable para ejecutar la relación contractual o cumplir una obligación legal.</p>
<h2>4. Destinatarios y encargados</h2>
<p>Para prestar el servicio compartimos datos con proveedores que actúan como <b>encargados de tratamiento</b>: pasarelas y procesadores de pago, verificación de identidad, alojamiento en la nube y mensajería. Solo reciben lo necesario y están obligados a protegerlo. Podemos entregar información a autoridades competentes cuando la ley lo exija.</p>
<h2>5. Transferencias internacionales</h2>
<p>Algunos proveedores pueden almacenar o tratar datos fuera del Perú. En ese caso exigimos garantías de protección adecuadas conforme a la normativa peruana.</p>
<h2>6. Plazo de conservación</h2>
<p>Conservamos tus datos mientras mantengas una relación con Kuota y, después, por los plazos exigidos por la normativa financiera, tributaria y de prevención de lavado de activos. Luego se eliminan o anonimizan.</p>
<h2>7. Seguridad</h2>
<p>Aplicamos medidas técnicas y organizativas: PIN almacenado con hash robusto, sesiones cortas ligadas al dispositivo, cifrado en tránsito, control de acceso por privilegio mínimo y bitácora inmutable de operaciones. En caso de incidente que afecte tus datos, notificaremos a la Autoridad Nacional de Protección de Datos Personales y a las personas afectadas en el plazo legal.</p>
<h2>8. Tus derechos (ARCO y portabilidad)</h2>
<p>Puedes ejercer en cualquier momento tus derechos de <b>acceso, rectificación, cancelación, oposición</b> y <b>portabilidad</b>, y revocar tu consentimiento. Escríbenos por ${contactLine()}; responderemos dentro del plazo legal. Si consideras que no se atendió tu solicitud, puedes acudir a la Autoridad Nacional de Protección de Datos Personales (Ministerio de Justicia y Derechos Humanos).</p>
<h2>9. Decisiones automatizadas</h2>
<p>El score y el límite de tu línea de crédito se calculan con apoyo de procesos automatizados. Puedes solicitar la revisión de una decisión que te afecte.</p>
<h2>10. Cambios</h2>
<p>Si actualizamos esta política te lo comunicaremos en la app. Versión vigente: <b>2026.1</b>.</p>`
    )
  );
});

// ------------------------------------------------------------------------------ Términos
legalRouter.get('/legal/terminos', (_req: Request, res: Response) => {
  const c = company();
  send(
    res,
    page(
      'Términos y Condiciones',
      'Servicio Kuota · Versión 2026.1',
      `<p>Estos términos regulan el uso de la app y los servicios de ${esc(c.name)}${c.ruc ? ` (RUC ${esc(c.ruc)})` : ''}. Al registrarte aceptas estas condiciones y la <a href="/legal/privacidad">Política de Privacidad</a>.</p>
<h2>1. El servicio</h2>
<p>Kuota ofrece a comercios y proveedores: (a) herramientas para registrar ventas y emitir <b>links y QR de cobro</b>, y (b) una <b>línea de crédito</b> para comprar mercadería a proveedores afiliados y pagar en cuotas.</p>
<h2>2. Tu cuenta y tu PIN</h2>
<ul>
<li>Debes ser mayor de edad y brindar información veraz. Podemos pedirte verificar tu identidad.</li>
<li>Tu <b>PIN de 6 dígitos es personal e intransferible</b>. Kuota nunca te lo pedirá por llamada, WhatsApp ni mensaje.</li>
<li>Eres responsable de las operaciones autorizadas con tu PIN. Si sospechas un uso no autorizado, cambia tu PIN, desvincula el dispositivo y escríbenos de inmediato.</li>
</ul>
<h2>3. Cobros</h2>
<p>Los links de cobro tienen monto, titular y vencimiento fijos. La tarifa del servicio se te informa antes de cada cobro. Kuota puede retener o rechazar operaciones que considere riesgosas para prevenir fraude, y aplicar límites por nivel de verificación.</p>
<h2>4. Crédito</h2>
<ul>
<li>Antes de confirmar una compra se muestran el <b>monto financiado, el interés total, el total a pagar, el cronograma y la TEA/TCEA</b>.</li>
<li>La línea y su nivel dependen de tu verificación y de tu comportamiento de pago, y pueden cambiar.</li>
<li>Solo puedes tener una compra a crédito activa a la vez. Puedes pagar anticipadamente.</li>
<li>El incumplimiento de pago puede generar intereses moratorios, reporte a centrales de riesgo y la suspensión de tu línea, conforme a la ley.</li>
</ul>
<h2>5. Uso permitido</h2>
<p>No puedes usar Kuota para actividades ilícitas, lavado de activos, fraude, suplantación de identidad ni para vulnerar la seguridad del servicio. Podemos suspender o cerrar cuentas que incumplan estos términos.</p>
<h2>6. Prevención de lavado de activos</h2>
<p>Estamos obligados a conocer a nuestros clientes y monitorear operaciones; podemos solicitar información adicional y reportar operaciones sospechosas a las autoridades.</p>
<h2>7. Responsabilidad</h2>
<p>Hacemos esfuerzos razonables para mantener el servicio disponible. Kuota no responde por interrupciones de terceros (redes, bancos, billeteras, pasarelas) ni por operaciones autorizadas por ti con tu PIN.</p>
<h2>8. Reclamos</h2>
<p>Puedes presentar un reclamo o queja en el <a href="/reclamaciones">Libro de Reclamaciones virtual</a>. Responderemos en un plazo máximo de <b>15 días hábiles</b>.</p>
<h2>9. Ley aplicable</h2>
<p>Estos términos se rigen por las leyes del Perú. Versión vigente: <b>2026.1</b>.</p>`
    )
  );
});

// ---------------------------------------------------------------------- Libro de Reclamaciones
const FORM_SCRIPT = `
(function(){
var f=document.getElementById("f"),err=document.getElementById("err"),btn=document.getElementById("send");
f.addEventListener("submit",function(e){
  e.preventDefault();err.style.display="none";btn.disabled=true;btn.textContent="Enviando...";
  var d={};new FormData(f).forEach(function(v,k){d[k]=v});
  fetch("/api/v1/complaints",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(d)})
  .then(function(r){return r.json().then(function(j){return{s:r.status,j:j}})})
  .then(function(x){
    if(x.s===201){
      document.querySelector("main").innerHTML='<div class="ok"><h2>Hoja de reclamación registrada</h2><div class="code">'+x.j.code+'</div><p>Guarda este número. Responderemos al correo que indicaste a más tardar el <b>'+x.j.due_date_label+'</b> (15 días hábiles).</p><p><a href="/reclamaciones">Registrar otro</a></p></div>';
      window.scrollTo(0,0);
    }else{
      err.textContent=(x.j&&x.j.error&&x.j.error.message)||"No pudimos registrar tu reclamo. Inténtalo de nuevo.";err.style.display="block";
      btn.disabled=false;btn.textContent="Enviar hoja de reclamación";
    }
  })
  .catch(function(){err.textContent="Error de red. Revisa tu conexión e inténtalo de nuevo.";err.style.display="block";btn.disabled=false;btn.textContent="Enviar hoja de reclamación"});
});
})();
`;

legalRouter.get('/reclamaciones', (_req: Request, res: Response) => {
  const c = company();
  send(
    res,
    page(
      'Libro de Reclamaciones',
      'Hoja de reclamación virtual · Ley 29571 (Código de Protección y Defensa del Consumidor)',
      `<div class="note"><b>${esc(c.name)}</b>${c.ruc ? ` · RUC ${esc(c.ruc)}` : ''}${c.address ? ` · ${esc(c.address)}` : ''}<br>
<b>Reclamo:</b> disconformidad con el servicio o producto. <b>Queja:</b> malestar por la atención, sin relación con el servicio. Responderemos en un máximo de <b>15 días hábiles</b>.</div>
<form id="f" autocomplete="on">
<label for="kind">Tipo</label>
<select id="kind" name="kind" required><option value="RECLAMO">Reclamo</option><option value="QUEJA">Queja</option></select>
<label for="full_name">Nombre completo</label>
<input id="full_name" name="full_name" required minlength="3" maxlength="120" autocomplete="name">
<div class="row">
<div><label for="doc_type">Documento</label><select id="doc_type" name="doc_type"><option value="DNI">DNI</option><option value="CE">Carné de extranjería</option><option value="RUC">RUC</option></select></div>
<div><label for="doc_number">Número</label><input id="doc_number" name="doc_number" required inputmode="numeric" maxlength="12"></div>
</div>
<div class="row">
<div><label for="phone">Celular</label><input id="phone" name="phone" required inputmode="numeric" maxlength="9" placeholder="9XXXXXXXX" autocomplete="tel"></div>
<div><label for="email">Correo electrónico</label><input id="email" name="email" type="email" required maxlength="120" autocomplete="email"></div>
</div>
<label for="address">Domicilio (opcional)</label>
<input id="address" name="address" maxlength="160" autocomplete="street-address">
<label for="service">Servicio relacionado</label>
<select id="service" name="service"><option value="Cobros y links de pago">Cobros y links de pago</option><option value="Línea de crédito y cuotas">Línea de crédito y cuotas</option><option value="Cuenta, PIN y seguridad">Cuenta, PIN y seguridad</option><option value="Verificación de identidad">Verificación de identidad</option><option value="Otro">Otro</option></select>
<label for="claim_amount">Monto reclamado en S/ (opcional)</label>
<input id="claim_amount" name="claim_amount" inputmode="decimal" maxlength="12" placeholder="0.00">
<label for="description">Detalle del reclamo o queja</label>
<textarea id="description" name="description" required minlength="10" maxlength="2000"></textarea>
<label for="request">¿Qué solución esperas? (opcional)</label>
<textarea id="request" name="request" maxlength="1000" style="min-height:70px"></textarea>
<p class="note" style="margin-top:14px">La formulación del reclamo no impide acudir a otras vías de solución de controversias ni es requisito previo para interponer una denuncia ante el INDECOPI. Tus datos se tratan según nuestra <a href="/legal/privacidad">Política de Privacidad</a>.</p>
<div class="err" id="err"></div>
<button type="submit" id="send">Enviar hoja de reclamación</button>
</form>`,
      FORM_SCRIPT
    )
  );
});

// --------------------------------------------------------------------------- registro (API)
/** Suma días hábiles (lunes a viernes; no considera feriados). */
export function addBusinessDays(from: Date, days: number): Date {
  const d = new Date(from);
  let left = days;
  while (left > 0) {
    d.setUTCDate(d.getUTCDate() + 1);
    const wd = d.getUTCDay();
    if (wd !== 0 && wd !== 6) left -= 1;
  }
  return d;
}

const dateLabel = (d: Date) => d.toLocaleDateString('es-PE', { timeZone: 'America/Lima', day: 'numeric', month: 'long', year: 'numeric' });

legalRouter.post('/api/v1/complaints', rateLimit({ name: 'complaints', windowMs: 10 * 60_000, max: 5 }), async (req: Request, res: Response) => {
  const b = (req.body ?? {}) as Record<string, unknown>;
  const str = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max) : '');
  const kind = b.kind === 'QUEJA' ? 'QUEJA' : b.kind === 'RECLAMO' ? 'RECLAMO' : '';
  const fullName = str(b.full_name, 120);
  const docType = ['DNI', 'CE', 'RUC'].includes(String(b.doc_type)) ? String(b.doc_type) : 'DNI';
  const docNumber = str(b.doc_number, 12).replace(/\D/g, '');
  const phone = str(b.phone, 9).replace(/\D/g, '');
  const email = str(b.email, 120).toLowerCase();
  const description = str(b.description, 2000);
  const request = str(b.request, 1000);
  const address = str(b.address, 160);
  const service = str(b.service, 80);
  const amountRaw = str(b.claim_amount, 12).replace(',', '.');
  const amount = amountRaw ? Number(amountRaw) : null;

  if (!kind) return fail(res, 422, 'KIND_INVALID', 'Elige si es un reclamo o una queja.');
  if (fullName.length < 3) return fail(res, 422, 'NAME_INVALID', 'Ingresa tu nombre completo.');
  const docOk = docType === 'DNI' ? docNumber.length === 8 : docType === 'RUC' ? docNumber.length === 11 : docNumber.length >= 6;
  if (!docOk) return fail(res, 422, 'DOC_INVALID', 'Revisa el número de tu documento.');
  if (phone.length !== 9) return fail(res, 422, 'PHONE_INVALID', 'Ingresa un celular de 9 dígitos.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return fail(res, 422, 'EMAIL_INVALID', 'Ingresa un correo válido para enviarte la respuesta.');
  if (description.length < 10) return fail(res, 422, 'DESCRIPTION_INVALID', 'Cuéntanos con más detalle qué ocurrió.');
  if (amount !== null && (!Number.isFinite(amount) || amount < 0 || amount > 10_000_000)) return fail(res, 422, 'AMOUNT_INVALID', 'El monto reclamado no es válido.');

  const now = new Date();
  const due = addBusinessDays(now, 15);
  const id = randomId('cmp', 8);
  let code = '';
  for (let attempt = 0; attempt < 5 && !code; attempt++) {
    const candidate = `HR-${now.getUTCFullYear()}-${String(Math.floor(Math.random() * 1_000_000)).padStart(6, '0')}`;
    const inserted = await db.run(
      `INSERT INTO complaints (id, code, kind, full_name, doc_type, doc_number, phone, email, address, service, claim_amount_cents, description, request, merchant_id, status, created_at, due_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'RECEIVED', ?, ?) ON CONFLICT (code) DO NOTHING`,
      id, candidate, kind, fullName, docType, docNumber, phone, email, address || null, service || null,
      amount === null ? null : Math.round(amount * 100), description, request || null,
      typeof req.headers['x-merchant-id'] === 'string' ? String(req.headers['x-merchant-id']).slice(0, 40) : null,
      now.toISOString(), due.toISOString()
    );
    if (inserted.changes) code = candidate;
  }
  if (!code) return fail(res, 503, 'TRY_AGAIN', 'No pudimos registrar tu hoja ahora. Inténtalo de nuevo.');
  res.status(201).json({ code, kind, due_at: due.toISOString(), due_date_label: dateLabel(due) });
});
