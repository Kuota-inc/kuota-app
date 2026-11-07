// Avisos del Libro de Reclamaciones: copia al cliente, alerta a operaciones, respuesta y resumen de vencimientos.
import { db } from '../db/client.js';
import { esc, layout, mailEnabled, sendMail } from './mailer.js';

export interface ComplaintMailData {
  code: string;
  kind: string;
  full_name: string;
  email: string;
  phone: string;
  doc_type: string;
  doc_number: string;
  service?: string | null;
  description: string;
  request?: string | null;
  claim_amount_cents?: number | null;
  due_label: string;
}

const kindLabel = (k: string) => (k === 'QUEJA' ? 'queja' : 'reclamo');

/** Correo de operaciones: KUOTA_COMPLAINTS_EMAIL, o KUOTA_CONTACT_EMAIL si no se definió. */
export const opsEmail = () => process.env.KUOTA_COMPLAINTS_EMAIL || process.env.KUOTA_CONTACT_EMAIL || '';

/** Copia de la hoja al cliente (la ley exige entregarla) y alerta a operaciones. */
export async function notifyComplaintCreated(c: ComplaintMailData): Promise<{ customer: boolean; ops: boolean }> {
  const money = c.claim_amount_cents ? `S/ ${(c.claim_amount_cents / 100).toFixed(2)}` : '—';
  const customer = sendMail({
    to: c.email,
    subject: `Tu hoja de reclamación ${c.code} · Kuota`,
    html: layout(
      `Recibimos tu ${kindLabel(c.kind)}`,
      `<p>Hola ${esc(c.full_name)}, registramos tu hoja de reclamación.</p>
<p style="font-size:22px;font-weight:800;color:#0e9f6e;margin:14px 0">${esc(c.code)}</p>
<p>Te responderemos a este correo a más tardar el <b>${esc(c.due_label)}</b> (15 días hábiles).</p>
<table style="width:100%;border-collapse:collapse;font-size:14px;margin-top:14px">
<tr><td style="padding:6px 0;color:#5a6b8c">Tipo</td><td>${esc(kindLabel(c.kind))}</td></tr>
<tr><td style="padding:6px 0;color:#5a6b8c">Servicio</td><td>${esc(c.service || '—')}</td></tr>
<tr><td style="padding:6px 0;color:#5a6b8c">Monto reclamado</td><td>${esc(money)}</td></tr>
<tr><td style="padding:6px 0;color:#5a6b8c;vertical-align:top">Detalle</td><td>${esc(c.description)}</td></tr>
${c.request ? `<tr><td style="padding:6px 0;color:#5a6b8c;vertical-align:top">Tu pedido</td><td>${esc(c.request)}</td></tr>` : ''}
</table>
<p style="font-size:13px;color:#5a6b8c;margin-top:14px">Presentar este reclamo no impide acudir al INDECOPI u otras vías de solución de controversias.</p>`
    )
  });

  const ops = opsEmail();
  const opsMail = ops
    ? sendMail({
        to: ops,
        subject: `[Reclamo] ${c.code} · vence ${c.due_label}`,
        html: layout(
          `Nuevo ${kindLabel(c.kind)}: ${c.code}`,
          `<p><b>${esc(c.full_name)}</b> · ${esc(c.doc_type)} ${esc(c.doc_number)} · ${esc(c.phone)} · ${esc(c.email)}</p>
<p>Servicio: ${esc(c.service || '—')} · Monto: ${esc(money)}</p>
<p style="white-space:pre-wrap">${esc(c.description)}</p>
<p>Responder antes del <b>${esc(c.due_label)}</b> con <code>POST /api/v1/internal/complaints/${esc(c.code)}/respond</code>.</p>`
        )
      })
    : Promise.resolve(false);
  if (!ops) console.log(`[reclamo] ${c.code} registrado; define KUOTA_COMPLAINTS_EMAIL para avisar a operaciones`);

  const [a, b] = await Promise.all([customer, opsMail]);
  return { customer: a, ops: b };
}

/** Respuesta de la empresa al cliente. */
export async function notifyComplaintResponded(c: { code: string; full_name: string; email: string; response: string }): Promise<boolean> {
  return sendMail({
    to: c.email,
    subject: `Respuesta a tu hoja de reclamación ${c.code} · Kuota`,
    html: layout(
      `Respuesta a tu hoja ${c.code}`,
      `<p>Hola ${esc(c.full_name)}, esta es nuestra respuesta:</p>
<p style="white-space:pre-wrap;background:#f6f8ff;border:1px solid #e1e8f8;border-radius:10px;padding:12px 14px">${esc(c.response)}</p>
<p style="font-size:13px;color:#5a6b8c">Si no estás conforme, puedes acudir al INDECOPI.</p>`
    )
  });
}

/** Una vez al día: reclamos pendientes vencidos o que vencen en 2 días, a operaciones (y al log). */
let lastDigestDay = '';
export async function complaintsDigest(now = new Date()): Promise<number> {
  const day = now.toISOString().slice(0, 10);
  if (day === lastDigestDay) return 0;
  const limit = new Date(now.getTime() + 2 * 86400_000).toISOString();
  const rows = await db.all<{ code: string; kind: string; due_at: string; full_name: string }>(
    "SELECT code, kind, due_at, full_name FROM complaints WHERE status = 'RECEIVED' AND due_at <= ? ORDER BY due_at ASC LIMIT 50",
    limit
  );
  lastDigestDay = day;
  if (!rows.length) return 0;
  const overdue = rows.filter((r) => r.due_at < now.toISOString()).length;
  console.warn(`[reclamos] ${rows.length} por vencer o vencidos (${overdue} ya vencidos): ${rows.map((r) => r.code).join(', ')}`);
  const ops = opsEmail();
  if (ops && mailEnabled()) {
    await sendMail({
      to: ops,
      subject: `[Reclamos] ${rows.length} por vencer o vencidos`,
      html: layout(
        'Reclamos pendientes de respuesta',
        `<ul>${rows
          .map((r) => `<li><b>${esc(r.code)}</b> · ${esc(r.full_name)} · vence ${esc(new Date(r.due_at).toLocaleDateString('es-PE', { timeZone: 'America/Lima' }))}${r.due_at < now.toISOString() ? ' <b style="color:#d92d20">(VENCIDO)</b>' : ''}</li>`)
          .join('')}</ul>`
      )
    });
  }
  return rows.length;
}
