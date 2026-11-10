-- Documento de identidad del emprendedor: DNI (peruano) o CE (carnet de extranjería).
-- El número se sigue guardando en merchant_profiles.dni para no romper la recuperación de PIN ni el KYC.
ALTER TABLE public.merchant_profiles ADD COLUMN IF NOT EXISTS doc_type TEXT NOT NULL DEFAULT 'DNI';
