-- P0-7: persist real TEA/TCEA on each purchase so the rate is auditable
-- and visible in /purchases/active without recomputing.
ALTER TABLE credit_purchases ADD COLUMN tea_pct DOUBLE PRECISION;
ALTER TABLE credit_purchases ADD COLUMN tcea_pct DOUBLE PRECISION;
