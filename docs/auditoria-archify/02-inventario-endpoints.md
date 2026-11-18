# Inventario Exhaustivo de Endpoints - Kuota API

> **Commit de Referencia:** `d7bac8b329d817bd6cc39f4fae0e751bda319c5d`  
> **Rama:** `fix/proveedor-inicio-conciliacion`  
> **Fecha de Auditoría:** 14 de Noviembre de 2026  
> **Servidor Base:** Express.js sobre Node.js (TypeScript)

Este inventario documenta los endpoints críticos del backend de Kuota, detallando sus mecanismos de autenticación, roles autorizados, validación de esquemas, mutaciones y referencias precisas en el código fuente.

---

## 1. Módulo de Autenticación, Sesiones y Seguridad (`/api/v1/auth`)

### EP-SEC-01: `POST /api/v1/auth/login`
- **Actor / Rol:** Merchant / Provider
- **Autenticación:** Pública (requiere teléfono y PIN)
- **Validación de Entrada:** Teléfono (9 dígitos peruanos), PIN numérico (6 dígitos), `deviceId` (alfanumérico 16-64 chars).
- **Efectos Secundarios:**
  - Verifica hash `scrypt + HMAC-SHA256(pinPepper, pin)` mediante `crypto.timingSafeEqual` en tabla `merchant_credentials` / `provider_profiles`.
  - Dispara revocación mono-dispositivo: `revokeSessions(merchantId, { exceptDeviceId })`.
  - Emite Access Token `ks1.*` firmado con HMAC SHA-256 (TTL 900s / 15 min) y Refresh Token rotativo (TTL 90d).
  - Registra entrada en `audit_log` con acción `AUTH_LOGIN`.
- **Ubicación en Código:** `backend/src/routes/security.routes.ts:L470-L515` (Commit: `d7bac8b329d817bd6cc39f4fae0e751bda319c5d`)

### EP-SEC-02: `POST /api/v1/auth/refresh`
- **Actor / Rol:** Merchant / Provider (Token Holder)
- **Autenticación:** Refresh Token (en body o cabecera)
- **Validación de Entrada:** String token de 32 bytes base64url, `deviceId` coincidente.
- **Efectos Secundarios:**
  - Valida hash SHA-256 en tabla `refresh_tokens`.
  - Detección de reuso: si el token ya fue utilizado, revoca inmediatamente toda la familia (`family_id`).
  - Emite nuevo Access Token y nuevo Refresh Token (rotación estricta).
- **Ubicación en Código:** `backend/src/routes/security.routes.ts:L540-L585` (Commit: `d7bac8b329d817bd6cc39f4fae0e751bda319c5d`)

### EP-SEC-03: `POST /api/v1/auth/step-up`
- **Actor / Rol:** Merchant / Provider autenticado
- **Autenticación:** Bearer token `ks1` + Verificación Biométrica Didit o Reingreso de PIN
- **Validación de Entrada:** `challenge_id` biométrico o PIN en texto claro verificado contra `scrypt` (`verifyPin`).
- **Efectos Secundarios:**
  - Emite `step_up_token` firmado con TTL corto de 120 segundos (`stepUpTtlSec = 120`, 2 minutos).
  - Habilita la ejecución de mutaciones sensibles (ej. cambio de cuenta CCI).
- **Ubicación en Código:** `backend/src/routes/security.routes.ts:L620-L665` (Commit: `d7bac8b329d817bd6cc39f4fae0e751bda319c5d`)

---

## 2. Módulo de Links de Pago y Checkout (`/api/v1/payment-links`, `/pay`)

### EP-LNK-01: `POST /api/v1/payment-links`
- **Actor / Rol:** Merchant / Provider
- **Autenticación:** Bearer `ks1` (`requireMerchant`, `requireFeature('LINK_CREATE')`)
- **Validación de Entrada:** `amount_cents` (entero positivo), `concept` (máx 140 chars), `customer_phone` (opcional), cabecera `Idempotency-Key`.
- **Efectos Secundarios:**
  - Aplica control de límites transaccionales según plan (Basic máx S/ 5,000).
  - Calcula comisiones (1% + IGV 18%, mínimo S/ 4.50 + IGV).
  - Genera link con expiración a 48 horas (`addHours(now, 48)`).
  - Firma digital interna HMAC sobre `link_id:amount_cents:merchant_id`.
  - Registra intención en tabla `payment_links` con estado inicial `ACTIVE`.
