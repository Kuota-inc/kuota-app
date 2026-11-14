-- P1-6: cadena HMAC-SHA256 (clave de servidor) y tabla de anclaje WORM.
-- La cadena SHA-256 existente sigue intacta para backward-compat.
-- La cadena HMAC empieza desde la primera fila nueva; filas antiguas tienen NULL.

ALTER TABLE payments.audit_log ADD COLUMN IF NOT EXISTS hmac_hash      TEXT;
ALTER TABLE payments.audit_log ADD COLUMN IF NOT EXISTS prev_hmac_hash TEXT;

-- Tabla de anclaje: cada fila congela el hash HMAC tail del momento.
-- WORM: no se puede modificar ni borrar.
CREATE TABLE IF NOT EXISTS payments.audit_anchors (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  anchored_at TEXT   NOT NULL,
  seq         BIGINT NOT NULL,
  hmac_hash   TEXT   NOT NULL,
  note        TEXT
);

CREATE OR REPLACE FUNCTION payments.audit_anchors_immutable() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit_anchors es inmutable';
END;
$$;

CREATE TRIGGER audit_anchors_no_modify
BEFORE UPDATE OR DELETE ON payments.audit_anchors
FOR EACH ROW EXECUTE FUNCTION payments.audit_anchors_immutable();
