// WhatsApp oficial de soporte. Se define al compilar con VITE_SUPPORT_WHATSAPP (solo dígitos con código de país,
// p. ej. 51999999999); si no se define se usa el número provisional.
const RAW = (import.meta.env.VITE_SUPPORT_WHATSAPP as string | undefined) ?? '51987654321';
export const SUPPORT_WHATSAPP = RAW.replace(/\D/g, '');

/** "51987654321" -> "+51 987 654 321" */
export function supportDisplay(): string {
  const d = SUPPORT_WHATSAPP;
  return d.length === 11 ? `+${d.slice(0, 2)} ${d.slice(2, 5)} ${d.slice(5, 8)} ${d.slice(8)}` : `+${d}`;
}

/** Enlace de WhatsApp con el mensaje pre-llenado. */
export function whatsappLink(message: string): string {
  return `https://wa.me/${SUPPORT_WHATSAPP}?text=${encodeURIComponent(message)}`;
}
