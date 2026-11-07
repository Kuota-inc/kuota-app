-- Token de identidad por dispositivo (solo su hash): credencial secreta de las rutas /merchants/me y /credit.
ALTER TABLE payments.merchant_devices ADD COLUMN IF NOT EXISTS identity_token_hash TEXT;
ALTER TABLE payments.merchant_devices ADD COLUMN IF NOT EXISTS identity_token_expires_at TEXT;
