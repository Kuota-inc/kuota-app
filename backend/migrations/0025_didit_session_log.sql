-- P0-8: registro de sesiones Didit para aplicar topes de gasto.
-- merchant_key: merchant.id para KYC, 'recovery:<merchant.id>' para recuperación de PIN.
CREATE TABLE IF NOT EXISTS didit_session_log (
  id          TEXT    PRIMARY KEY,
  merchant_key TEXT   NOT NULL,
  type        TEXT    NOT NULL, -- 'KYC' | 'RECOVERY'
  created_at  TEXT    NOT NULL DEFAULT (utc_now_text())
);
CREATE INDEX IF NOT EXISTS idx_didit_session_log_merchant ON didit_session_log (merchant_key, created_at);
CREATE INDEX IF NOT EXISTS idx_didit_session_log_global   ON didit_session_log (created_at);
