# Backend de Kuota en Google Cloud

La decisión es **Postgres para el dinero y Firebase para identidad, dispositivo y notificaciones**, todo dentro de Google Cloud. Este documento dice qué está hecho, cómo funciona y qué falta para desplegar.

## Estado de la hoja de ruta

| # | Paso | Estado | Qué hay |
|---|---|---|---|
| 1 | Monolito modular | ✅ | La zona de dinero tiene esquema propio (`payments`) y un pool propio (`paymentsDb`). Dos roles con privilegio mínimo: el núcleo no puede leer pagos, y pagos no puede editar ni borrar las tablas de solo agregado. Está probado. |
| 2 | SQLite → Postgres | ✅ | Migraciones versionadas en `backend/migrations/`. PGlite para desarrollo y pruebas; `pg` (Cloud SQL) para producción. 40 pruebas en verde sobre PGlite y sobre Postgres 16 real. Comparé 56 respuestas de la API con la versión SQLite y son equivalentes. |
| 3 | Firebase Auth + App Check | ⏳ | Necesita el proyecto de Firebase (ver abajo). |
| 4 | FCM (push) | ⏳ | Usa el mismo proyecto de Firebase. Las alertas ya se registran en `payments.merchant_alerts`. |
| 5 | API real de 360pay | 🟡 | Integrado según su documentación: cada link crea un cupón (`POST /coupons`, monto en soles, `external_ref` = id del link) y cancelarlo lo anula. El webhook `PAYMENT_PAID` usa su formato real: array, `X-360Pay-Signature` sobre timestamp ISO + "." + cuerpo, `X-360Pay-Event-Id` y `X-360Pay-Hook-Id`. Probado contra un 360pay simulado; falta la API key de sandbox para probarlo contra el real. |
| 6 | CI y despliegue | ✅ / ⏳ | `.github/workflows/ci.yml` corre tipos, pruebas en PGlite y en Postgres 16, auditoría y build. El despliegue a Cloud Run está escrito pero apagado hasta configurar GCP. |

## Arquitectura

```
App Kuota (Capacitor) ──HTTPS──► Cloud Run: kuota-backend (Express 5, Node 24)
   │  Firebase Auth / App Check       │  pool núcleo ──► Cloud SQL Postgres 16 · esquema public
   │  FCM (push)                      │  pool pagos  ──►                       · esquema payments
   └──────────────────────────────────┘  Secret Manager (secretos KUOTA_*, cadenas de conexión)
360pay ──webhook firmado (HMAC)──► /api/v1/webhooks/360pay
```

Siguientes piezas de GCP, en el orden en que hacen falta:
- **Cloud Armor:** WAF frente a la API.
- **Memorystore (Redis):** límite de tasa compartido entre réplicas.
- **Pub/Sub:** cola de webhooks y *outbox* de notificaciones.
- **Cloud Scheduler:** conciliación diaria.
- **Cloud Storage con Bucket Lock:** retención de la bitácora por 5 años.

## Base de datos

### Desarrollo
- **Base local:** el backend usa PGlite (Postgres real compilado a WASM) en `backend/.pgdata`. No hay que instalar nada. Para empezar de cero, borra esa carpeta.
- **Migrar a mano:** `npm --prefix backend run migrate`. Al arrancar también se migra solo, salvo con `KUOTA_AUTO_MIGRATE=0`.
- **Contra un Postgres real:** define `DATABASE_URL`. El puerto 5432 de esta PC ya lo usa otro proyecto, así que conviene otro:

  ```bash
  docker run -d --name kuota-pg -e POSTGRES_PASSWORD=<clave-local> -p 127.0.0.1:5433:5432 postgres:16-alpine
  ```

### Migraciones
- **Ubicación y orden:** van en `backend/migrations/NNNN_nombre.sql` y se aplican en orden.
- **Registro:** cada una queda en `public.schema_migrations` con su checksum.
- **No se editan:** una migración ya aplicada no se toca, se crea otra. Si cambia, el arranque falla a propósito.
- **Permisos de tablas nuevas:** cada tabla nueva debe otorgar sus permisos a `kuota_core_rw` o a `kuota_payments_rw`, igual que `0003_roles.sql`.

### Dos pools y dos roles