- **Ubicación en Código:** `backend/src/routes/paymentLink.routes.ts:L114-L205` (Commit: `d7bac8b329d817bd6cc39f4fae0e751bda319c5d`)

### EP-LNK-02: `GET /api/v1/payment-links/:id`
- **Actor / Rol:** Merchant propietario / Admin
- **Autenticación:** Bearer `ks1` con filtro tenant `WHERE merchant_id = auth.merchantId`
- **Validación de Entrada:** Identificador opaco de link en parámetro de ruta.
- **Efectos Secundarios:**
  - Consulta estado actualizado. Si está `PAID` pero expiró en pasarela, ejecuta refresco.
- **Ubicación en Código:** `backend/src/routes/paymentLink.routes.ts:L218-L224` (Commit: `d7bac8b329d817bd6cc39f4fae0e751bda319c5d`)

### EP-LNK-03: `POST /api/v1/payment-links/:id/cancel`
- **Actor / Rol:** Merchant propietario
- **Autenticación:** Bearer `ks1`
- **Validación de Entrada:** Identificador opaco de link.
- **Efectos Secundarios:**
  - Verifica que el estado actual sea `ACTIVE`.
  - Actualiza estado a `CANCELLED` (UI **"Anulado"**).
  - Registra auditoría y notifica anulación.
- **Ubicación en Código:** `backend/src/routes/paymentLink.routes.ts:L270-L295` (Commit: `d7bac8b329d817bd6cc39f4fae0e751bda319c5d`)

---

## 3. Módulo de Webhooks de Pasarelas (`/api/v1/webhooks`)

### EP-WHK-01: `POST /api/v1/webhooks/360pay`
- **Actor / Rol:** Pasarela 360Pay (Gateway externo)
- **Autenticación:** Firma Criptográfica HMAC SHA-256 en cabecera `X-360Pay-Signature`
- **Validación de Entrada:**
  - Cabeceras: `X-360Pay-Signature`, `X-360Pay-Timestamp`, `X-360Pay-Event-Id`, `X-360Pay-Hook-Id`.
  - Tolerancia de timestamp: máx 5 minutos (300,000 ms).
  - Cuerpo: Array JSON de objetos `Pay360PaidItem` (`_id`, `external_ref`, `amount`, `status: 'paid'`).
- **Efectos Secundarios:**
  - Deduplicación idempotente: si `event_id` ya existe en `webhook_events`, retorna HTTP 200 sin reprocesar.
  - Verifica firma del link contra manipulación (`linkSignatureValid`).
  - Actualiza link a `PAID` con `paid_at = nowIso()`.
  - Registra asiento en el ledger contable de partida doble (`recordLedgerEntry`).
  - Emite evento `payment.paid` y push notification al comercio.
- **Ubicación en Código:** `backend/src/routes/webhook.routes.ts:L22-L34` y `backend/src/security/webhook.ts:L110-L245` (Commit: `d7bac8b329d817bd6cc39f4fae0e751bda319c5d`)

### EP-WHK-02: `POST /api/v1/webhooks/didit`
- **Actor / Rol:** Proveedor Biométrico Didit
- **Autenticación:** Firma Criptográfica HMAC SHA-256 en cabecera `X-Didit-Signature`
- **Validación de Entrada:** Objeto JSON con `session_id`, `status: 'Approved' | 'Declined'`, `features`.
- **Efectos Secundarios:**
  - Actualiza estado de KYC en `kyc_requests` y perfil del comercio/proveedor.
  - Si es aprobado, marca RUC como verificado y activa límites comerciales.
- **Ubicación en Código:** `backend/src/routes/webhook.routes.ts:L36-L70` y `backend/src/security/diditGuard.ts:L40-L95` (Commit: `d7bac8b329d817bd6cc39f4fae0e751bda319c5d`)

---

## 4. Módulo de Proveedores y Conciliación (`/api/v1/providers`)

### EP-PRV-01: `GET /api/v1/providers/me`
- **Actor / Rol:** Provider autenticado
- **Autenticación:** Token Provider (`X-Provider-Id` + `X-Provider-Token`) / Bearer
- **Validación de Entrada:** Ninguna.
- **Efectos Secundarios:**
  - Retorna perfil, RUC, estado KYC, banco y CCI de liquidación enmascarado (`mask(cci, 4)`).
- **Ubicación en Código:** `backend/src/routes/provider.routes.ts:L798-L830` (Commit: `d7bac8b329d817bd6cc39f4fae0e751bda319c5d`)

