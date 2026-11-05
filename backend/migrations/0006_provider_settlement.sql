-- Cuenta bancaria de abono para proveedores (CCI + banco).
ALTER TABLE provider_profiles ADD COLUMN IF NOT EXISTS settlement_bank TEXT;
ALTER TABLE provider_profiles ADD COLUMN IF NOT EXISTS settlement_cci  TEXT;
