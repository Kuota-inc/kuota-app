// Rutas internas de operaciones (token de administrador): conciliación,
// verificación de la bitácora, reglas y listas antifraude, cola de revisión,
// revocación masiva de sesiones e interruptores de funciones.
import { Router } from 'express';
import { paymentsDb as db, db as coreDb } from '../db/client.js';
import { secrets } from '../security/config.js';
import { audit, recentAudit, verifyAuditChain } from '../security/audit.js';
import { revokeSessions } from '../security/auth.js';
import { alertMerchant, paymentEvent } from '../security/events.js';
import { requireAdmin } from '../security/guards.js';
import { clientIp, fail } from '../security/http.js';
import { getLinkById } from '../security/links.js';
import { runReconciliation, validProviderReport } from '../security/reconciliation.js';
import { KNOWN_RULES, riskMetrics } from '../security/risk.js';
import { formatSoles, nowIso } from '../security/time.js';

export const internalRouter = Router();
internalRouter.use(requireAdmin(secrets.adminToken));

const actor = (req: { body?: { analyst?: unknown } }) =>
  typeof req.body?.analyst === 'string' ? req.body.analyst.slice(0, 60) : 'ops';

// ------------------------------------------------------------ conciliación
internalRouter.post('/reconciliation/run', async (req, res) => {
  const date = req.body?.business_date;
  if (date !== undefined && (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date))) {
    return fail(res, 422, 'DATE_INVALID', 'business_date debe ser AAAA-MM-DD.');
  }
  const report = validProviderReport(req.body?.provider_report);
  if (!report) return fail(res, 422, 'REPORT_INVALID', 'provider_report debe ser una lista de { gateway_ref, amount_minor, status? }.');
  res.json(await runReconciliation({ businessDate: date, providerReport: report }));
});

internalRouter.get('/reconciliation/runs', async (_req, res) => {
  const rows = await db.prepare('SELECT * FROM reconciliation_runs ORDER BY run_at DESC LIMIT 20').all() as {
    summary_json: string;
    exceptions_json: string;
  }[];
  res.json({
    data: rows.map(({ summary_json, exceptions_json, ...r }) => ({ ...r, summary: JSON.parse(summary_json), exceptions: JSON.parse(exceptions_json) }))
  });
});

// ---------------------------------------------------------------- bitácora
internalRouter.get('/audit/verify', async (_req, res) => res.json(await verifyAuditChain()));
internalRouter.get('/audit', async (req, res) => res.json({ data: await recentAudit(Number(req.query.limit) || 50) }));

// ----------------------------------------------------------------- riesgo
internalRouter.get('/risk/rules', async (_req, res) => {
  const rows = await db.prepare('SELECT * FROM risk_rules ORDER BY context, id').all() as { params_json: string; enabled: number }[];
  res.json({ data: rows.map(({ params_json, enabled, ...r }) => ({ ...r, enabled: enabled === 1, params: JSON.parse(params_json) })) });
});

internalRouter.put('/risk/rules/:id', async (req, res) => {
  const row = await db.prepare('SELECT * FROM risk_rules WHERE id = ?').get(req.params.id) as { params_json: string } | undefined;
  if (!row || !KNOWN_RULES.has(req.params.id)) return fail(res, 404, 'RULE_NOT_FOUND', 'Regla no encontrada.');
  const { enabled, action, params } = req.body ?? {};
  if (enabled !== undefined && typeof enabled !== 'boolean') return fail(res, 422, 'ENABLED_INVALID', 'enabled debe ser booleano.');
  if (action !== undefined && !['STEP_UP', 'REVIEW', 'BLOCK'].includes(action)) return fail(res, 422, 'ACTION_INVALID', 'Acción inválida.');
  const current = JSON.parse(row.params_json) as Record<string, number>;
  if (params !== undefined) {
    // Solo se ajustan umbrales existentes y numéricos: no se inyecta lógica.
    const valid =
      params && typeof params === 'object' && Object.entries(params).every(([k, v]) => k in current && typeof v === 'number' && Number.isFinite(v) && v >= 0);
    if (!valid) return fail(res, 422, 'PARAMS_INVALID', `Parámetros válidos: ${Object.keys(current).join(', ') || 'ninguno'}.`);
  }
  const next = { ...current, ...(params ?? {}) };
  await db.prepare(`
    UPDATE risk_rules SET enabled = COALESCE(?, enabled), action = COALESCE(?, action), params_json = ?, updated_at = ? WHERE id = ?
  `).run(enabled === undefined ? null : enabled ? 1 : 0, action ?? null, JSON.stringify(next), nowIso(), req.params.id);
  await audit({ actorType: 'ADMIN', actorId: actor(req), action: 'RISK_RULE_UPDATED', target: req.params.id, result: 'OK', ip: clientIp(req), details: { enabled, action, params: next } });
  const updated = await db.prepare('SELECT * FROM risk_rules WHERE id = ?').get(req.params.id) as { params_json: string; enabled: number };
  res.json({ ...updated, enabled: updated.enabled === 1, params: JSON.parse(updated.params_json) });
});

