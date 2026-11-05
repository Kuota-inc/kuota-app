# Kuota Payments: estado del plan de seguridad

Este documento compara el *Plan de implementación de seguridad* (v1, 5 nov 2026) con el código de este repositorio. Para cada punto indica qué quedó implementado, dónde está y cómo se prueba, y qué depende de infraestructura, de contratos o del equipo.

- **Pruebas automáticas:** `npm --prefix backend test`. Son 29 pruebas de seguridad en `backend/test/payments-security.test.ts` y 11 de plataforma (aislamiento por roles, migraciones, flujos del núcleo) en `backend/test/platform.test.ts`. Corren sobre Postgres: PGlite en memoria o un Postgres 16 real si hay `DATABASE_URL`, como en el CI.
- **Código de seguridad:** `backend/src/security/`. Tablas, triggers de inmutabilidad y roles: `backend/migrations/0002_payments.sql` y `0003_roles.sql`.
- **Rutas:** `backend/src/routes/` (paymentLink, security, webhook, internal).

> **Diferencia con un supuesto del plan.** El plan asume una app Android en Kotlin. La app real es React con Capacitor (WebView) y un backend Node/Express con Postgres. Los controles del servidor no cambian. Los nativos sí: BiometricPrompt, Keystore, Play Integrity, bloqueo de capturas y detección de root u overlays necesitan plugins de Capacitor o código en `MainActivity`. Quedan como pendientes (punto 6).

**Leyenda.**
- ✅ Implementado y probado.
- 🟡 Parcial: hay código, falta su versión de producción.
- ⬜ Fuera del código: organizacional, contratos o infraestructura.

## Estado por punto

