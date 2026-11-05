// Utilidades de tiempo. Las columnas nuevas guardan ISO-8601 en UTC; las
// heredadas con DEFAULT datetime('now') usan 'YYYY-MM-DD HH:MM:SS' (también UTC).

export const nowIso = (now = new Date()) => now.toISOString();

export const addMinutes = (date: Date, minutes: number) => new Date(date.getTime() + minutes * 60_000);
export const addHours = (date: Date, hours: number) => addMinutes(date, hours * 60);

/** Formato de datetime('now') de SQLite, para comparar con columnas heredadas. */
export function sqlTime(date: Date): string {
  return date.toISOString().slice(0, 19).replace('T', ' ');
}

/** Interpreta tanto ISO como el formato de SQLite (ambos en UTC). */
export function parseTime(value: string | null | undefined): Date | null {
  if (!value) return null;
  const iso = value.includes('T') ? value : `${value.replace(' ', 'T')}Z`;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

const LIMA_OFFSET_H = -5; // Perú no usa horario de verano

/** Inicio del día calendario de Lima (en UTC) que contiene `now`. */
export function limaDayStart(now = new Date()): Date {
  const lima = new Date(now.getTime() + LIMA_OFFSET_H * 3600_000);
  return new Date(Date.UTC(lima.getUTCFullYear(), lima.getUTCMonth(), lima.getUTCDate(), -LIMA_OFFSET_H));
}

export function limaHour(now = new Date()): number {
  return new Date(now.getTime() + LIMA_OFFSET_H * 3600_000).getUTCHours();
}

/** 'YYYY-MM-DD' del día de Lima. */
export function limaDate(now = new Date()): string {
  return new Date(now.getTime() + LIMA_OFFSET_H * 3600_000).toISOString().slice(0, 10);
}

/** '6 nov., 9:03 a. m.' en hora de Lima. */
export function formatLimaDateTime(iso: string): string {
  return new Date(iso).toLocaleString('es-PE', { timeZone: 'America/Lima', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
}

export function formatSoles(cents: number): string {
  return `S/ ${(cents / 100).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