internalRouter.get('/risk/lists', async (_req, res) => res.json({ data: await db.prepare('SELECT * FROM risk_lists ORDER BY created_at DESC').all() }));

internalRouter.post('/risk/lists', async (req, res) => {
  const { list, kind, value, reason } = req.body ?? {};
  if (!['BLACK', 'GRAY', 'WHITE'].includes(list) || !['MERCHANT', 'DEVICE', 'IP'].includes(kind) || typeof value !== 'string' || !value || value.length > 100) {
    return fail(res, 422, 'LIST_ENTRY_INVALID', 'Se espera { list: BLACK|GRAY|WHITE, kind: MERCHANT|DEVICE|IP, value }.');
  }
  await db.prepare(`
    INSERT INTO risk_lists (list, kind, value, reason, created_at) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(kind, value) DO UPDATE SET list = excluded.list, reason = excluded.reason, created_at = excluded.created_at
  `).run(list, kind, value, typeof reason === 'string' ? reason.slice(0, 200) : null, nowIso());
  await audit({ actorType: 'ADMIN', actorId: actor(req), action: 'RISK_LIST_SET', target: `${kind}:${value}`, result: 'OK', ip: clientIp(req), details: { list } });
  res.status(201).json({ list, kind, value });
});

internalRouter.delete('/risk/lists/:kind/:value', async (req, res) => {
  const removed = (await db.prepare('DELETE FROM risk_lists WHERE kind = ? AND value = ?').run(req.params.kind, req.params.value)).changes;
  await audit({ actorType: 'ADMIN', actorId: 'ops', action: 'RISK_LIST_REMOVED', target: `${req.params.kind}:${req.params.value}`, result: removed ? 'OK' : 'FAILED', ip: clientIp(req) });
  res.status(removed ? 204 : 404).end();
});

internalRouter.get('/risk/reviews', async (req, res) => {
  const open = req.query.status !== 'all';
  const rows = await db
    .prepare(`
      SELECT r.*, d.reasons_json, l.amount_cents, l.concept, l.device_id
      FROM risk_reviews r JOIN risk_decisions d ON d.id = r.decision_id JOIN payment_links l ON l.id = r.link_id
      ${open ? 'WHERE r.resolved_at IS NULL' : ''}
      ORDER BY r.opened_at DESC LIMIT 100
    `)
    .all() as { reasons_json: string }[];
  res.json({ data: rows.map(({ reasons_json, ...r }) => ({ ...r, reasons: JSON.parse(reasons_json) })) });
});

