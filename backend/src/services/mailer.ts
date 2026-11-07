// Envío de correos transaccionales. Dos proveedores, en este orden:
//   1. SMTP:   KUOTA_SMTP_URL, p. ej. smtps://avisos%40kuota.pro:CLAVE@smtp.hostinger.com:465
//              (la clave y el @ del usuario van codificados en URL). KUOTA_MAIL_FROM: "Kuota <avisos@kuota.pro>".
//   2. Resend: RESEND_API_KEY (API HTTPS). KUOTA_MAIL_FROM exige un dominio verificado en Resend.
// Sin ninguno configurado no se envía nada: el aviso queda en el log del servidor.
import nodemailer, { type Transporter } from 'nodemailer';

export interface Mail {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
}

export const mailEnabled = () => !!(process.env.KUOTA_SMTP_URL || process.env.RESEND_API_KEY);

export const esc = (s: unknown) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/** Solo para pruebas: con KUOTA_SMTP_URL=json los correos se guardan aquí en vez de enviarse. */
export const testOutbox: { to: string[]; from: string; subject: string; html: string }[] = [];

let cached: { url: string; transport: Transporter } | null = null;
function smtpTransport(url: string): Transporter {
  if (cached?.url === url) return cached.transport;
  const transport =
    url === 'json'
      ? nodemailer.createTransport({ jsonTransport: true })
      : nodemailer.createTransport({ url, connectionTimeout: 8000, greetingTimeout: 8000, socketTimeout: 12000 });
  cached = { url, transport };
  return transport;
}

function fromAddress(): string {
  if (process.env.KUOTA_MAIL_FROM) return process.env.KUOTA_MAIL_FROM;
  const url = process.env.KUOTA_SMTP_URL;
  if (url && url !== 'json') {
    try {
      const user = decodeURIComponent(new URL(url).username);
      if (user.includes('@')) return `Kuota <${user}>`;
    } catch {
      /* URL inválida: se usa el remitente por defecto */
    }
  }
  return 'Kuota <onboarding@resend.dev>';
}

/** Devuelve true si el proveedor aceptó el correo. Nunca lanza: un fallo de correo no debe romper la operación. */
export async function sendMail(mail: Mail): Promise<boolean> {
  const to = (Array.isArray(mail.to) ? mail.to : [mail.to]).filter(Boolean);
  if (!to.length) return false;
  const smtp = process.env.KUOTA_SMTP_URL;
  const key = process.env.RESEND_API_KEY;
  if (!smtp && !key) {
    console.log(`[mail] sin proveedor configurado (KUOTA_SMTP_URL o RESEND_API_KEY); no se envió: "${mail.subject}"`);
    return false;
  }
  try {
    if (smtp) {
      const from = fromAddress();
      await smtpTransport(smtp).sendMail({ from, to, subject: mail.subject, html: mail.html, text: mail.text });
      if (smtp === 'json') testOutbox.push({ to, from, subject: mail.subject, html: mail.html });
      return true;
    }
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: fromAddress(), to, subject: mail.subject, html: mail.html, text: mail.text }),
      signal: AbortSignal.timeout(8000)
    });
    if (!res.ok) {
      console.error('[mail] el proveedor rechazó el correo', res.status, (await res.text()).slice(0, 200));
      return false;
    }
    return true;
  } catch (e) {
    console.error('[mail] error de envío', e instanceof Error ? e.message : e);
    return false;
  }
}

/** Plantilla simple y legible en cualquier cliente de correo. */
export function layout(title: string, bodyHtml: string): string {
  return `<div style="font-family:Segoe UI,Arial,sans-serif;max-width:560px;margin:0 auto;color:#0b1d4d">
<div style="background:#00248b;color:#fff;padding:18px 22px;border-radius:14px 14px 0 0;font-weight:800;font-size:18px">Kuota</div>
<div style="border:1px solid #e1e8f8;border-top:0;border-radius:0 0 14px 14px;padding:22px">
<h2 style="margin:0 0 12px;font-size:18px">${esc(title)}</h2>${bodyHtml}
<p style="color:#5a6b8c;font-size:12px;margin-top:22px">Este es un mensaje automático de Kuota.</p></div></div>`;
}
