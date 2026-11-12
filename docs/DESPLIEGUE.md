# Despliegue

## Backend en Railway

Producción corre en Railway, servicio `kuota-app`, con la imagen de `backend/Dockerfile` (`backend/railway.json`).
Salud: `GET /api/v1/health`.

```bash
# desde la carpeta del repositorio, con la CLI de Railway iniciada (railway login / railway link)
railway up --service kuota-app --ci
curl https://<dominio>/api/v1/health
```

- Las migraciones (`backend/migrations/`) se aplican al arrancar mientras `KUOTA_AUTO_MIGRATE=1`. Cada migración se registra en
  `schema_migrations` y corre una sola vez.
- **Antes de desplegar:** `npm run check` y `bash security-tests/run-local.sh`. **Después:**
  `PENTEST_BASE=https://<dominio> node security-tests/pentest.mjs --safe` (solo pruebas no destructivas).
- **Reversar:** en Railway, redesplegar la versión anterior; si hubo una migración, revisar si es reversible antes de
  volver (hasta ahora las migraciones solo agregan tablas y columnas o limpian datos de ejemplo; no borran columnas en uso).
- Alternativa en Google Cloud (Cloud Run + Cloud SQL, con el job de migraciones): [BACKEND-GCP.md](BACKEND-GCP.md) y el
  trabajo `deploy-staging` del CI, apagado hasta configurar sus variables del repositorio.

## Variables de entorno

La lista completa y comentada está en [`backend/.env.example`](../backend/.env.example). En producción
(`NODE_ENV=production`) son obligatorios, con **mínimo 32 caracteres** cada uno:

| Variable | Uso |
|---|---|
| `DATABASE_URL` / `PAYMENTS_DATABASE_URL` | Postgres del núcleo y de la zona de dinero (dos usuarios distintos). |
| `KUOTA_LINK_SIGNING_KEY` | Firma del monto de cada link de cobro. |
| `KUOTA_WEBHOOK_SECRET` | Firma de los webhooks de 360pay (`whsec_…`). |
| `KUOTA_SESSION_SECRET` | Sesiones y tokens de identidad. |
| `KUOTA_PIN_PEPPER` | Pimienta del hash de los PIN (cambiarla invalida todos los PIN). |
| `KUOTA_ADMIN_TOKEN` | Rutas `/api/v1/internal/*`. |

Otras que conviene fijar: `KUOTA_PAY_BASE_URL` (dominio público de la página de pago), `KUOTA_CORS_ORIGINS`,
`KUOTA_TRUST_PROXY=1` (detrás de proxy; en Railway se activa solo), `KUOTA_REQUIRE_MERCHANT_TOKEN` (por defecto
obligatorio en producción), los datos de la empresa (`KUOTA_COMPANY_*`, `KUOTA_CONTACT_EMAIL`) y el correo
(`KUOTA_SMTP_URL` o `RESEND_API_KEY`). **Los secretos los carga una persona en Railway; nunca van al repositorio.**

La app (APK) usa `VITE_API_BASE`, `VITE_SUPPORT_WHATSAPP` y `VITE_FEE_PCT` al compilarse (ver
[`frontend/.env.example`](../frontend/.env.example)).

## APK de Android

1. **Una sola vez:** crear el almacén de claves con `keytool -genkeypair -v -keystore kuota-release.jks -alias kuota -keyalg RSA -keysize 2048 -validity 10000`,
   guardarlo **fuera del repositorio** con una copia de respaldo, y copiar `frontend/android/keystore.properties.example`
   a `keystore.properties` con su ruta y contraseñas. Sin ese archivo no se pueden publicar actualizaciones.
2. Crear `frontend/.env.android` con `VITE_API_BASE=https://<dominio>/api/v1`.
3. Compilar: `cd frontend && npm run apk:release` → `frontend/android/app/build/outputs/apk/release/app-release.apk`
   (R8 activado, no depurable, tokens en el Keystore).
4. Auditar: `node security-tests/apk-audit.mjs` (firma, depuración, HTTP plano, secretos, política de red, pinning).
5. Publicar: copiar a `releases/Kuota.apk`, actualizar el SHA-256 en `releases/README.md` y subirlo al release de GitHub:

   ```bash
   gh release upload v0.1.0-pitch releases/Kuota.apk --clobber
   ```

   El release `v0.1.0-pitch` es el del código QR de descarga: el nombre del archivo en el release es `kuota.apk`.

**Fecha de vencimiento de los pines de certificado:** `frontend/android/app/src/main/res/xml/network_security_config.xml`
fija las CA raíz del hosting con vencimiento `2027-12-31`. Antes de esa fecha hay que publicar una versión con los pines
revisados, o los celulares dejarán de conectarse. Si se cambia de hosting o de dominio, revisarlos de inmediato.

## Antes de mover dinero real

Hoy todo funciona en **modo simulado** (`KUOTA_SANDBOX=1`, hallazgo `SBX-01` aceptado). Pendiente antes de operar con dinero:

- [ ] Conectar 360pay de producción (API key, hook `PAYMENT_PAID`, `KUOTA_WEBHOOK_SECRET`) y **apagar `KUOTA_SANDBOX`**; verificar con la batería que el simulador responde 404.
- [ ] Definir cómo el banco confirma el pago de una **cuota** de crédito (hoy `POST /credit/installments/:id/pay` y `/purchases/:id/settle` se bloquean fuera del modo simulado).
- [ ] Cargar los datos legales reales (`KUOTA_COMPANY_NAME`, `KUOTA_COMPANY_RUC`, `KUOTA_COMPANY_ADDRESS`, `KUOTA_CONTACT_EMAIL`) para las páginas de privacidad, términos y Libro de Reclamaciones.
- [ ] Configurar el correo de avisos (SMTP o Resend) y el WhatsApp oficial de soporte (`VITE_SUPPORT_WHATSAPP`).
- [ ] Revisar el [informe de cumplimiento](CUMPLIMIENTO-REGULATORIO.md) y los textos legales con un abogado.
- [ ] Dominio propio, copias de seguridad automáticas de Postgres y alertas de errores.
- [ ] Definir la licencia del repositorio y revisar qué documentos pueden seguir siendo públicos.