// Resolución del analista. Un fraude confirmado alimenta la lista gris del dispositivo.
internalRouter.post('/risk/reviews/:linkId/resolve', async (req, res) => {
  const { resolution, label, note } = req.body ?? {};
  if (!['RELEASE', 'REJECT'].includes(resolution) || !['LEGIT', 'FRAUD'].includes(label)) {
    return fail(res, 422, 'RESOLUTION_INVALID', 'Se espera { resolution: RELEASE|REJECT, label: LEGIT|FRAUD }.');
  }
  if (resolution === 'RELEASE' && label === 'FRAUD') return fail(res, 422, 'RESOLUTION_INVALID', 'No se libera un cobro marcado como fraude.');
  const review = await db.prepare('SELECT * FROM risk_reviews WHERE link_id = ?').get(req.params.linkId) as { resolved_at: string | null } | undefined;
  const link = await getLinkById(req.params.linkId);
  if (!review || !link) return fail(res, 404, 'REVIEW_NOT_FOUND', 'Revisión no encontrada.');
  if (review.resolved_at) return fail(res, 409, 'REVIEW_RESOLVED', 'Esta revisión ya fue resuelta.');
  const analyst = actor(req);
  const now = nowIso();
  await db.transaction(async () => {
    await db.prepare('UPDATE risk_reviews SET resolved_at = ?, resolution = ?, label = ?, analyst = ?, note = ? WHERE link_id = ?').run(
      now,
      resolution,
      label,
      analyst,
      typeof note === 'string' ? note.slice(0, 500) : null,
      link.id
    );
    if (link.status === 'ON_HOLD') {
      if (resolution === 'RELEASE') {
        await db.prepare("UPDATE payment_links SET status = 'DRAFT' WHERE id = ? AND status = 'ON_HOLD'").run(link.id);
        await paymentEvent(link.id, 'RELEASED', { analyst });
        await alertMerchant(link.merchant_id, 'LINK_HELD', `Tu cobro de ${formatSoles(link.amount_cents)} fue aprobado`, 'Ya puedes emitirlo y compartirlo.', link.id);
      } else {
        await db.prepare("UPDATE payment_links SET status = 'CANCELLED', cancelled_at = ? WHERE id = ? AND status = 'ON_HOLD'").run(now, link.id);
        await paymentEvent(link.id, 'CANCELLED', { by: 'RISK_REVIEW', analyst });
        await alertMerchant(link.merchant_id, 'LINK_HELD', `No pudimos aprobar tu cobro de ${formatSoles(link.amount_cents)}`, 'Si crees que es un error, escríbenos por el WhatsApp oficial.', link.id);
      }
    }
    if (label === 'FRAUD' && link.device_id) {
      await db.prepare(`
        INSERT INTO risk_lists (list, kind, value, reason, created_at) VALUES ('GRAY', 'DEVICE', ?, ?, ?)
        ON CONFLICT(kind, value) DO NOTHING
      `).run(link.device_id, `Fraude confirmado en ${link.id}`, now);
    }
    await audit({ actorType: 'ADMIN', actorId: analyst, action: 'RISK_REVIEW_RESOLVED', target: link.id, result: 'OK', ip: clientIp(req), details: { resolution, label } });
  })();
  res.json({ link_id: link.id, resolution, label, status: (await getLinkById(link.id))!.status });
});

internalRouter.get('/risk/metrics', async (_req, res) => res.json(await riskMetrics()));

// ------------------------------------------------------------------- KYC
// Cola de verificaciones de identidad (Didit) para operaciones: estado, motivo y resumen.
internalRouter.get('/kyc', async (req, res) => {
  const status = typeof req.query.status === 'string' ? req.query.status.toUpperCase() : null;
  const rows = await coreDb.all(
    `SELECT k.public_id, k.status, k.provider, k.provider_session_id, k.decision_status, k.decision_reason,
            k.decision_summary_json, k.created_at, k.verified_at, m.business_name, m.dni
     FROM kyc_requests k LEFT JOIN merchant_profiles m ON m.session_id = k.session_id
     ${status ? 'WHERE k.status = ?' : ''} ORDER BY k.created_at DESC LIMIT 50`,
    ...(status ? [status] : [])
  );
  res.json({ data: rows.map(({ decision_summary_json, ...r }: any) => ({ ...r, summary: decision_summary_json ? JSON.parse(decision_summary_json) : null })) });
});

// ------------------------------------------------------- respuesta a incidentes
internalRouter.post('/sessions/revoke', async (req, res) => {
  const merchantId = req.body?.merchant_id;
  let closed: number;
  if (typeof merchantId === 'string') {
    closed = await revokeSessions(merchantId);
  } else if (req.body?.all === true) {
    closed = (await db.prepare('UPDATE merchant_sessions SET revoked_at = ? WHERE revoked_at IS NULL').run(nowIso())).changes;
  } else {
    return fail(res, 422, 'TARGET_REQUIRED', 'Indica merchant_id o all: true.');
  }
  await audit({ actorType: 'ADMIN', actorId: actor(req), action: 'SESSIONS_REVOKED', target: merchantId ?? 'ALL', result: 'OK', ip: clientIp(req), details: { closed } });
  res.json({ sessions_closed: closed });
});

internalRouter.get('/features', async (_req, res) => res.json({ data: await db.prepare('SELECT * FROM feature_flags').all() }));

internalRouter.put('/features/:name', async (req, res) => {
  const { enabled, reason } = req.body ?? {};
  if (typeof enabled !== 'boolean') return fail(res, 422, 'ENABLED_INVALID', 'enabled debe ser booleano.');
  const changed = (await db
    .prepare('UPDATE feature_flags SET enabled = ?, reason = ?, updated_at = ? WHERE name = ?')
    .run(enabled ? 1 : 0, typeof reason === 'string' ? reason.slice(0, 200) : null, nowIso(), req.params.name)).changes;
  if (!changed) return fail(res, 404, 'FEATURE_NOT_FOUND', 'Función no encontrada.');
  await audit({ actorType: 'ADMIN', actorId: actor(req), action: 'FEATURE_TOGGLED', target: req.params.name, result: 'OK', ip: clientIp(req), details: { enabled } });
  res.json({ name: req.params.name, enabled });
});
