-- Planes de suscripción de Kuota Payments (Basic S/80 + IGV, Pro S/120 + IGV).
-- Mientras no haya banco real el cobro de la suscripción no se ejecuta: solo se registra el plan elegido.
ALTER TABLE public.merchant_profiles ADD COLUMN IF NOT EXISTS plan TEXT NOT NULL DEFAULT 'BASIC';
ALTER TABLE public.merchant_profiles ADD COLUMN IF NOT EXISTS plan_changed_at TEXT;
