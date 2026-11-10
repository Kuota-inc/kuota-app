-- Titularidad del RUC: un RUC de empresa (20/15/17) no se marca como verificado solo porque exista en SUNAT.
-- Queda en revisión manual (KYB) hasta que operaciones confirme que el usuario representa a la empresa.
ALTER TABLE public.merchant_profiles ADD COLUMN IF NOT EXISTS ruc_review_status TEXT;
ALTER TABLE public.merchant_profiles ADD COLUMN IF NOT EXISTS ruc_review_at TEXT;
