import { db } from '../db/database.js';

export interface ScoreBreakdown {
  base: number;
  payment_behavior: number;
  sales_regularity: number;
  payer_diversity: number;
  geo_stability: number;
  kyc_bonus: number;
  total: number;
  level: number;
  label: string;
}

export async function computeScore(merchantId: string): Promise<ScoreBreakdown> {
  const [merchant, installments, sales] = await Promise.all([
    db.prepare('SELECT * FROM merchant_profiles WHERE id = ?').get(merchantId) as Promise<any>,
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
  ]) as [any, any[], any[]];

  // payment_behavior (0–200): ratio of on-time vs overdue installments
  const now = new Date();
  const dueInPast = installments.filter((i: any) => new Date(i.due_date) <= now);
  let paymentScore = 0;
  if (dueInPast.length > 0) {
    const onTime = dueInPast.filter((i: any) => {
      if (i.status === 'PAID' && i.paid_at) return new Date(i.paid_at) <= new Date(i.due_date);
      return false;
    }).length;
    paymentScore = Math.round((onTime / dueInPast.length) * 200);
  } else if (installments.length === 0) {
    paymentScore = 100; // no history → neutral
  }

  // sales_regularity (0–150): active weeks out of last 12 weeks
  const twelveWeeksAgo = new Date(now.getTime() - 84 * 24 * 60 * 60 * 1000);
  const recentSales = sales.filter((s: any) => new Date(s.occurred_at) >= twelveWeeksAgo);
  const activeWeeks = new Set(
    recentSales.map((s: any) => {
      const d = new Date(s.occurred_at);
      const week = Math.floor((d.getTime() - twelveWeeksAgo.getTime()) / (7 * 24 * 60 * 60 * 1000));
      return week;
    })
  ).size;
  const salesRegScore = Math.round(Math.min(1, activeWeeks / 12) * 150);

  // payer_diversity (0–100): distinct client_ids (non-null)
  const distinctClients = new Set(
    sales.filter((s: any) => s.client_id).map((s: any) => s.client_id)
  ).size;
  const diversityScore = Math.min(100, Math.round(distinctClients * 10));

  // geo_stability (0–50): merchant has a district or address
  const geoScore = merchant?.district || merchant?.address ? 50 : 0;

  // kyc_bonus (+100): approved KYC
  const kycBonus = merchant?.kyc_status === 'APPROVED' || merchant?.kyc_status === 'VERIFIED' ? 100 : 0;

  const total = 300 + paymentScore + salesRegScore + diversityScore + geoScore + kycBonus;
  const level = total >= 750 ? 3 : total >= 600 ? 2 : total >= 450 ? 1 : 0;
  const labels = ['Inicial', 'Básico', 'Intermedio', 'Avanzado'];

  return {
    base: 300,
    payment_behavior: paymentScore,
    sales_regularity: salesRegScore,
    payer_diversity: diversityScore,
    geo_stability: geoScore,
    kyc_bonus: kycBonus,
    total,
    level,
    label: labels[level],
  };
}

export async function persistScore(merchantId: string, breakdown: ScoreBreakdown): Promise<void> {
  await db.prepare(`
    UPDATE credit_scores SET score = ?, level = ?, last_calculated_at = utc_now_text()
    WHERE merchant_id = ?
  `).run(breakdown.total, breakdown.level, merchantId);
}
