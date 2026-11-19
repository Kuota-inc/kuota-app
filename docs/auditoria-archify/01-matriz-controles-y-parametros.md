# Matriz de Controles de Seguridad y Parametrización - Kuota

> **Commit de Referencia:** `d7bac8b329d817bd6cc39f4fae0e751bda319c5d`  
> **Rama:** `fix/proveedor-inicio-conciliacion`  
> **Fecha de Auditoría:** 14 de Noviembre de 2026  
> **Metodología:** Análisis estático de código fuente, trazabilidad de flujos y verificación visual con Archify v2.17.0.

Esta matriz cataloga de manera exhaustiva los controles de seguridad, criptografía, sesiones, conciliación, comisiones y parámetros operativos implementados en Kuota. Cada entrada incluye su ubicación exacta en el código fuente, valor esperado según documentos de diseño y valor real observado en el repositorio.

---

## 1. Categoría A: Identidad, Credenciales, Sesiones y Dispositivos

| ID | Nombre del Control / Parámetro | Valor Documentado | Valor Observado en Código | Ubicación en Código | Commit | Estado Canónico | Observaciones / Brechas |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **CTL-A01** | Hashing de PIN de Comercio / Proveedor | PBKDF2, bcrypt o scrypt con sal + pepper | `scrypt` (`N=16384, r=8, p=1, keylen=32`) sobre `HMAC-SHA256(pinPepper, pin)` y `timingSafeEqual` | `backend/src/security/crypto.ts:hashPin/verifyPin:L44-L67` | `d7bac8b329d817bd6cc39f4fae0e751bda319c5d` | `OBSERVADO EN CÓDIGO` | Pimienta externa `KUOTA_PIN_PEPPER`; PIN numérico de 6 dígitos validado por regex sin secuencias ni fechas. |
| **CTL-A02** | Bloqueo por Intentos Fallidos de PIN | Bloqueo temporal tras intentos fallidos | 5 intentos consecutivos bloquean 15 minutos + alerta antifraude de dispositivo no reconocido | `backend/src/security/auth.ts:checkPin:L115-L160` | `d7bac8b329d817bd6cc39f4fae0e751bda319c5d` | `OBSERVADO EN CÓDIGO` | `config.pinMaxAttempts = 5`, `config.pinLockMinutes = 15`; `failed_attempts` y `locked_until` en `merchant_credentials`. |
| **CTL-A03** | Política de Sesión Mono-Dispositivo | Multi-cajero o sesión concurrente con roles | Revocación estricta de sesiones previas al iniciar en nuevo dispositivo | `backend/src/security/auth.ts:revokeSessions:L284-L299` | `d7bac8b329d817bd6cc39f4fae0e751bda319c5d` | `OBSERVADO EN CÓDIGO` | `UPDATE merchant_sessions SET revoked_at = ? WHERE merchant_id = ? AND device_id <> ?`. |
| **CTL-A04** | Expiración de Access Token (`ks1`) | Sesión corta (15 min a 2 horas) | 15 minutos (`900` s default, configurable vía `KUOTA_SESSION_TTL_SEC`) | `backend/src/security/config.ts:sessionTtlSec:L106` | `d7bac8b329d817bd6cc39f4fae0e751bda319c5d` | `OBSERVADO EN CÓDIGO` | Token formato `ks1.<base64url>.<hmac>` firmado con HMAC SHA-256 usando `secrets.sessionSecret`. |
| **CTL-A05** | Familia y Rotación de Refresh Tokens | Rotación con detección de reuso | TTL 90 días, un solo uso por token; reuso revoca toda la familia (`family_id`) | `backend/src/security/auth.ts:issueRefreshToken:L306-L318` | `d7bac8b329d817bd6cc39f4fae0e751bda319c5d` | `OBSERVADO EN CÓDIGO` | Protege contra robo de tokens de larga duración. |
| **CTL-A06** | Autenticación Step-Up para Operaciones Críticas | Desafío biométrico / PIN re-entry | Token de step-up con TTL de 2 minutos (`120` s) tras verificación de PIN o biometría | `backend/src/security/config.ts:stepUpTtlSec:L107` | `d7bac8b329d817bd6cc39f4fae0e751bda319c5d` | `OBSERVADO EN CÓDIGO` | Requerido para actualización de cuenta CCI de liquidación (`stepUpTtlSec = 120`). |
| **CTL-A07** | Validación de Dispositivo (Device Binding) | UUIDv4 o huella de hardware | Validación de longitud y caracteres alfanuméricos (`/^[A-Za-z0-9_-]{16,64}$/`) | `backend/src/security/auth.ts:isValidDeviceId:L62-L68` | `d7bac8b329d817bd6cc39f4fae0e751bda319c5d` | `OBSERVADO EN CÓDIGO` | Se asocia en `merchant_devices` con fingerprint básico. |

---

## 2. Categoría B: Firma Criptográfica, Integridad y Webhooks

