-- Foto de perfil del comercio: la ve quien paga (página de cobro, QR) y quien lo busca por celular.
-- Tabla aparte para no cargar la imagen en cada consulta del perfil. El token es aleatorio y cambia con cada foto
-- (así la URL pública no se puede adivinar ni queda una foto vieja en caché).
CREATE TABLE IF NOT EXISTS public.merchant_avatars (
  merchant_id TEXT PRIMARY KEY REFERENCES public.merchant_profiles(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  image_b64 TEXT NOT NULL,
  updated_at TEXT DEFAULT public.utc_now_text()
);
