-- Token secreto del proveedor (solo se guarda su hash): autentica las rutas /providers/*.
ALTER TABLE public.provider_profiles ADD COLUMN IF NOT EXISTS access_token_hash TEXT;
