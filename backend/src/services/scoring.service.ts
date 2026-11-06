import { db } from '../db/database.js';

export interface ScoreBreakdown {
  // ── Level 0: señales de la app ──────────────────────────────────────────────
  base: number;
  payment_behavior: number;   // 0–200  puntualidad en cuotas
  sales_regularity: number;   // 0–150  semanas activas (12 últimas)
  payer_diversity: number;    // 0–100  clientes distintos
  geo_stability: number;      // 0–50   dirección registrada
  kyc_bonus: number;          // 0–100  KYC aprobado (Didit)
  // ── Level 1: señales externas (SUNAT + capturas Yape/Plin) ─────────────────
  sunat_activo: number;       // 0–80   estado ACTIVO + domicilio HABIDO
  formalizacion: number;      // 0–70   persona jurídica formal
  captura_pagos: number;      // 0–50   pagos Yape/Plin capturados (listener)
  // ── Resumen ─────────────────────────────────────────────────────────────────
  total: number;              // 300–900
  level: number;              // 0–3
  label: string;
  scoring_level: number;      // 0 = solo app, 1 = enriquecido con SUNAT
}

export async function computeScore(merchantId: string): Promise<ScoreBreakdown> {
  const [merchant, installments, sales, scoreEvents] = await Promise.all([
    db.prepare('SELECT * FROM merchant_profiles WHERE id = ?').get(merchantId),
    db.prepare(`
      SELECT i.status, i.due_date, i.paid_at
      FROM installments i
      JOIN credit_purchases cp ON i.purchase_id = cp.id
      WHERE cp.merchant_id = ?
    `).all(merchantId),
    db.prepare(`
      SELECT client_id, occurred_at
      FROM sales WHERE merchant_id = ? AND occurred_at IS NOT NULL
    `).all(merchantId),
    db.prepare(`
      SELECT type, COUNT(*) as cnt
      FROM score_events WHERE merchant_id = ?
      GROUP BY type
    `).all(merchantId),
  ]) as [any, any[], any[], any[]];

  const now = new Date();

  // ── Level 0 ─────────────────────────────────────────────────────────────────

  // payment_behavior (0–200)
  const dueInPast = installments.filter((i: any) => new Date(i.due_date) <= now);
  let paymentScore = 0;
  if (dueInPast.length > 0) {
    const onTime = dueInPast.filter((i: any) =>
      i.status === 'PAID' && i.paid_at && new Date(i.paid_at) <= new Date(i.due_date)
    ).length;
    paymentScore = Math.round((onTime / dueInPast.length) * 200);
  } else if (installments.length === 0) {
    paymentScore = 100; // sin historial → neutral
  }

  // sales_regularity (0–150)
  const twelveWeeksAgo = new Date(now.getTime() - 84 * 24 * 60 * 60 * 1000);
  const recentSales = sales.filter((s: any) => new Date(s.occurred_at) >= twelveWeeksAgo);
  const activeWeeks = new Set(
    recentSales.map((s: any) => {
      const d = new Date(s.occurred_at);
      return Math.floor((d.getTime() - twelveWeeksAgo.getTime()) / (7 * 24 * 60 * 60 * 1000));
    })
  ).size;
  const salesRegScore = Math.round(Math.min(1, activeWeeks / 12) * 150);

  // payer_diversity (0–100)
  const distinctClients = new Set(
    sales.filter((s: any) => s.client_id).map((s: any) => s.client_id)
  ).size;
  const diversityScore = Math.min(100, Math.round(distinctClients * 10));

  // geo_stability (0–50)
  const geoScore = merchant?.district || merchant?.address ? 50 : 0;

  // kyc_bonus (0–100)
  const kycBonus =
    merchant?.kyc_status === 'APPROVED' || merchant?.kyc_status === 'VERIFIED' ? 100 : 0;

  // ── Level 1 ─────────────────────────────────────────────────────────────────

  // sunat_activo (0–80): cruzar RUC del comercio con el padrón SUNAT
  let sunatActivo = 0;
  let usedExternalData = false;
  if (merchant?.ruc) {
    const sunat = await db.prepare(
      'SELECT estado_contribuyente, condicion_domicilio, tipo_contribuyente FROM sunat_contribuyentes WHERE ruc = ?'
    ).get(merchant.ruc) as any;
    if (sunat) {
      usedExternalData = true;
      if (sunat.estado_contribuyente === 'ACTIVO') sunatActivo += 50;
      if (sunat.condicion_domicilio === 'HABIDO') sunatActivo += 30;
    }
  }

  // formalizacion (0–70): tipo de entidad legal
  let formalizacion = 0;
  if (merchant?.ruc) {
    const sunat = await db.prepare(
      'SELECT tipo_contribuyente FROM sunat_contribuyentes WHERE ruc = ?'
    ).get(merchant.ruc) as any;
    if (sunat) {
      const tipo: string = sunat.tipo_contribuyente ?? '';
      const formal =
        tipo.includes('SOCIEDAD') ||
        tipo.includes('S.A.') ||
        tipo.includes('S.A.C') ||
        tipo.includes('S.R.L') ||
        tipo.includes('E.I.R.L');
      formalizacion = formal ? 70 : 30; // PN con RUC = 30 (semiFormal)
    }
  }

  // captura_pagos (0–50): pagos Yape/Plin capturados por el listener (Bloque 3)
  const capturas = scoreEvents.find((e: any) => e.type === 'PAYMENT_CAPTURED');
  const capturaScore = Math.min(50, Math.round((capturas?.cnt ?? 0) * 5));

  if (capturas?.cnt > 0) usedExternalData = true;

  // ── Total ────────────────────────────────────────────────────────────────────
  const raw = 300 + paymentScore + salesRegScore + diversityScore + geoScore + kycBonus
            + sunatActivo + formalizacion + capturaScore;
  const total = Math.min(900, raw);
  const level = total >= 750 ? 3 : total >= 600 ? 2 : total >= 450 ? 1 : 0;
  const labels = ['Inicial', 'Básico', 'Intermedio', 'Avanzado'];

  return {
    base: 300,
    payment_behavior: paymentScore,
    sales_regularity: salesRegScore,
    payer_diversity: diversityScore,
    geo_stability: geoScore,
    kyc_bonus: kycBonus,
    sunat_activo: sunatActivo,
    formalizacion,
    captura_pagos: capturaScore,
    total,
    level,
    label: labels[level],
    scoring_level: usedExternalData ? 1 : 0,
  };
}

export async function persistScore(merchantId: string, breakdown: ScoreBreakdown): Promise<void> {
  await db.prepare(`
    UPDATE credit_scores
    SET score = ?, level = ?, breakdown_json = ?, scoring_level = ?, last_calculated_at = utc_now_text()
    WHERE merchant_id = ?
  `).run(breakdown.total, breakdown.level, JSON.stringify(breakdown), breakdown.scoring_level, merchantId);
}
