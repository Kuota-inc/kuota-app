-- Bloque 5: Scoring Level 1 — señales externas (SUNAT, capturas Yape/Plin)
-- breakdown_json: desglose completo del último cálculo (Level 0 + Level 1).
-- scoring_level : 0 = solo datos de app, 1 = enriquecido con SUNAT y capturas.

ALTER TABLE credit_scores
  ADD COLUMN IF NOT EXISTS breakdown_json TEXT,
  ADD COLUMN IF NOT EXISTS scoring_level  INTEGER NOT NULL DEFAULT 0;
