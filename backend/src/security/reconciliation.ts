// Conciliación: cada sol cobrado, notificado y abonado debe coincidir entre el
// link, el pago, el libro de doble partida, los webhooks y el reporte de 360pay.
import { db } from '../db/database.js';
import { randomId } from './crypto.js';
import { audit } from './audit.js';
import { getLinkById, linkSignatureValid } from './links.js';
import { limaDate, sqlTime } from './time.js';

export interface ProviderLine {
  gateway_ref: string;
  amount_minor: number;
  status?: string;
}

export interface ReconException {
  type: string;
  ref: string;
  detail: string;
}

// Rechazos de webhooks de cobros capturados por 360pay que Kuota no abonó:
// el dinero existe en el proveedor y requiere devolución o revisión manual.
const CAPTURED_NOT_CREDITED = new Set([
  'AMOUNT_MISMATCH',
  'ALREADY_PAID',
  'LINK_EXPIRED',
  'LINK_CANCELLED',
  'LINK_ON_HOLD',
  'LINK_DRAFT',
  'LINK_TAMPERED',
  'UNKNOWN_LINK',
  'LINK_NOT_ACTIVE'
]);

export function validProviderReport(value: unknown): ProviderLine[] | null {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 100_000) return null;
  const ok = value.every(
    (l) => l && typeof l.gateway_ref === 'string' && Number.isInteger(l.amount_minor) && (l.status === undefined || typeof l.status === 'string')
  );
  return ok ? (value as ProviderLine[]) : null;
}

