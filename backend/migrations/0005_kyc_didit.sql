-- 0005 · KYC real con Didit (documento + prueba de vida + comparación facial).
-- Kuota ya no guarda imágenes del DNI ni selfies (Ley 29733: minimización):
-- las procesa el proveedor y aquí queda solo el resultado y su referencia.

ALTER TABLE public.kyc_requests
  DROP COLUMN IF EXISTS dni_front,
  DROP COLUMN IF EXISTS dni_back,
  DROP COLUMN IF EXISTS selfie,
  ADD COLUMN provider TEXT NOT NULL DEFAULT 'DEMO',
  ADD COLUMN provider_session_id TEXT UNIQUE,
  ADD COLUMN verification_url TEXT,
  ADD COLUMN decision_status TEXT,
  ADD COLUMN decision_reason TEXT,
  ADD COLUMN decision_summary_json TEXT,
  ADD COLUMN verified_at TEXT;

-- Webhooks de Didit ya procesados (entrega con reintentos: cada event_id una vez).
CREATE TABLE public.kyc_webhook_events (
  event_id TEXT PRIMARY KEY,
  session_id TEXT,
  status TEXT,
  received_at TEXT NOT NULL
);

GRANT SELECT, INSERT ON public.kyc_webhook_events TO kuota_core_rw;
