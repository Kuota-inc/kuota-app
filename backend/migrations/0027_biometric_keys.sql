-- P1-5: registro de llave pública biométrica y retos firmados por acción.
-- La app registra una clave EC P-256 del Keystore de Android; el servidor emite
-- retos que la app firma con esa clave bajo autenticación biométrica fuerte.

CREATE TABLE IF NOT EXISTS biometric_keys (
  id          TEXT PRIMARY KEY,
  merchant_id TEXT NOT NULL,
  device_id   TEXT NOT NULL,
  public_key_spki TEXT NOT NULL, -- base64 DER SPKI (EC P-256)
  registered_at   TEXT NOT NULL,
  revoked_at      TEXT
);

-- Solo una clave activa por (comercio, dispositivo).
CREATE UNIQUE INDEX IF NOT EXISTS uq_biometric_key
  ON biometric_keys(merchant_id, device_id)
  WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS biometric_challenges (
  id          TEXT PRIMARY KEY,
  merchant_id TEXT NOT NULL,
  device_id   TEXT NOT NULL,
  challenge_hex TEXT NOT NULL, -- 32 bytes = 64 hex
  expires_at  TEXT NOT NULL,
  used_at     TEXT
);
