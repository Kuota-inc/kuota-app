// Notificaciones del comercio: preferencias push, "no leídas" de la campana
// del Home y recordatorio del próximo taller.
import { db } from '../db/database.js';

// Todavía no hay bandeja de avisos: no se inventan "no leídos" (antes siempre aparecían 2 con punto rojo).
export const UNREAD_DEMO_COUNT = 0;

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

async function prefs(merchantId: string): Promise<PrefRow> {
  return (
    (await db.prepare('SELECT push_enabled, last_seen_at FROM notification_preferences WHERE merchant_id = ?')
      .get(merchantId) as PrefRow | undefined) ?? { push_enabled: 1, last_seen_at: null }
  );
}

export async function unreadCount(merchantId: string): Promise<number> {
  return (await prefs(merchantId)).last_seen_at ? 0 : UNREAD_DEMO_COUNT;
}

export async function getNotificationState(merchantId: string) {
  const p = await prefs(merchantId);
  const workshop = nextWorkshop();
  const reminder = await db
    .prepare('SELECT 1 FROM workshop_reminders WHERE merchant_id = ? AND workshop_id = ?')
    .get(merchantId, workshop.id);
  return {
    push_enabled: p.push_enabled === 1,
    unread_count: p.last_seen_at ? 0 : UNREAD_DEMO_COUNT,
    workshop: { ...workshop, reminder_set: !!reminder }
  };
}

export async function markSeen(merchantId: string) {
  await db.prepare(`
    INSERT INTO notification_preferences (merchant_id, last_seen_at)
    VALUES (?, utc_now_text())
    ON CONFLICT(merchant_id) DO UPDATE SET last_seen_at = utc_now_text()
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

export async function savePreferences(merchantId: string, input: PreferencesInput) {
  const workshopId = nextWorkshop().id;
  await db.transaction(async () => {
    await db.prepare(`
      INSERT INTO notification_preferences (merchant_id, push_enabled, last_seen_at, updated_at)
      VALUES (?, ?, utc_now_text(), utc_now_text())
      ON CONFLICT(merchant_id) DO UPDATE SET
        push_enabled = excluded.push_enabled,
        last_seen_at = COALESCE(notification_preferences.last_seen_at, excluded.last_seen_at),
        updated_at = excluded.updated_at
    `).run(merchantId, input.push_enabled ? 1 : 0);
    if (input.workshop_reminder) {
      await db.prepare('INSERT INTO workshop_reminders (merchant_id, workshop_id) VALUES (?, ?) ON CONFLICT DO NOTHING')
        .run(merchantId, workshopId);
    } else {
      await db.prepare('DELETE FROM workshop_reminders WHERE merchant_id = ? AND workshop_id = ?')
        .run(merchantId, workshopId);
    }
  })();
  return getNotificationState(merchantId);
}