### EP-PRV-02: `PUT /api/v1/providers/settlement-account`
- **Actor / Rol:** Provider autenticado
- **Autenticación:** Bearer + Step-Up Token obligatorio
- **Validación de Entrada:** `bank` (`BCP`, `BBVA`, `Interbank`, `Scotiabank`, `Banco de la Nación`, `BanBif`), `cci` (20 dígitos con validación interbancaria).
- **Efectos Secundarios:**
  - Valida algoritmo de CCI bancario peruano (`validateCci`).
  - Actualiza `settlement_bank` y `settlement_cci` en `provider_profiles`.
  - Registra evento de auditoría con alta severidad en `audit_log`.
- **Ubicación en Código:** `backend/src/routes/provider.routes.ts:L649-L690` (Commit: `d7bac8b329d817bd6cc39f4fae0e751bda319c5d`)

### EP-PRV-03: `GET /api/v1/providers/orders`
- **Actor / Rol:** Provider autenticado
- **Autenticación:** Bearer / Provider Token
- **Validación de Entrada:** Parámetros opcionales de paginación.
- **Efectos Secundarios:**
  - Fuente Única de Verdad para Inicio y Conciliación: lee pedidos mayoristas **aKuotas!** y links de pago `Kuota Payments`.
  - Discrimina estado `settled` para separar órdenes liquidadas ("Cancelado") frente a pendientes ("Por confirmar" / "Por cobrar").
- **Ubicación en Código:** `backend/src/routes/provider.routes.ts:L694-L760` (Commit: `d7bac8b329d817bd6cc39f4fae0e751bda319c5d`)

---

## 5. Módulo de Sandbox y Simulación (`/api/v1/dev`)

### EP-DEV-01: `POST /api/v1/dev/settle-pending`
- **Actor / Rol:** Desarrollador / Tester QA en Sandbox
- **Autenticación:** Restringido a entornos no productivos (`config.isProd === false` y `config.sandboxEnabled === true`)
- **Validación de Entrada:** `window_ms` opcional (por defecto 300,000 ms = 5 minutos).
- **Efectos Secundarios:**
  - Si se ejecuta en producción (`isProd === true`), retorna de inmediato HTTP 403 `SANDBOX_ONLY`.
  - Busca links en estado `PAID` cuyo `paid_at` tenga una antigüedad mayor a `window_ms`.
  - Asigna `settled_at = nowIso()`.
  - Excluye expresamente links con referencias reales de producción (`gateway_ref NOT LIKE 'live_%'`).
  - Permite a la app móvil y frontend reflejar la transición de "Por confirmar" a "Cancelado" (liquidado).
- **Ubicación en Código:** `backend/src/routes/dev.routes.ts:L86-L109` (Commit: `d7bac8b329d817bd6cc39f4fae0e751bda319c5d`)

---

## 6. Módulo Interno, Reconciliación y Salud (`/api/v1/internal`, `/api/v1/health`)

### EP-INT-01: `POST /api/v1/internal/reconciliation/run`
- **Actor / Rol:** Admin Interno / Cron Job del Sistema
- **Autenticación:** Clave de API interna (`X-Admin-Token`)
- **Validación de Entrada:** `businessDate` (YYYY-MM-DD, opcional), `providerReport` (array opcional de extracto 360Pay).
- **Efectos Secundarios:**
  - Ejecuta `runReconciliation()`.
  - Cruza asientos de débito/crédito en `ledger_entries` con depósitos y estados de links.
  - Genera excepciones de descalce si existen cobros capturados no acreditados (`CAPTURED_NOT_CREDITED`).
  - Sella el acta de conciliación y ancla la cadena hash mediante `anchorAuditChain()`.
- **Ubicación en Código:** `backend/src/routes/internal.routes.ts:L210-L260` y `backend/src/security/reconciliation.ts:L45-L125` (Commit: `d7bac8b329d817bd6cc39f4fae0e751bda319c5d`)

### EP-PUB-01: `GET /api/v1/health`
- **Actor / Rol:** Público / Monitor de Infraestructura (Railway)
- **Autenticación:** Pública (exenta del gate de versión mínima de APK)
- **Validación de Entrada:** Ninguna.
- **Efectos Secundarios:**
  - Retorna estado operacional del backend (`status: 'ok'`, `version`, `min_app_version_code`, `sandbox`, `fee_bps` y `timestamp`).
- **Ubicación en Código:** `backend/src/app.ts:L100-L111` (Commit: `d7bac8b329d817bd6cc39f4fae0e751bda319c5d`)
