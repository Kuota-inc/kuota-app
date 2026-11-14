-- P0-6: idempotency key on credit purchases to prevent duplicate charges on network retries.
ALTER TABLE credit_purchases ADD COLUMN idempotency_key TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS uq_purchase_idempotency ON credit_purchases (merchant_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;
