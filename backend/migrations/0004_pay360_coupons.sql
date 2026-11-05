-- 0004 · Integración real con 360pay: cada link de cobro se respalda con un
-- cupón de 360pay (código de pago en bancos y agentes). El pago llega por el
-- webhook PAYMENT_PAID con el cupón (_id) y external_ref = id del link.

ALTER TABLE payments.payment_links
  ADD COLUMN pay360_coupon_id TEXT UNIQUE,
  ADD COLUMN pay360_coupon_code TEXT;

-- Pagos por cupón (banco/agente) además de Yape, Plin y tarjeta.
ALTER TABLE payments.payments DROP CONSTRAINT IF EXISTS payments_method_check;
ALTER TABLE payments.payments ADD CONSTRAINT payments_method_check CHECK (method IN ('YAPE', 'PLIN', 'CARD', 'BANK'));

-- Cliente de 360pay que agrupa los cupones de cada comercio Kuota.
CREATE TABLE payments.pay360_customers (
  merchant_id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL UNIQUE,
  coupon_code TEXT NOT NULL,
  created_at TEXT NOT NULL
);

GRANT SELECT, INSERT ON payments.pay360_customers TO kuota_payments_rw;