| Pool | Variable | Rol de grupo | Puede |
|---|---|---|---|
| `db` (núcleo) | `DATABASE_URL` | `kuota_core_rw` | Todo `public`. Nada de `payments`. |
| `paymentsDb` (zona de dinero) | `PAYMENTS_DATABASE_URL` | `kuota_payments_rw` | **Tablas con estado** (links, credenciales, sesiones): leer y escribir.<br>**Libro, pagos, bitácora, eventos y consentimientos:** solo insertar y leer.<br>**Del núcleo:** leer comercios; registrar la venta y el puntaje. |

En desarrollo los dos pools apuntan a la misma base PGlite. Los usuarios con login de Cloud SQL se crean con `backend/deploy/cloudsql/users.sql`.

### Concurrencia

Con varias réplicas y conexiones, las secciones críticas usan bloqueos de transacción (`pg_advisory_xact_lock`). Las cubiertas son:
- un eslabón de la bitácora a la vez;
- creación de links por comercio, para que dos cobros simultáneos no superen juntos el tope diario;
- cada evento de webhook;
- vinculación de dispositivos.

Además:
- los intentos fallidos de PIN se cuentan con un `UPDATE` atómico;
- la clave de idempotencia se reserva antes de procesar.

## Pruebas

```bash
npm --prefix backend test
```

- **Sin `DATABASE_URL`:** corren sobre PGlite en memoria.
- **Con `DATABASE_URL`:** cada archivo crea una base temporal en ese servidor y la borra al terminar. El CI hace ambas cosas.

## Desplegar en GCP

Esto se configura una vez por entorno, idealmente un proyecto para `kuota-staging` y otro para `kuota-prod`.

1. **Proyecto:** crearlo con facturación activa y habilitar las APIs de Cloud Run, Cloud SQL Admin, Artifact Registry, Secret Manager e IAM Credentials.
2. **Imágenes:** crear en Artifact Registry un repositorio Docker llamado `kuota` en la región elegida.
3. **Base de datos:** crear una instancia de Cloud SQL Postgres 16 con la base `kuota`. Después de la primera migración, crear los usuarios con `backend/deploy/cloudsql/users.sql`.
4. **Secretos en Secret Manager:**
   - Conexión: `kuota-core-database-url`, `kuota-payments-database-url` y `kuota-migrate-database-url`.
   - Claves de la app: `kuota-link-signing-key`, `kuota-webhook-secret`, `kuota-session-secret`, `kuota-pin-pepper` y `kuota-admin-token`, cada una de al menos 32 caracteres aleatorios.
5. **Acceso de GitHub:** configurar Workload Identity Federation para el repo (sin llaves de cuenta de servicio) y una cuenta de servicio de despliegue. Esa cuenta necesita estos roles: Cloud Run Admin, Artifact Registry Writer, Secret Manager Secret Accessor, Cloud SQL Client y Service Account User.
6. **Variables del repo** (GitHub › Settings › Variables): `GCP_PROJECT_ID`, `GCP_REGION`, `GCP_WIF_PROVIDER`, `GCP_DEPLOY_SA`, `GCP_SQL_INSTANCE`, `KUOTA_PAY_BASE_URL` y `KUOTA_CORS_ORIGINS`.

Con eso, cada push a `main` que pase las pruebas hace tres cosas:
1. Construye la imagen (`backend/Dockerfile`).
2. Corre las migraciones como job de Cloud Run.
3. Despliega `kuota-backend`.

Producción conviene dejarla con aprobación manual, como entorno protegido de GitHub.

## Lo que necesito de ti para los pasos 3 a 6

- **Firebase (pasos 3 y 4):**
  - Crear el proyecto (puede ser el mismo de GCP) y registrar la app Android `pe.kuota.app`. Necesita el SHA-256 del certificado de firma; para el APK de depuración actual es `3c:20:66:01:c1:04:42:73:cb:dc:93:e3:fe:e8:93:ee:76:b9:b9:31:24:c8:2f:7b:b9:ba:ba:f8:5d:a6:72:a8`.
  - Activar el inicio de sesión por teléfono y App Check. Play Integrity exige que la app esté en Play Console; mientras tanto se usa el proveedor de depuración.
  - Pasarme el `google-services.json`.
- **360pay (paso 5):**
  - La documentación de su API: crear un cobro o checkout, los webhooks y el reporte de liquidación.
  - Las credenciales de sandbox.
  - Si piden mTLS o lista de IPs, sus requisitos.
- **GCP (paso 6):** el proyecto con facturación activa. Tú creas los recursos de la lista anterior, o me das acceso para hacerlo desde `gcloud`.
