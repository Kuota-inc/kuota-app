-- Usuarios con login de Cloud SQL para Kuota. Ejecutar una vez por entorno, como
-- administrador, DESPUÉS de correr las migraciones (crean los roles de grupo).
--
-- Mientras el backend es un solo servicio de Cloud Run (monolito modular), ese
-- servicio necesita DOS usuarios de base (núcleo y pagos). Con IAM un servicio
-- tiene una sola identidad, así que se usan usuarios con contraseña larga y
-- aleatoria guardada en Secret Manager (nunca en el repositorio):
--
--   gcloud sql users create kuota_core     --instance=INSTANCIA --password="$(openssl rand -hex 32)"
--   gcloud sql users create kuota_payments --instance=INSTANCIA --password="$(openssl rand -hex 32)"
--
-- Cuando la zona de dinero sea un servicio aparte, cada servicio usará su cuenta
-- de servicio con autenticación IAM de Cloud SQL (sin contraseñas).
--
-- Luego, conectado a la base kuota:

GRANT kuota_core_rw TO kuota_core;
GRANT kuota_payments_rw TO kuota_payments;

-- Cadenas de conexión (Secret Manager), vía el socket de Cloud SQL en Cloud Run:
--   kuota-core-database-url      postgres://kuota_core:CLAVE@/kuota?host=/cloudsql/PROYECTO:REGION:INSTANCIA
--   kuota-payments-database-url  postgres://kuota_payments:CLAVE@/kuota?host=/cloudsql/PROYECTO:REGION:INSTANCIA
--   kuota-migrate-database-url   (usuario dueño del esquema, solo para el job de migraciones)
