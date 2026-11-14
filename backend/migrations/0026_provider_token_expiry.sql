-- P0-10: vencimiento de tokens de proveedor (90 días). La columna existente
-- access_token_hash se mantiene; esta añade el momento de expiración.
ALTER TABLE public.provider_profiles ADD COLUMN IF NOT EXISTS provider_token_expires_at TEXT;
