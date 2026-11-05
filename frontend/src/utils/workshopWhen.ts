// Etiqueta relativa de fecha y hora de un taller, siempre en hora de Lima.

const LIMA = 'America/Lima';

/** "Hoy 7:00 PM", "Mañana 7:00 PM" o "Jue 6 nov · 7:00 PM", siempre en hora de Lima. */
export function workshopWhen(startsAt: string, now = new Date()): string {
  const start = new Date(startsAt);
  if (Number.isNaN(start.getTime())) return '';
  const day = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: LIMA }).format(d);
  const time = new Intl.DateTimeFormat('es-PE', { timeZone: LIMA, hour: 'numeric', minute: '2-digit', hour12: true })
    .format(start)
    .replace(/\s*a\.?\s*m\.?/i, ' AM')
    .replace(/\s*p\.?\s*m\.?/i, ' PM');
  const diffDays = Math.round((Date.parse(day(start)) - Date.parse(day(now))) / 86_400_000);
  if (diffDays === 0) return `Hoy ${time}`;
  if (diffDays === 1) return `Mañana ${time}`;
  const label = new Intl.DateTimeFormat('es-PE', { timeZone: LIMA, weekday: 'short', day: 'numeric', month: 'short' })
    .format(start)
    .replace(/[.,]/g, '');
  return `${label.charAt(0).toUpperCase()}${label.slice(1)} · ${time}`;
}