| ID | Nombre del Control / Parámetro | Valor Documentado | Valor Observado en Código | Ubicación en Código | Commit | Estado Canónico | Observaciones / Brechas |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **CTL-B01** | Firma HMAC Webhook 360Pay | HMAC-SHA256 con secret compartido | `sha256=${hmac(secrets.webhookSecret, `${timestamp}.${rawBody}`)}` | `backend/src/security/webhook.ts:signWebhookBody:L20-L24` | `d7bac8b329d817bd6cc39f4fae0e751bda319c5d` | `OBSERVADO EN CÓDIGO` | Cabecera `X-360Pay-Signature` comparada con `crypto.timingSafeEqual`. |
| **CTL-B02** | Ventana de Tolerancia Temporal (Anti-Replay) | 5 minutos (300 segundos) | `Math.abs(Date.now() - Date.parse(timestamp)) <= 300_000` | `backend/src/security/webhook.ts:verifyWebhookTimestamp:L78-L92` | `d7bac8b329d817bd6cc39f4fae0e751bda319c5d` | `OBSERVADO EN CÓDIGO` | Rechaza peticiones con timestamps desfasados para evitar ataques de replay. |
| **CTL-B03** | Comparación en Tiempo Constante (Timing-Safe) | Comparación resistente a timing attacks | `crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b))` | `backend/src/security/crypto.ts:safeEqual:L30-L38` | `d7bac8b329d817bd6cc39f4fae0e751bda319c5d` | `OBSERVADO EN CÓDIGO` | Verifica longitudes idénticas antes de ejecutar `timingSafeEqual`. |
| **CTL-B04** | Validación de Firma de Didit (Biometría KYC) | Firma webhook Didit HMAC SHA-256 | Cabecera `X-Didit-Signature` validada con `secrets.diditWebhookSecret` | `backend/src/security/diditGuard.ts:verifyDiditSignature:L40-L65` | `d7bac8b329d817bd6cc39f4fae0e751bda319c5d` | `OBSERVADO EN CÓDIGO` | Procesa eventos `verification.completed` y `verification.failed`. |
| **CTL-B05** | Integridad del Link de Pago (Firma Digital Interna) | Link inmutable y verificable | Firma HMAC de `link_id:amount_cents:merchant_id` almacenada en tabla | `backend/src/security/links.ts:linkSignatureValid:L180-L195` | `d7bac8b329d817bd6cc39f4fae0e751bda319c5d` | `OBSERVADO EN CÓDIGO` | Previene alteración de montos o desvío de fondos a otros comercios. |

---

## 3. Categoría C: Idempotencia, Concurrencia y Transacciones

| ID | Nombre del Control / Parámetro | Valor Documentado | Valor Observado en Código | Ubicación en Código | Commit | Estado Canónico | Observaciones / Brechas |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **CTL-C01** | Deduplicación de Webhooks (At-Least-Once) | Idempotencia por ID de evento | Registro en tabla `webhook_events` con clave primaria `event_id` | `backend/src/security/webhook.ts:handleWebhook:L110-L145` | `d7bac8b329d817bd6cc39f4fae0e751bda319c5d` | `OBSERVADO EN CÓDIGO` | Si `event_id` ya existe, retorna HTTP 200 inmediatamente sin reprocesar. |
| **CTL-C02** | Cabecera Idempotency-Key en APIs de Creación | Idempotencia RFC 7396 en `POST /links` | Cabecera `Idempotency-Key` almacenada en `idempotency_keys` (TTL 24h) | `backend/src/security/guards.ts:idempotent:L85-L120` | `d7bac8b329d817bd6cc39f4fae0e751bda319c5d` | `OBSERVADO EN CÓDIGO` | Almacena código HTTP y respuesta JSON para reenvío idéntico. |
| **CTL-C03** | Transaccionalidad ACID en Liquidación | Partida contable atómica | Transacciones SQLite/Postgres `db.transaction()` | `backend/src/security/reconciliation.ts:executeSettlement:L180-L215` | `d7bac8b329d817bd6cc39f4fae0e751bda319c5d` | `OBSERVADO EN CÓDIGO` | Si falla el crédito o débito contable, se hace rollback completo. |
| **CTL-C04** | Aislamiento de Concurrencia en Marcado de Pago | Prevención de doble acreditación | `UPDATE payment_links SET status = 'PAID' WHERE id = ? AND status = 'ACTIVE'` | `backend/src/security/links.ts:markLinkPaid:L240-L265` | `d7bac8b329d817bd6cc39f4fae0e751bda319c5d` | `OBSERVADO EN CÓDIGO` | `changes === 0` indica que el link ya fue cobrado o expirado, abortando re-abono. |

---

## 4. Categoría D: Límites de Montos, Tarifas, Plazos y Antifraude

