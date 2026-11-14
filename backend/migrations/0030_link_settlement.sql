-- 0030: distingue pago del cliente (PAID) de liquidación al proveedor (settled_at).
-- La columna se rellena solo cuando 360pay confirma la transferencia al proveedor.
-- En sandbox la llena el endpoint POST /api/v1/dev/settle-pending.
ALTER TABLE payments.payment_links ADD COLUMN IF NOT EXISTS settled_at TEXT;
