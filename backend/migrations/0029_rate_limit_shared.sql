-- P1-7: rate limit compartido entre instancias Railway.
-- Reemplaza el Map en memoria (bypasseable con múltiples instancias)
-- con una tabla PostgreSQL usando upsert atómico.

CREATE TABLE IF NOT EXISTS payments.rate_limit_buckets (
  key      TEXT    NOT NULL,
  count    INTEGER NOT NULL DEFAULT 1,
  reset_at BIGINT  NOT NULL,
  PRIMARY KEY (key)
);