| ID | Nombre del Control / Parámetro | Valor Documentado | Valor Observado en Código | Ubicación en Código | Commit | Estado Canónico | Observaciones / Brechas |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **PAR-D01** | Tasa de Comisión Kuota Payments | 1.00% sobre el volumen transaccionado | `feeBps = 100` (100 puntos básicos = 1.00%) | `backend/src/security/config.ts:feeBps:L25` | `d7bac8b329d817bd6cc39f4fae0e751bda319c5d` | `OBSERVADO EN CÓDIGO` | Aplica sobre el monto bruto del cupón de cobro. |
| **PAR-D02** | Impuesto General a las Ventas (IGV) | 18% aplicado sobre la comisión | `IGV_BPS = 1800` (18.00%) | `backend/src/security/pricing.ts:IGV_BPS:L4` | `d7bac8b329d817bd6cc39f4fae0e751bda319c5d` | `OBSERVADO EN CÓDIGO` | Se calcula con `Math.ceil((base * IGV_BPS) / 10_000)` para no perder centavos. |
| **PAR-D03** | Comisión Mínima por Transacción | S/ 4.50 sin IGV (S/ 5.31 con IGV) | `MIN_FEE_CENTS = 450` | `backend/src/security/pricing.ts:MIN_FEE_CENTS:L6` | `d7bac8b329d817bd6cc39f4fae0e751bda319c5d` | `OBSERVADO EN CÓDIGO` | Justificado por costo fijo del proveedor 360Pay (S/ 3.82 por transacción). |
| **PAR-D04** | Ventana de Vencimiento de Links de Pago | 48 horas calendario | 48 horas (`addHours(now, 48)`) | `backend/src/security/links.ts:createLink:L95-L105` | `d7bac8b329d817bd6cc39f4fae0e751bda319c5d` | `OBSERVADO EN CÓDIGO` | Transcurrido el plazo sin pago, pasa a estado `EXPIRED`. |
| **PAR-D05** | Ventana de Simulación de Liquidación en Sandbox | 5 minutos para simular 48h | 300,000 ms (5 minutos) configurable por env/body | `backend/src/routes/dev.routes.ts:postSettlePending:L86-L108` | `d7bac8b329d817bd6cc39f4fae0e751bda319c5d` | `OBSERVADO EN CÓDIGO` | Bloqueado con HTTP 403 `SANDBOX_ONLY` si `isProd` o `KUOTA_SANDBOX === '0'`. |
| **PAR-D06** | Límite Máximo por Transacción (Plan Basic) | S/ 5,000 por operación | `max_tx_cents: 500_000` (S/ 5,000.00) | `backend/src/security/pricing.ts:PLANS.BASIC:L33` | `d7bac8b329d817bd6cc39f4fae0e751bda319c5d` | `OBSERVADO EN CÓDIGO` | El plan Pro no tiene tope por transacción (`max_tx_cents: null`). |
| **CTL-D07** | Rate Limiting en Endpoints Críticos | Protección anti-fuerza bruta y DoS | Webhooks: 600 req/min; Login: 10 req/min; Consultas RUC: 30 req/min | `backend/src/security/guards.ts:rateLimit:L30-L75` | `d7bac8b329d817bd6cc39f4fae0e751bda319c5d` | `OBSERVADO EN CÓDIGO` | Implementado con bucket en memoria / Redis con headers estándar `Retry-After`. |

---

## 5. Categoría E: Persistencia, Ledger y Auditoría

| ID | Nombre del Control / Parámetro | Valor Documentado | Valor Observado en Código | Ubicación en Código | Commit | Estado Canónico | Observaciones / Brechas |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **CTL-E01** | Ledger de Partida Doble Inmutable | Libro contable balanceado (Débito = Crédito) | Tabla `ledger_entries` con cuentas de Activo, Pasivo, Comisiones e IGV | `backend/src/security/reconciliation.ts:recordLedgerEntry:L130-L165` | `d7bac8b329d817bd6cc39f4fae0e751bda319c5d` | `OBSERVADO EN CÓDIGO` | La suma neta de cada transacción en el ledger suma exactamente 0 centavos. |
| **CTL-E02** | Encadenamiento Hash de Auditoría (Hash Chaining) | Bitácora WORM inmutable | Cada registro almacena `prev_hash` (SHA-256) y `prev_hmac_hash` (HMAC privado) | `backend/src/security/audit.ts:audit:L85-L130` | `d7bac8b329d817bd6cc39f4fae0e751bda319c5d` | `OBSERVADO EN CÓDIGO` | Trigger de BD rechaza `UPDATE` y `DELETE` sobre la tabla `audit_log`. |
| **CTL-E03** | Redacción de Secretos en Logs (Sanitización PII) | Jamás persistir PIN, JWT ni secrets | `REDACT = Set(['pin', 'current_pin', 'new_pin', 'access_token', 'token', 'secret'])` | `backend/src/security/audit.ts:redact:L28-L35` | `d7bac8b329d817bd6cc39f4fae0e751bda319c5d` | `OBSERVADO EN CÓDIGO` | Sustituye valores sensibles por `[redacted]` antes de la serialización JSON. |
| **CTL-E04** | Anclaje Periódico de la Cadena de Auditoría | Congelamiento de cola de auditoría | Función `anchorAuditChain()` congela el tail HMAC en `audit_anchors` | `backend/src/security/audit.ts:anchorAuditChain:L190-L220` | `d7bac8b329d817bd6cc39f4fae0e751bda319c5d` | `OBSERVADO EN CÓDIGO` | Permite verificación externa independiente de la integridad del histórico. |