| # | Punto | Estado | Qué hay en el código | Qué falta |
|---|---|---|---|---|
| 1 | Gobierno y SGSI | ⬜ | Este documento y el checklist como punto de partida | Política aprobada, registro de riesgos, roles, gestión del cambio |
| 2 | Terceros y nube | ⬜ | Dependencias fijadas en `package-lock.json` | Inventario de terceros, cuestionarios, cláusulas, plan de salida |
| 3 | Arquitectura y aislamiento | 🟡 | El dinero se mueve solo por rutas definidas (links, webhook, conciliación). Las rutas internas están separadas y exigen token. La zona de dinero tiene su esquema (`payments`) y su usuario de base: el núcleo no puede leerla y pagos no puede editar ni borrar las tablas de solo agregado (probado) | Proyectos de GCP por entorno, red privada para Cloud SQL, Terraform y acceso administrativo efímero |
| 4 | Protección de datos | 🟡 | PIN con scrypt y pimienta; migración de los PIN que estaban en texto plano. Secretos fuera de git (`.dev-secrets.json` en desarrollo; en producción el proceso no arranca sin ellos). Sin datos de tarjeta. RUC enmascarado en la página de pago. Logs sin cuerpos de respuesta. `Cache-Control: no-store` | TLS en todo el tráfico (hoy el APK usa HTTP en la LAN), KMS, tokenizar DNI, RUC y teléfono, revisión de la Ley 29733, bloqueo de capturas en Android |
| 5 | Verificación por niveles | 🟡 | Dos niveles (Básico y Ampliado, según `kyc_status`) con sus límites. El pagador ve el nombre y el nivel de verificación antes de pagar (`/pay/<código>`) | Proveedor de identidad con prueba de vida, validar la titularidad de la cuenta de abono y señales anti SIM-swap |
| 6 | Autenticación, dispositivo y consentimiento | 🟡 | Sesión corta (15 min) ligada al dispositivo, revocable. Bloqueo tras 5 PIN fallidos (15 min). Un dispositivo nuevo o un cambio de PIN abren un enfriamiento de 24 h con límites al 25 %. Montos altos, subir límites y desvincular un dispositivo piden PIN con un resumen generado por el servidor, en un permiso de un solo uso para esa acción exacta. El consentimiento se registra (quién, cuándo, dispositivo, resumen). Cierre remoto de sesiones | IdP con OTP en lugar de la identidad demo, BiometricPrompt y Keystore, Play Integrity, pinning, protección en tiempo de ejecución |
| 7 | Acceso interno y privilegiado | 🟡 | Las rutas internas exigen un token de operaciones y quedan en la bitácora con el analista | SSO con FIDO2, acceso a producción justo a tiempo, aprobación de dos personas, gestión de equipos |
| 8 | Seguridad del QR y de los links | ✅ | Token opaco de 128 bits. La URL lleva un MAC, así que un código inventado se rechaza sin consultar la base. Firma HMAC de titular, monto, moneda y vencimiento: si se altera, el link no se puede pagar. Vencimiento (48 h) y uso único. Monto inmutable, protegido por trigger. Solo el dueño puede emitir, editar o cancelar. El QR se genera en el dispositivo (antes se usaba api.qrserver.com). Alertas al generar y al cobrar | QR estático propio del comercio con alerta al regenerarlo (hoy cada QR es de un link), dominio de pago dedicado con DMARC, SPF y DKIM, monitoreo de dominios parecidos |
| 9 | Límites y fricción escalonada | ✅ | Límite por cobro, por día y por número de cobros según el nivel. Siempre rige el más restrictivo entre el nivel, el límite propio, el tope de 360pay y el enfriamiento. El comercio baja sus límites al instante; subirlos pide PIN y espera 24 h, y la subida pendiente se puede cancelar | Calibrar los topes con datos reales y confirmar los de 360pay |
| 10 | APIs | ✅ | Webhook con HMAC-SHA256 (`X-Signature-256`), ventana de 300 s y `X-360pay-Event-ID` único: una repetición no tiene efecto y un mismo id con otro cuerpo da 409. `Idempotency-Key` obligatorio al crear cobros. Validación estricta de montos y textos. Límite de tasa. Autorización por objeto (BOLA). Encabezados de seguridad y CORS con lista de orígenes. Errores 5xx sin detalles en producción | Contratos OpenAPI de estas rutas compartidos con 360pay, pruebas de contrato, WAF y API Gateway |
| 11 | Antifraude en tiempo real | ✅ | Motor con 14 reglas explicables (`risk_rules`), editables sin redeploy, y listas negra, gris y blanca. Decisión graduada: aprobar, pedir PIN, retener (`ON_HOLD`) o bloquear. Un bloqueo no revela qué regla lo disparó. Cola de revisión: un fraude confirmado pasa el dispositivo a la lista gris. Métricas de decisiones, falsos positivos y latencia p50/p95 | Modelos de ML con datos reales, huella de dispositivo, señales compartidas con 360pay, patrón de mula (hace falta el flujo de payouts) |
| 12 | Conciliación e integridad | ✅ | Libro de doble partida y eventos de cobro de solo agregado (triggers). La conciliación revisa que cada pago tenga un link pagado con el mismo monto, que el libro cuadre por pago y en total, que el reparto neto y comisión sea correcto, la firma de los links, los cobros procesados dos veces, las capturas de 360pay no abonadas y el reporte de 360pay (falta en un lado o en el otro, monto distinto) | Ejecución programada, tablero de excepciones, separación de funciones y doble control en ajustes |
| 13 | Monitoreo y respuesta a incidentes | 🟡 | Interruptores para apagar la creación de links, la página de pago y el procesamiento de webhooks sin redeploy. Revocación masiva de sesiones. Bitácora con eventos de seguridad | SIEM, alertas y guardias, plan de respuesta con plazos de reporte, simulacros |
| 14 | Reclamos y reporte de fraude | ⬜ | Las alertas le indican al comercio cómo actuar | Reporte con un toque en la app, gestión de casos, SLA de 15 días hábiles, contracargos vía 360pay |
| 15 | Desarrollo seguro | 🟡 | Pruebas de seguridad automatizadas, lint y tipos estrictos | CI con SAST y escaneo de dependencias, secretos y contenedores; ramas protegidas; firma de artefactos |
| 16 | Pentest y evidencia | ⬜ | Las pruebas sirven de base para el alcance (montos, links, BOLA) | Pentest externo (MASVS, ASVS) y re-prueba |
| 17 | Resiliencia 24/7 | 🟡 | Un cobro nunca queda ambiguo: el pago entero es una sola transacción y la actualización a `PAID` es condicional. Si 360pay cobra un link vencido o con otro monto, queda como excepción para devolverlo | Multi-AZ, réplicas, backups probados, página de estado |
| 18 | Registros y auditoría | 🟡 | Bitácora encadenada con SHA-256, de solo agregado, sin PIN ni tokens; su verificación detecta alteraciones (`GET /internal/audit/verify`) | Retención de 5 años en almacenamiento WORM (S3 Object Lock), sincronización horaria, búsqueda de punta a punta |
| 19 | Educación antifraude | 🟡 | Mensajes de "Kuota nunca te pedirá tu PIN" en el panel de PIN y en la actividad. Guía para el pagador sobre QR pegados encima | Centro de ayuda, plantillas oficiales de WhatsApp, capacitación del equipo |
| 20 | Cumplimiento | ⬜ | Este mapa | Alcance PCI con 360pay, mapa legal, ISO 27001 y SOC 2 |

## Checklist de validación: evidencia disponible en el código

| # | Criterio | Evidencia |
|---|---|---|
| 4 | Sin datos de tarjeta en Kuota; datos sensibles protegidos | La tarjeta se ingresa en la página de 360pay. Prueba "el PIN se guarda como hash" |
| 5 | Nombre verificado visible antes de pagar | Página `/pay/<código>` (`frontend/src/screens/pay/PayPage.tsx`) |
| 6 | PIN y vinculación de dispositivo activos | Pruebas "PIN incorrecto… bloquea", "la sesión queda ligada al dispositivo", "dispositivo nuevo: enfriamiento" |
| 6 | Autenticación adicional en acciones críticas | Pruebas "monto alto pide PIN…", "subirlos pide PIN…", "desvincular… exige PIN" |
| 6 | Consentimiento registrado | Tabla `consent_records`; la prueba de monto alto verifica dispositivo y resumen |
| 8 | Links con vencimiento, monto fijo e identificadores no predecibles | Pruebas "token de 128 bits y URL con MAC", "inmutables", "vencido", "monto alterado invalida la firma" |
| 9 | Límites por cobro, día y operaciones, con PIN para subirlos | Pruebas de "Límites y confirmación con PIN" |
| 10 | Webhooks firmados, idempotencia y anti-repetición | Pruebas de "Webhook firmado de 360pay" y de idempotencia en links |
| 11 | Decisiones graduadas, listas y métricas | Pruebas de "Antifraude"; `GET /internal/risk/metrics` |
| 12 | Conciliación con alertas | Prueba de conciliación; `POST /internal/reconciliation/run` |
| 17 | Ningún cobro queda ambiguo | Transacción única en `security/webhook.ts`; pruebas de doble cobro y de monto distinto |
| 18 | Registros inmutables | Pruebas "solo agregado" y "alterar una fila rompe la cadena" (falta la retención de 5 años) |

