const TZ = 'America/Lima';

/** Día calendario (YYYY-MM-DD) de una fecha o instante, en hora de Lima. */
const limaDay = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: TZ });

/** "2026-11-07" -> "7 nov 2026". */
export function formatDay(iso: string | null | undefined): string {
  const day = String(iso ?? '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return '—';
  return new Date(`${day}T12:00:00-05:00`).toLocaleDateString('es-PE', { day: 'numeric', month: 'short', year: 'numeric', timeZone: TZ });
}

/** Días que faltan para una fecha (negativo = ya pasó), contando días de Lima. */
export function daysUntil(iso: string | null | undefined): number {
  const day = String(iso ?? '').slice(0, 10);
  const due = Date.parse(`${day}T00:00:00-05:00`);
  const today = Date.parse(`${limaDay(new Date())}T00:00:00-05:00`);
  return Number.isNaN(due) ? 0 : Math.round((due - today) / 864e5);
}

/** Texto de vencimiento: "Vence mañana · 12 nov 2026" o "Venció hace 4 días · 7 nov 2026". */
export function dueText(iso: string | null | undefined): { text: string; late: boolean } {
  const n = daysUntil(iso);
  const when = formatDay(iso);
  if (n < 0) return { text: `Venció hace ${-n} día${n === -1 ? '' : 's'} · ${when}`, late: true };
  if (n === 0) return { text: `Vence hoy · ${when}`, late: false };
  if (n === 1) return { text: `Vence mañana · ${when}`, late: false };
  return { text: `Vence el ${when} · en ${n} días`, late: false };
}

/** "noviembre 2026" (mes actual en Lima). */
export function monthLabel(): string {
  return new Date().toLocaleDateString('es-PE', { month: 'long', year: 'numeric', timeZone: TZ });
}
