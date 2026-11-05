// Eventos del ciclo de vida del cobro (solo agregado), alertas al comercio y
// interruptores de funciones para respuesta a incidentes.
import type { NextFunction, Request, Response } from 'express';
import { db } from '../db/database.js';
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

export function paymentEvent(linkId: string, type: PaymentEventType, data: Record<string, unknown> = {}) {
  db.prepare('INSERT INTO payment_events (link_id, type, data_json, created_at) VALUES (?, ?, ?, ?)').run(
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

/**
 * Alerta al comercio. Queda registrada aquí; en producción la entrega es push
 * (FCM) o la plantilla oficial de WhatsApp Business.
 */
export function alertMerchant(merchantId: string, kind: AlertKind, title: string, body?: string, refId?: string) {
  db.prepare(`
    INSERT INTO merchant_alerts (id, merchant_id, kind, title, body, ref_id, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(randomId('alr', 8), merchantId, kind, title, body ?? null, refId ?? null, new Date().toISOString());
}

export function recentAlerts(merchantId: string, limit = 30) {
  return db
    .prepare('SELECT id, kind, title, body, ref_id, created_at FROM merchant_alerts WHERE merchant_id = ? ORDER BY created_at DESC LIMIT ?')
    .all(merchantId, limit);
}

export type Feature = 'LINK_CREATE' | 'PUBLIC_PAY' | 'WEBHOOK_PROCESSING';

export function featureEnabled(name: Feature): boolean {
  const row = db.prepare('SELECT enabled FROM feature_flags WHERE name = ?').get(name) as { enabled: number } | undefined;
  return row ? row.enabled === 1 : true;
}

/** Apagado puntual de una función (incidente) sin redeploy. */
export function requireFeature(name: Feature) {
  return (_req: Request, res: Response, next: NextFunction) => {
    if (!featureEnabled(name)) {
      return fail(res, 503, 'FEATURE_DISABLED', 'Esta función está pausada temporalmente por mantenimiento de seguridad. Inténtalo más tarde.');
    }
    next();
  };
}
