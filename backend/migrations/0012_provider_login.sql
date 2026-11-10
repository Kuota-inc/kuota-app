-- Login de proveedores: PIN propio (solo su hash) con bloqueo por intentos fallidos.
ALTER TABLE public.provider_profiles ADD COLUMN IF NOT EXISTS pin_hash TEXT;
ALTER TABLE public.provider_profiles ADD COLUMN IF NOT EXISTS pin_failed_attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.provider_profiles ADD COLUMN IF NOT EXISTS pin_locked_until TEXT;
