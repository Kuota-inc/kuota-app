# Comparativa Histórica de Documentación y Banco de Pruebas - Kuota

> **Commit de Referencia:** `d7bac8b329d817bd6cc39f4fae0e751bda319c5d`  
> **Rama:** `fix/proveedor-inicio-conciliacion`  
> **Fecha de Auditoría:** 14 de Noviembre de 2026

Este documento confronta los requerimientos declarados en la documentación histórica (documentos de diseño del 5 y 7 de noviembre de 2026, incluyendo el análisis de referencia Yape) con la realidad del código fuente implementado en el commit `d7bac8b329d817bd6cc39f4fae0e751bda319c5d`. Adicionalmente, inventaría el banco de pruebas definido en el repositorio y propone una suite complementaria para robustecer la postura defensiva.

---

## 1. Cuadro Comparativo: Documentos Históricos vs Código Actual

| Componente / Dimensión | Declarado en Documento Histórico | Realidad Observada en Código | Estado Canónico | Brecha y Recomendación Técnica |
| :--- | :--- | :--- | :--- | :--- |
| **Arquitectura de Sesión** | Múltiples terminales por tienda / multi-cajero con roles segregados por sucursal. | Mono-dispositivo estricto vía `revokeSessions(merchantId, { exceptDeviceId })`. | `OBSERVADO EN CÓDIGO` | Se implementó el modelo Yape de billetera personal mono-dispositivo. Se requiere diseñar sub-cuentas con scopes POS para soportar multi-cajero real. |
| **Comisión de Cobro** | Publicitado como "1% + IGV" sin mención destacada de costo mínimo. | Tasa de 1% + IGV con **comisión mínima de S/ 4.50 + IGV (S/ 5.31)** (`MIN_FEE_CENTS = 450`). | `OBSERVADO EN CÓDIGO` | Cobros menores a S/ 100 pagan un porcentaje efectivo mayor (ej. 10.6% en S/ 50). Requiere transparencia en la UI previa a la emisión del link. |
| **Plazo de Liquidación** | Liquidación automática a cuenta bancaria a las 48 horas de recibido el pago. | Plazo de 48h estimado; en producción **no liquida por tiempo** sin evidencia formal de 360Pay. | `OBSERVADO EN CÓDIGO` | Evita liquidar fondos no acreditados. Pendiente validar con 360Pay si el cómputo de 48h corresponde a días hábiles bancarios o calendario. |
| **Simulación Sandbox** | Pruebas de integración sin especificación de aceleración temporal. | Endpoint `POST /dev/settle-pending` con ventana de 5 min (300,000 ms), protegido con `403 SANDBOX_ONLY` en prod. | `OBSERVADO EN CÓDIGO` | Permite pruebas E2E ágiles sin alterar fechas del sistema operativo ni depender de cronometrajes en frontend. |
| **Semántica 'Cancelado'** | "Cancelado" sugería operación anulada o fallida. | En contexto comercial peruano, "Cancelado" denota **deuda pagada y liquidada al 100%** (distinto de "Anulado" o "Fallido"). | `OBSERVADO EN CÓDIGO` | Estados clarificados en UI y base de datos: `Cancelado` = liquidado; `Anulado` = abortado por comercio; `Fallido` = error pasarela. |
| **Fuente de Verdad Ventas** | Divergencia histórica entre pantallas de Inicio y Conciliación. | Endpoint unificado `/providers/orders` que consolida órdenes aKuotas! y links de cobro bajo los mismos criterios. | `OBSERVADO EN CÓDIGO` | Resuelto en commit `d7bac8b3`. Ambas vistas utilizan la misma fuente y discriminan bruto vendido de neto liquidado. |

---

## 2. Inventario de Pruebas Existentes en el Repositorio (`PRUEBA DEFINIDA`)

Conforme a las restricciones de auditoría (sin ejecución activa no aprobada), se catalogan a continuación las suites de pruebas automatizadas definidas en el repositorio:

