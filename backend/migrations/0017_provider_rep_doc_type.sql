-- Documento del representante legal del proveedor: DNI o CE (carnet de extranjería).
ALTER TABLE public.provider_profiles ADD COLUMN IF NOT EXISTS legal_rep_doc_type TEXT NOT NULL DEFAULT 'DNI';
