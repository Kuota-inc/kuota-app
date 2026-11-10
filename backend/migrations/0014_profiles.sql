-- Perfiles: el RUC verificado (SUNAT) es la llave para vender y para el perfil Provider.
-- Kuota Payments (vender) se activa con el paywall; los comercios que ya existían quedan activos.
ALTER TABLE public.merchant_profiles ADD COLUMN IF NOT EXISTS ruc_verified BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.merchant_profiles ADD COLUMN IF NOT EXISTS payments_active BOOLEAN NOT NULL DEFAULT TRUE;
UPDATE public.merchant_profiles SET ruc_verified = TRUE WHERE ruc IS NOT NULL AND ruc IN (SELECT ruc FROM public.businesses);