El resto del checklist (política, contratos, SIEM, pentest, capacitación, PCI, asesoría legal) requiere evidencia fuera del repositorio.

## Contrato del webhook de 360pay

Según https://api.360pay.pe/docs/webhooks (hook `PAYMENT_PAID`). El bloque de abajo describe la versión anterior; la vigente es:

```
POST /api/v1/webhooks/360pay
X-360Pay-Signature: sha256=<hex HMAC-SHA256(signing_secret, "<timestamp ISO>.<cuerpo crudo>")>
X-360Pay-Timestamp: <fecha ISO>       (se rechaza fuera de ±5 min)
X-360Pay-Event-Id:  <id estable>      (entrega at-least-once: repetido, sin efecto)
X-360Pay-Hook-Id:   <hook>            (debe coincidir con KUOTA_360PAY_HOOK_ID si está definido)

[{ "event": "ticket.paid", "_id": "<cupón>", "external_ref": "<id del link>", "amount": 50,
   "status": "paid", "paid_at": "…", "operation_number": "…", "bank_tx_id": "BCP" }]
```

Versión anterior (sandbox local `rail-go`, ya no se usa):

```
POST /api/v1/webhooks/360pay
X-Signature-256:    sha256=<hex HMAC-SHA256(KUOTA_WEBHOOK_SECRET, "<timestamp>.<cuerpo>")>
X-360pay-Timestamp: <segundos Unix>   (se rechaza fuera de ±300 s)
X-360pay-Event-ID:  <id único>        (repetido: misma respuesta, sin efecto)

{ "type": "payment_captured" | "payment_rejected",
  "payment": { "reference": "<código público del link>", "amount_minor": 5000, "currency": "PEN",
               "method": "YAPE" | "PLIN" | "CARD", "gateway_ref": "GW-…", "payer_fingerprint": "…" } }
```

- Una firma o un tiempo inválidos devuelven 401.
- Un rechazo de negocio (monto distinto, link vencido, ya pagado) devuelve 200 con `status: REJECTED`, para que 360pay no reintente. Además queda como excepción de conciliación.

## Rutas

| Ruta | Acceso | Uso |
|---|---|---|
| `GET /auth/pin/status`, `POST /auth/sessions` | PIN | Abrir sesión (dispositivo en `X-Device-Id`) |
| `POST /auth/step-up` | Sesión + PIN | Permiso de un solo uso para una acción (`X-Step-Up-Token`) |
| `POST /auth/pin/change`, `DELETE /auth/sessions/current` | Sesión | Cambiar PIN y cerrar sesión |
| `POST /payment-links` (`Idempotency-Key`), `GET /payment-links[/:id]`, `POST /:id/issue`, `POST /:id/cancel`, `PATCH /:id/customer` | Sesión (dueño) | Links de cobro |
| `GET /payment-links/public/:código` | Público, con límite de tasa | Pantalla previa al pago |
| `GET/PUT /merchants/me/payments/limits`, `DELETE …/limits/pending` | Sesión | Límites |
| `GET /merchants/me/payments/devices`, `DELETE …/devices/:ref`, `GET …/alerts` | Sesión | Dispositivos y alertas |
| `POST /webhooks/360pay` | Firma HMAC | Notificación de pago |
| `POST /sandbox/360pay/pay` | Solo desarrollo | Simula la página de pago de 360pay |
| `/internal/*` (reconciliation, audit, risk, sessions/revoke, features) | `Authorization: Bearer <KUOTA_ADMIN_TOKEN>` | Operaciones |

## Configuración

Las variables están descritas en `backend/.env.example`.

- **Producción** (`NODE_ENV=production`): el backend exige cinco secretos de al menos 32 caracteres y desactiva el sandbox.
- **Desarrollo:** los secretos se generan en `backend/.dev-secrets.json`, que no se versiona. El token de operaciones está en ese mismo archivo.

## Puntos abiertos con 360pay

Siguen abiertos los puntos de la sección 4 del plan:
- responsabilidades contractuales;
- QR propio o interoperable;
- plazos de reporte de incidentes;
- alcance PCI;
- límites de 360pay (hoy configurables con `KUOTA_PARTNER_*`);
- señales de riesgo compartidas;
- retención de registros.
