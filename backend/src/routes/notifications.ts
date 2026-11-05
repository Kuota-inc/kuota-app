// Notificaciones del comercio: preferencias push, "no leídas" de la campana
// del Home y recordatorio del próximo taller.
import { db } from '../db/database.js';

export const UNREAD_DEMO_COUNT = 2;

/** Próximo taller: mañana a las 19:00 hora de Lima (UTC-5, sin horario de verano). */
export function nextWorkshop(now = new Date()) {
  const LIMA_OFFSET_H = -5;
  const lima = new Date(now.getTime() + LIMA_OFFSET_H * 3600_000);
  const startsUtc = Date.UTC(lima.getUTCFullYear(), lima.getUTCMonth(), lima.getUTCDate() + 1, 19 - LIMA_OFFSET_H);
  return {
    id: 'wk_sunat_formalizacion',
    title: 'Mentorías y Formalización: Cómo declarar tus ingresos ante SUNAT sin enredos',
    speaker: 'Especialista Contable B2B',
    channel: 'Vía Zoom',
    seats_note: 'Cupos limitados',
    starts_at: new Date(startsUtc).toISOString(),
    free_for_clients: true
  };
}

type PrefRow = { push_enabled: number; last_seen_at: string | null };

function prefs(merchantId: string): PrefRow {
  return (
    (db.prepare('SELECT push_enabled, last_seen_at FROM notification_preferences WHERE merchant_id = ?')
      .get(merchantId) as PrefRow | undefined) ?? { push_enabled: 1, last_seen_at: null }
  );
}

export function unreadCount(merchantId: string): number {
  return prefs(merchantId).last_seen_at ? 0 : UNREAD_DEMO_COUNT;
}

export function getNotificationState(merchantId: string) {
  const p = prefs(merchantId);
  const workshop = nextWorkshop();
  const reminder = db
    .prepare('SELECT 1 FROM workshop_reminders WHERE merchant_id = ? AND workshop_id = ?')
    .get(merchantId, workshop.id);
  return {
    push_enabled: p.push_enabled === 1,
    unread_count: p.last_seen_at ? 0 : UNREAD_DEMO_COUNT,
    workshop: { ...workshop, reminder_set: !!reminder }
  };
}

export function markSeen(merchantId: string) {
  db.prepare(`
    INSERT INTO notification_preferences (merchant_id, last_seen_at)
    VALUES (?, datetime('now'))
    ON CONFLICT(merchant_id) DO UPDATE SET last_seen_at = datetime('now')
  `).run(merchantId);
}

export type PreferencesInput = { push_enabled: boolean; workshop_reminder: boolean };

/** Valida el cuerpo del PUT; devuelve un mensaje de error o los valores. */
export function parsePreferences(body: any): PreferencesInput | string {
  if (!body || typeof body !== 'object') return 'Cuerpo JSON requerido.';
  const { push_enabled, workshop_reminder } = body;
  if (typeof push_enabled !== 'boolean') return 'push_enabled debe ser booleano.';
  if (typeof workshop_reminder !== 'boolean') return 'workshop_reminder debe ser booleano.';
  return { push_enabled, workshop_reminder };
}

export function savePreferences(merchantId: string, input: PreferencesInput) {
  const workshopId = nextWorkshop().id;
  db.transaction(() => {
    db.prepare(`
      INSERT INTO notification_preferences (merchant_id, push_enabled, last_seen_at, updated_at)
      VALUES (?, ?, datetime('now'), datetime('now'))
      ON CONFLICT(merchant_id) DO UPDATE SET
        push_enabled = excluded.push_enabled,
        last_seen_at = COALESCE(notification_preferences.last_seen_at, excluded.last_seen_at),
        updated_at = excluded.updated_at
    `).run(merchantId, input.push_enabled ? 1 : 0);
    if (input.workshop_reminder) {
      db.prepare('INSERT OR IGNORE INTO workshop_reminders (merchant_id, workshop_id) VALUES (?, ?)')
        .run(merchantId, workshopId);
    } else {
      db.prepare('DELETE FROM workshop_reminders WHERE merchant_id = ? AND workshop_id = ?')
        .run(merchantId, workshopId);
    }
  })();
  return getNotificationState(merchantId);
}
