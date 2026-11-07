-- Libro de Reclamaciones virtual (Ley 29571, DS 011-2011-PCM; respuesta en 15 días hábiles, Ley 31435).
CREATE TABLE IF NOT EXISTS public.complaints (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  kind TEXT NOT NULL CHECK (kind IN ('RECLAMO', 'QUEJA')),
  full_name TEXT NOT NULL,
  doc_type TEXT NOT NULL,
  doc_number TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT NOT NULL,
  address TEXT,
  service TEXT,
  claim_amount_cents INTEGER,
  description TEXT NOT NULL,
  request TEXT,
  merchant_id TEXT,
  status TEXT NOT NULL DEFAULT 'RECEIVED',
  created_at TEXT NOT NULL,
  due_at TEXT NOT NULL,
  responded_at TEXT,
  response TEXT
);

CREATE INDEX IF NOT EXISTS complaints_status_idx ON public.complaints (status, due_at);

GRANT SELECT, INSERT, UPDATE ON public.complaints TO kuota_core_rw;
