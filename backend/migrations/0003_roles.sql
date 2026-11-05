-- 0003 · Roles de grupo con privilegio mínimo (monolito modular).
--   kuota_core_rw      núcleo: esquema public; sin acceso al esquema payments.
--   kuota_payments_rw  zona de dinero: esquema payments y, del núcleo, solo lo que
--                      necesita (leer comercios; registrar la venta y el score).
-- Los usuarios con login (y sus contraseñas o IAM) los crea operaciones en Cloud
-- SQL y se les asigna el rol de grupo: ver deploy/cloudsql/users.sql.
-- Cada migración que cree tablas nuevas debe otorgar sus permisos aquí abajo.

-- Los roles son del clúster: si dos bases se migran a la vez, una puede crearlos
-- primero; la otra lo tolera.
DO $$
DECLARE r TEXT;
BEGIN
  FOREACH r IN ARRAY ARRAY['kuota_core_rw', 'kuota_payments_rw'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      BEGIN
        EXECUTE format('CREATE ROLE %I NOLOGIN', r);
      EXCEPTION WHEN duplicate_object OR unique_violation THEN
        NULL;
      END;
    END IF;
  END LOOP;
END $$;

-- Núcleo ------------------------------------------------------------------
REVOKE ALL ON SCHEMA payments FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO kuota_core_rw;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO kuota_core_rw;
REVOKE INSERT, UPDATE, DELETE ON public.schema_migrations FROM kuota_core_rw;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO kuota_core_rw;

-- Zona de dinero ----------------------------------------------------------
GRANT USAGE ON SCHEMA payments, public TO kuota_payments_rw;

-- Tablas de solo agregado: sin UPDATE ni DELETE (además de los triggers).
GRANT SELECT, INSERT ON
  payments.payments, payments.ledger_entries, payments.audit_log, payments.payment_events,
  payments.consent_records, payments.risk_decisions, payments.webhook_events,
  payments.payment_attempts, payments.merchant_alerts, payments.reconciliation_runs
TO kuota_payments_rw;

-- Tablas con estado que sí cambia.
GRANT SELECT, INSERT, UPDATE ON
  payments.payment_links, payments.merchant_credentials, payments.merchant_devices,
  payments.merchant_sessions, payments.step_up_grants, payments.merchant_limit_settings,
  payments.risk_rules, payments.risk_reviews, payments.feature_flags
TO kuota_payments_rw;
GRANT SELECT, INSERT, UPDATE, DELETE ON payments.idempotency_keys, payments.risk_lists TO kuota_payments_rw;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA payments TO kuota_payments_rw;

-- Lo mínimo del núcleo.
GRANT SELECT ON public.merchant_profiles, public.users, public.onboarding_sessions TO kuota_payments_rw;
GRANT INSERT ON public.sales, public.score_events TO kuota_payments_rw;
GRANT SELECT, UPDATE (score) ON public.credit_scores TO kuota_payments_rw;
