-- 0031 · Remediación de seguridad P1:
--   1. P1-8: Migrar cualquier hash scrypt residual de users / onboarding_sessions a
--      payments.merchant_credentials y limpiar en firme users.security_pin y
--      onboarding_sessions.security_pin (nunca guardar PIN en texto claro ni duplicado).
--   2. F11: Pasar a revisión manual (PENDING) los RUCs de persona jurídica (20/15/17)
--      que quedaron con ruc_verified = TRUE sin revisión explícita.
--   3. P0-7: Alinear el valor por defecto de interest_rate en credit_purchases (0.055).
--   4. Permisos de rol (kuota_payments_rw) para las tablas creadas en 0022..0029.

-- 1. P1-8: Rescatar hashes scrypt válidos antes de limpiar las columnas legadas.
INSERT INTO payments.merchant_credentials (merchant_id, pin_hash, failed_attempts, locked_until, pin_updated_at)
SELECT mp.id, u.security_pin, 0, NULL, public.utc_now_text()
FROM public.merchant_profiles mp
JOIN public.users u ON u.id = mp.user_id
WHERE u.security_pin LIKE 'scrypt$%'
ON CONFLICT (merchant_id) DO NOTHING;

INSERT INTO payments.merchant_credentials (merchant_id, pin_hash, failed_attempts, locked_until, pin_updated_at)
SELECT mp.id, os.security_pin, 0, NULL, public.utc_now_text()
FROM public.merchant_profiles mp
JOIN public.onboarding_sessions os ON os.id = mp.session_id
WHERE os.security_pin LIKE 'scrypt$%'
ON CONFLICT (merchant_id) DO NOTHING;

UPDATE public.users SET security_pin = NULL WHERE security_pin IS NOT NULL;
UPDATE public.onboarding_sessions SET security_pin = NULL WHERE security_pin IS NOT NULL;

-- 2. F11: RUC de persona jurídica (20, 15, 17) sin ruc_review_status pasa a PENDING.
UPDATE public.merchant_profiles
SET ruc_verified = FALSE,
    ruc_review_status = 'PENDING',
    ruc_review_at = public.utc_now_text()
WHERE ruc_verified = TRUE
  AND ruc_review_status IS NULL
  AND ruc ~ '^(20|15|17)';

-- 3. P0-7: Valor por defecto de interest_rate en credit_purchases (5.5% = 0.055).
ALTER TABLE public.credit_purchases ALTER COLUMN interest_rate SET DEFAULT 0.055;

-- 4. Permisos para kuota_payments_rw sobre tablas de seguridad recientes.
GRANT SELECT, INSERT ON payments.audit_anchors TO kuota_payments_rw;
GRANT SELECT, INSERT, UPDATE, DELETE ON payments.rate_limit_buckets TO kuota_payments_rw;
GRANT SELECT, INSERT, UPDATE ON biometric_keys, biometric_challenges TO kuota_payments_rw;
GRANT SELECT, INSERT, UPDATE ON refresh_tokens TO kuota_payments_rw;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA payments TO kuota_payments_rw;
