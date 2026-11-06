-- Bloque 4: Openpay — conformidad del pago inicial (enganche)
-- Agrega seguimiento del cargo Openpay al enganche de cada compra y tabla de
-- eventos para garantizar idempotencia en las entregas del webhook.

ALTER TABLE credit_purchases
  ADD COLUMN IF NOT EXISTS openpay_charge_id TEXT,
  ADD COLUMN IF NOT EXISTS down_payment_status TEXT NOT NULL DEFAULT 'PENDING';

CREATE TABLE IF NOT EXISTS openpay_webhook_events (
  event_id      TEXT PRIMARY KEY,
  type          TEXT NOT NULL,
  charge_id     TEXT,
  purchase_id   TEXT,
  status        TEXT NOT NULL DEFAULT 'received',
  received_at   TEXT NOT NULL DEFAULT utc_now_text()
);
