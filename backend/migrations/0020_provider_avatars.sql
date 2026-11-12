-- Foto de perfil de un proveedor que todavía no tiene cuenta de cobros (Emprendedor). Cuando abre Kuota Payments,
-- la foto pasa a merchant_avatars y esta fila se borra: una sola foto por persona.
CREATE TABLE IF NOT EXISTS public.provider_avatars (
  provider_id TEXT PRIMARY KEY REFERENCES public.provider_profiles(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  image_b64 TEXT NOT NULL,
  updated_at TEXT DEFAULT public.utc_now_text()
);