| Archivo de Prueba | Cobertura Declarada y Casos de Prueba | Estado Canónico |
| :--- | :--- | :--- |
| `backend/test/providerReconciliation.test.ts` | **Flujo E2E Inicio y Conciliación:**<br>1. Fuente única de verdad unificada.<br>2. Distinción entre link activo sin pagar, pago recibido ("Por confirmar") y liquidado ("Cancelado").<br>3. Simulación sandbox con ventana de 5 minutos.<br>4. Bloqueo estricto en producción ante vencimiento de 48h sin evidencia de 360Pay. | `PRUEBA DEFINIDA` |
| `backend/test/payments-security.test.ts` | **Seguridad en Pagos y Webhooks:**<br>1. Verificación de firma HMAC-SHA256 en webhooks de 360Pay.<br>2. Rechazo de timestamps desfasados (> 5 min).<br>3. Idempotencia y deduplicación de eventos repetidos.<br>4. Detección de alteración de links (tampering). | `PRUEBA DEFINIDA` |
| `backend/test/pricing.test.ts` | **Cálculo de Tarifas y Comisiones:**<br>1. Aplicación de comisión del 1% e IGV del 18%.<br>2. Activación de comisión mínima de S/ 4.50 + IGV en tickets menores.<br>3. Preservación de redondeo en centavos sin pérdida fiscal. | `PRUEBA DEFINIDA` |
| `backend/test/provider-payments.test.ts` | **Sesión y Onboarding de Proveedor:**<br>1. Autenticación con `x-provider-id` + PIN.<br>2. Bloqueo temporal tras 5 intentos fallidos.<br>3. Revocación de sesiones en otros dispositivos (`exceptDeviceId`). | `PRUEBA DEFINIDA` |
| `backend/test/hardening.test.ts` | **Endurecimiento HTTP y Headers:**<br>1. Presencia de cabeceras de seguridad (CSP, HSTS, X-Content-Type-Options).<br>2. Sanitización y redacción de secretos en `audit_log`. | `PRUEBA DEFINIDA` |
| `backend/test/credit-gateway.test.ts` | **Líneas aKuotas!:**<br>1. Creación de compras a cuotas.<br>2. Evaluación de límites aprobados.<br>3. Segregación contable de cuotas pendientes frente a pasarela directa. | `PRUEBA DEFINIDA` |

---

## 3. Suite de Pruebas Sugerida / Faltante (Recomendación Defensiva)

Para alcanzar una cobertura de resiliencia de grado institucional, se recomienda incorporar las siguientes pruebas automatizadas en los pipelines de CI/CD:

1. **TEST-SUG-01: Concurrencia Extrema y Carrera en Webhooks (Race Conditions)**
   - *Objetivo:* Enviar 20 peticiones simultáneas con el mismo webhook de pago para verificar que bajo condiciones de alta carga y latencia de base de datos ningún link sea acreditado dos veces en el ledger contable.
2. **TEST-SUG-02: Evasión de Rate Limiting mediante IP Spoofing**
   - *Objetivo:* Verificar que la aplicación ignore cabeceras `X-Forwarded-For` o `Client-IP` no confiables provenientes de proxies no autorizados, previniendo que un atacante evada el límite de intentos de PIN.
3. **TEST-SUG-03: Inyección de Fórmulas CSV en Reportes Contables**
   - *Objetivo:* Probar que nombres de clientes o conceptos de venta que comiencen con `=`, `+`, `-`, o `@` (ej. `=CMD('calc')`) sean sanitizados antes de exportar conciliaciones a formato CSV/Excel.
4. **TEST-SUG-04: Degradación y Simulación de Fallo de Red con 360Pay**
   - *Objetivo:* Simular respuestas HTTP 504 Gateway Timeout y fallas de socket durante la emisión de cupones para validar que el sistema aplique circuit breakers y reintentos exponenciales con jitter sin dejar transacciones huérfanas.

---

## 4. Preguntas Abiertas para el Equipo de Producto y 360Pay

Las siguientes interrogantes técnicas y de negocio deben ser resueltas para cerrar definitivamente los vacíos operativos:

1. **Cómputo del Plazo de Liquidación:**
   - ¿Las 48 horas de liquidación de 360Pay corresponden a **horas calendario continuas** o a **días hábiles bancarios** (lunes a viernes excluyendo feriados nacionales)?
2. **Protocolo de Notificación de Liquidación Efectiva:**
   - ¿360Pay dispone de un webhook formal de liquidación (ej. evento `settlement.completed` o `payout.transferred`), o Kuota debe consultar una API de conciliación/descargar un archivo plano de corte diario?
3. **Gestión de Cuentas CCI Incompatibles:**
   - ¿Qué código de error o webhook emite 360Pay cuando la transferencia interbancaria hacia el CCI del vendedor es rechazada por la Cámara de Compensación Electrónica (CCE) por cuenta bloqueada o cerrada?
4. **Evolución del Modelo Multi-Cajero:**
   - ¿Se mantendrá la política de sesión mono-dispositivo activa o el negocio requerirá formalizar un modelo de sub-usuarios cajeros con permisos restringidos de solo cobro para puntos de venta físicos?