export function runReconciliation(opts: { businessDate?: string; providerReport?: ProviderLine[] } = {}) {
  const date = opts.businessDate ?? limaDate();
  const from = new Date(`${date}T05:00:00Z`); // 00:00 en Lima
  const to = new Date(from.getTime() + 86_400_000);
  const exceptions: ReconException[] = [];
  const add = (type: string, ref: string, detail: string) => exceptions.push({ type, ref, detail });

  const payments = db
    .prepare("SELECT * FROM payments WHERE status = 'SUCCESS' AND created_at >= ? AND created_at < ?")
    .all(sqlTime(from), sqlTime(to)) as { id: string; payment_link_id: string; gateway_ref: string; amount_cents: number }[];

  let gross = 0;
  let net = 0;
  let fee = 0;
  for (const pay of payments) {
    gross += pay.amount_cents;
    const link = getLinkById(pay.payment_link_id);
    if (!link) {
      add('PAYMENT_WITHOUT_LINK', pay.id, 'Pago sin link de cobro asociado');
      continue;
    }
    if (link.status !== 'PAID') add('LINK_STATUS_MISMATCH', link.id, `Pago registrado pero el link está ${link.status}`);
    if (link.amount_cents !== pay.amount_cents) add('AMOUNT_MISMATCH', pay.id, `Link ${link.amount_cents} ≠ pago ${pay.amount_cents}`);
    if (link.gateway_ref !== pay.gateway_ref) add('GATEWAY_REF_MISMATCH', pay.id, 'La referencia del link no coincide con la del pago');
    if (!linkSignatureValid(link)) add('LINK_TAMPERED', link.id, 'La firma del link no coincide con sus datos');

    const entries = db.prepare('SELECT account, type, amount_cents FROM ledger_entries WHERE payment_id = ?').all(pay.id) as {
      account: string;
      type: string;
      amount_cents: number;
    }[];
    const debit = entries.filter((e) => e.type === 'DEBIT').reduce((s, e) => s + e.amount_cents, 0);
    const credit = entries.filter((e) => e.type === 'CREDIT').reduce((s, e) => s + e.amount_cents, 0);
    const wallet = entries.filter((e) => e.account === 'MERCHANT_WALLET').reduce((s, e) => s + e.amount_cents, 0);
    const feeEntry = entries.filter((e) => e.account === 'KUOTA_FEE_REVENUE').reduce((s, e) => s + e.amount_cents, 0);
    net += wallet;
    fee += feeEntry;
    if (!entries.length) add('PAYMENT_WITHOUT_LEDGER', pay.id, 'Pago sin asientos contables');
    else if (debit !== pay.amount_cents || credit !== pay.amount_cents) {
      add('LEDGER_UNBALANCED', pay.id, `Debe ${debit} / haber ${credit} / pago ${pay.amount_cents}`);
    } else if (wallet !== link.net_cents || feeEntry !== link.fee_cents) {
      add('SPLIT_MISMATCH', pay.id, 'El abono neto o la comisión no coinciden con lo cotizado');
    }
  }

  const orphanPaid = db
    .prepare(`
      SELECT l.id FROM payment_links l
      LEFT JOIN payments p ON p.payment_link_id = l.id AND p.status = 'SUCCESS'
      WHERE l.status = 'PAID' AND l.paid_at >= ? AND l.paid_at < ? AND p.id IS NULL
    `)
    .all(from.toISOString(), to.toISOString()) as { id: string }[];
  for (const l of orphanPaid) add('LINK_PAID_WITHOUT_PAYMENT', l.id, 'Link marcado como pagado sin pago registrado');

  const multi = db
    .prepare(`
      SELECT link_id, COUNT(*) AS n FROM webhook_events
      WHERE status = 'PROCESSED' AND reason IS NULL AND received_at >= ? AND received_at < ?
      GROUP BY link_id HAVING n > 1
    `)
    .all(from.toISOString(), to.toISOString()) as { link_id: string; n: number }[];
  for (const m of multi) add('DUPLICATE_PROCESSING', m.link_id, `${m.n} cobros procesados para un link de uso único`);

  const rejectedCaptures = db
    .prepare(`
      SELECT event_id, reason, gateway_ref, amount_minor FROM webhook_events
      WHERE type = 'payment_captured' AND status = 'REJECTED' AND received_at >= ? AND received_at < ?
    `)
    .all(from.toISOString(), to.toISOString()) as { event_id: string; reason: string; gateway_ref: string | null; amount_minor: number | null }[];
  for (const r of rejectedCaptures) {
    if (CAPTURED_NOT_CREDITED.has(r.reason)) {
      add('CAPTURED_NOT_CREDITED', r.gateway_ref ?? r.event_id, `360pay capturó ${r.amount_minor ?? '?'} y Kuota no lo abonó (${r.reason})`);
    }
  }

  const balance = db
    .prepare("SELECT COALESCE(SUM(CASE WHEN type = 'DEBIT' THEN amount_cents ELSE -amount_cents END), 0) AS diff FROM ledger_entries")
    .get() as { diff: number };
  if (balance.diff !== 0) add('LEDGER_GLOBAL_UNBALANCED', 'ledger', `Diferencia global debe − haber = ${balance.diff}`);

  const report = opts.providerReport ?? [];
  if (report.length) {
    const ours = new Map(payments.map((p) => [p.gateway_ref, p]));
    const theirs = new Map(report.map((l) => [l.gateway_ref, l]));
    for (const [ref, p] of ours) {
      const line = theirs.get(ref);
      if (!line) add('MISSING_IN_PROVIDER', ref, 'Kuota registró el cobro y 360pay no lo reporta');
      else if (line.amount_minor !== p.amount_cents) add('AMOUNT_MISMATCH_PROVIDER', ref, `Kuota ${p.amount_cents} ≠ 360pay ${line.amount_minor}`);
    }
    for (const [ref, line] of theirs) {
      const captured = !line.status || ['CAPTURED', 'SUCCESS', 'PAID'].includes(line.status.toUpperCase());
      if (captured && !ours.has(ref)) add('MISSING_IN_KUOTA', ref, `360pay reporta ${line.amount_minor} sin cobro en Kuota`);
    }
  }

  const summary = {
    business_date: date,
    payments: payments.length,
    gross_cents: gross,
    net_cents: net,
    fee_cents: fee,
    provider_lines: report.length,
    exceptions: exceptions.length
  };
  const id = randomId('rec', 8);
  const status = exceptions.length ? 'EXCEPTIONS' : 'OK';
  db.prepare('INSERT INTO reconciliation_runs (id, run_at, business_date, status, summary_json, exceptions_json) VALUES (?, ?, ?, ?, ?, ?)').run(
    id,
    new Date().toISOString(),
    date,
    status,
    JSON.stringify(summary),
    JSON.stringify(exceptions)
  );
  audit({ actorType: 'SYSTEM', action: 'RECONCILIATION_RUN', target: date, result: status === 'OK' ? 'OK' : 'FAILED', details: { run_id: id, ...summary } });
  return { id, status, summary, exceptions };
}
