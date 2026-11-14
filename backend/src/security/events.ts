// Eventos del ciclo de vida del cobro (solo agregado), alertas al comercio y
// interruptores de funciones para respuesta a incidentes.
import type { NextFunction, Request, Response } from 'express';
import { paymentsDb as db } from '../db/client.js';
import { randomId } from './crypto.js';
import { fail } from './http.js';

export type PaymentEventType =
  | 'CREATED'
  | 'HELD_FOR_REVIEW'
  | 'RELEASED'
  | 'ISSUED'
  | 'CANCELLED'
  | 'EXPIRED'
  | 'PAID'
  | 'PAYMENT_REJECTED'
  | 'TAMPER_DETECTED';

export async function paymentEvent(linkId: string, type: PaymentEventType, data: Record<string, unknown> = {}) {
  await db.prepare('INSERT INTO payment_events (link_id, type, data_json, created_at) VALUES (?, ?, ?, ?)').run(
    linkId,
    type,
    JSON.stringify(data),
    new Date().toISOString()
  );
}

export type AlertKind =
  | 'LINK_CREATED'
  | 'LINK_HELD'
  | 'PAYMENT_RECEIVED'
  | 'PAYMENT_REJECTED'
  | 'NEW_DEVICE'
  | 'DEVICE_REVOKED'
  | 'PIN_CHANGED'
  | 'PIN_LOCKED'
  | 'LIMITS_CHANGED'
  | 'SECURITY';

// Tipos de alerta que se reenvían también por canal externo (WhatsApp Business / push).
const EXTERNAL_ALERT_KINDS = new Set<AlertKind>(['PIN_LOCKED', 'PIN_CHANGED', 'NEW_DEVICE', 'DEVICE_REVOKED', 'SECURITY']);

/**
 * P1-2: entrega por canal externo (fire-and-forget).
 * El receptor (Make.com, Zapier, Twilio…) maneja WhatsApp Business o push.
 * Nunca lanza: un fallo de entrega no debe bloquear el flujo principal.
 */
function sendExternalAlert(entityType: 'MERCHANT' | 'PROVIDER', entityId: string, kind: string, title: string, body: string | undefined) {
  const url = process.env.KUOTA_ALERT_WEBHOOK_URL;
  if (!url) return;
  const payload = JSON.stringify({ entity_type: entityType, entity_id: entityId, kind, title, body: body ?? null, ts: new Date().toISOString() });
  fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: payload }).catch(() => { /* silencioso */ });
}

/**
 * Alerta al comercio. Queda registrada en BD; los eventos de seguridad
 * críticos se reenvían también al canal externo (KUOTA_ALERT_WEBHOOK_URL).
 */
export async function alertMerchant(merchantId: string, kind: AlertKind, title: string, body?: string, refId?: string) {
  await db.prepare(`
    INSERT INTO merchant_alerts (id, merchant_id, kind, title, body, ref_id, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(randomId('alr', 8), merchantId, kind, title, body ?? null, refId ?? null, new Date().toISOString());
  if (EXTERNAL_ALERT_KINDS.has(kind)) sendExternalAlert('MERCHANT', merchantId, kind, title, body);
}

/**
 * P1-2: alerta al proveedor por canal externo (no hay bandeja propia aún).
 * Los eventos de seguridad críticos del proveedor se envían al mismo webhook.
 */
export function alertProvider(providerId: string, kind: AlertKind, title: string, body?: string) {
  if (EXTERNAL_ALERT_KINDS.has(kind)) sendExternalAlert('PROVIDER', providerId, kind, title, body);
}

export function recentAlerts(merchantId: string, limit = 30) {
  return db
    .prepare('SELECT id, kind, title, body, ref_id, created_at FROM merchant_alerts WHERE merchant_id = ? ORDER BY created_at DESC LIMIT ?')
    .all(merchantId, limit);
}

export type Feature = 'LINK_CREATE' | 'PUBLIC_PAY' | 'WEBHOOK_PROCESSING';

export async function featureEnabled(name: Feature): Promise<boolean> {
  const row = await db.prepare('SELECT enabled FROM feature_flags WHERE name = ?').get(name) as { enabled: number } | undefined;
  return row ? row.enabled === 1 : true;
}

/** Apagado puntual de una función (incidente) sin redeploy. */
export function requireFeature(name: Feature) {
  return async (_req: Request, res: Response, next: NextFunction) => {
    if (!await featureEnabled(name)) {
      return fail(res, 503, 'FEATURE_DISABLED', 'Esta función está pausada temporalmente por mantenimiento de seguridad. Inténtalo más tarde.');
    }
    next();
  };
}
