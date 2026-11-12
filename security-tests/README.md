# Pruebas de seguridad de Kuota

Se corren **antes de cada APK y de cada despliegue**. Salen con código 1 si queda algún hallazgo CRÍTICO o ALTO.

| Comando | Qué hace |
|---|---|
| `bash security-tests/run-local.sh` | Levanta Postgres desechable (Docker), el simulador de 360pay y el backend en **modo producción** con secretos de un solo uso; corre todos los ataques y audita el APK. |
| `PENTEST_BASE=https://kuota-app-production.up.railway.app node security-tests/pentest.mjs --safe` | Producción, **solo pruebas no destructivas** (cabeceras, CORS, accesos sin credenciales, firmas, inyección en rutas públicas). Nunca correr la batería completa contra producción. |
| `node security-tests/apk-audit.mjs [ruta.apk]` | Auditoría estática del APK (firma, depurable, HTTP plano, WebView, secretos, política de red, pinning). |

Los informes quedan en `security-tests/reports/` (no se versionan).

## Qué se ataca

- **Autenticación:** rutas privadas sin credenciales, `X-Merchant-Id` ajeno, tokens falsos, JWT `alg=none`, rutas internas sin token de administración, proveedor con token inventado, consulta de contactos y foto de perfil sin sesión.
- **Autorización (IDOR):** un comercio intenta ver, emitir, cancelar o editar los links de otro; token de identidad cruzado; sesión de onboarding ajena.
- **Sesión:** token ligado al dispositivo, sesión única, cierre de sesión.
- **Fuerza bruta:** PIN de acceso y recuperación con DNI.
- **Lógica de negocio:** asignación masiva (comisión, neto, dueño, estado), montos inválidos, tope del plan Basic, titularidad del RUC, cambio de plan ajeno.
- **Pagos:** webhooks sin firma o con firma falsa (360pay, Openpay, Didit), código público alterado, doble pago, simulador en producción.
- **Inyección y entrada:** SQL en login, códigos y lookups; tipos JSON inesperados; XSS en el concepto y en el Libro de Reclamaciones; cuerpos enormes.
- **Transporte:** cabeceras (CSP, HSTS, X-Frame-Options), CORS, fugas en errores y `/health`, rutas de desarrollo cerradas.

## Pendientes conocidos (aceptados temporalmente)

- **Simulador de pagos encendido en producción** (`KUOTA_SANDBOX=1`): cualquiera con el código de un link puede marcarlo como pagado. Se apaga solo si se conecta la pasarela de producción de 360pay; apagarlo a mano antes de mover dinero real.
- **APK:** a clientes se entrega solo el de release (`npm run apk:release`, firmado con `frontend/android/keystore.properties`, no depurable). El de depuración (`npm run apk`) es solo para desarrollo.
- **Pinning de certificados:** el APK fija las CA raíz del hosting (Let's Encrypt y Google Trust Services) hasta `2027-12-31`; hay que revisarlas antes de esa fecha o al cambiar de hosting o dominio. Los tokens viven en el Android Keystore y el release usa R8.
