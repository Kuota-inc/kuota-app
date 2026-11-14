-- Refresh tokens con rotación y detección de reutilización.
-- family_id agrupa la cadena de rotación: si se detecta reuse en una familia,
-- se revocan todos los tokens de esa familia (posible robo de token).
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id          TEXT PRIMARY KEY,          -- UUID v4
  family_id   TEXT NOT NULL,             -- UUID v4, compartido por toda la cadena de rotación
  merchant_id TEXT NOT NULL REFERENCES merchant_profiles(id) ON DELETE CASCADE,
  device_id   TEXT NOT NULL,
  token_hash  TEXT NOT NULL,             -- SHA-256 hex del token en claro (nunca se guarda el raw)
  created_at  TEXT NOT NULL,
  expires_at  TEXT NOT NULL,
  used_at     TEXT,                      -- NULL = no usado, SET = rotado (ya tiene sucesor)
  revoked_at  TEXT                       -- NULL = vigente
);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_family  ON refresh_tokens(family_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_merchant ON refresh_tokens(merchant_id);
