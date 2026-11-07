// Envío de correos transaccionales por la API HTTPS de Resend (sin dependencias).
// Activar con RESEND_API_KEY y, ya con dominio verificado, KUOTA_MAIL_FROM ("Kuota <avisos@tu-dominio>").
// Sin RESEND_API_KEY no se envía nada: el aviso queda en el log del servidor.
export interface Mail {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
}

export const mailEnabled = () => !!process.env.RESEND_API_KEY;

export const esc = (s: unknown) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/** Devuelve true si el proveedor aceptó el correo. Nunca lanza: un fallo de correo no debe romper la operación. */
export async function sendMail(mail: Mail): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  const to = (Array.isArray(mail.to) ? mail.to : [mail.to]).filter(Boolean);
  if (!to.length) return false;
  if (!key) {
    console.log(`[mail] sin proveedor configurado (RESEND_API_KEY); no se envió: "${mail.subject}"`);
    return false;
  }
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: process.env.KUOTA_MAIL_FROM || 'Kuota <onboarding@resend.dev>',
        to,
        subject: mail.subject,
        html: mail.html,
        text: mail.text
      }),
      signal: AbortSignal.timeout(8000)
    });
    if (!res.ok) {
      console.error('[mail] el proveedor rechazó el correo', res.status, (await res.text()).slice(0, 200));
      return false;
    }
    return true;
  } catch (e) {
    console.error('[mail] error de red', e instanceof Error ? e.message : e);
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
