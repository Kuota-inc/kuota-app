# Registro Defensivo de Hallazgos de Seguridad y Arquitectura - Kuota

> **Commit de Referencia:** `d7bac8b329d817bd6cc39f4fae0e751bda319c5d`  
> **Rama:** `fix/proveedor-inicio-conciliacion`  
> **Fecha de Auditoría:** 14 de Noviembre de 2026

Este registro documenta los hallazgos técnicos, brechas arquitectónicas y vectores de riesgo identificados durante la auditoría estática del repositorio, acompañados de su análisis de causa raíz, escenarios de abuso y recomendaciones de remediación.

---

## Índice de Hallazgos

| ID | Título del Hallazgo | Categoría | Severidad | Estado |
| :--- | :--- | :--- | :--- | :--- |
| **FND-01** | Revocación Forzada Mono-Dispositivo Incompatible con Multi-Cajero | Sesiones / RBAC | **Media** | `OBSERVADO EN CÓDIGO` |
| **FND-02** | Segregación Multi-Tenant Dependiente Exclusivamente de la Capa de Aplicación | Base de Datos | **Alta** | `OBSERVADO EN CÓDIGO` |
| **FND-03** | Riesgo de Ejecución Accidental de Simulación de Liquidación en Producción | Pagos / Sandbox | **Alta** (Mitigada) | `OBSERVADO EN CÓDIGO` |
| **FND-04** | Impacto de Comisión Mínima Fija en Micro-Transacciones de Comercios | Financiero / UX | **Media** | `OBSERVADO EN CÓDIGO` |
| **FND-05** | Ambigüedad en Cómputo de Plazo de Liquidación de 48 Horas (Hábiles vs Calendario) | Pasarela / SLAs | **Media** | `OBSERVADO EN CÓDIGO` |
| **FND-06** | Integridad de Bitácora WORM Vulnerable a Bypass por Superusuario de Base de Datos | Auditoría / Hardening | **Media** | `OBSERVADO EN CÓDIGO` |

---

## Detalle Exhaustivo de Hallazgos

### FND-01: Revocación Forzada Mono-Dispositivo Incompatible con Multi-Cajero
- **Severidad:** Media (Impacto Operativo Alto / Seguridad Fuerte)
- **Ubicación en Código:** `backend/src/security/auth.ts:revokeSessions:L284-L299`
  - Commit: `d7bac8b329d817bd6cc39f4fae0e751bda319c5d`
- **Evidencia en Código:**
  ```typescript
  if (opts.exceptDeviceId) {
    return (await db
      .prepare('UPDATE merchant_sessions SET revoked_at = ? WHERE merchant_id = ? AND device_id <> ? AND revoked_at IS NULL')
      .run(now, merchantId, opts.exceptDeviceId)).changes;
  }
  ```
- **Escenario de Abuso / Falla Operativa:**
  En un comercio físico con múltiples cajas o sucursales que intenten cobrar con links simultáneamente, el inicio de sesión del cajero B cerrará de inmediato la sesión del cajero A en medio de un cobro al cliente, generando denegación de servicio operacional e insatisfacción comercial.
- **Impacto:** Si bien protege eficazmente contra el uso compartido no autorizado de credenciales, impide el despliegue del modelo multi-cajero previsto en los requisitos de producto.
- **Causa Raíz:** Implementación de política de sesión única orientada a billetera de consumidor final (tipo Yape/Plin) en lugar de una arquitectura de terminales POS delegados.
- **Recomendaciones:**
  1. Diseñar entidad `cashier_terminals` con roles restringidos (solo emitir cobros, sin acceso a transferencias ni cambio de CCI).
  2. Implementar tokens de dispositivo con scope `pos:charge` que no revoquen la sesión administrativa principal.
- **Criterio de Aceptación:** Permitir al menos 5 terminales de cobro concurrentes bajo el Plan Pro sin revocar sesiones mutuas.

---

### FND-02: Segregación Multi-Tenant Dependiente Exclusivamente de la Capa de Aplicación
- **Severidad:** Alta
- **Ubicación en Código:** `backend/src/routes/provider.routes.ts` y `backend/src/routes/merchant.routes.ts`
  - Commit: `d7bac8b329d817bd6cc39f4fae0e751bda319c5d`
- **Evidencia en Código:**
  El aislamiento de datos se basa enteramente en que cada desarrollador recuerde incluir `WHERE merchant_id = ?` o `WHERE proveedor_id = ?` en cada query SQL. No existe PostgreSQL Row Level Security (RLS) habilitado en el esquema de base de datos.
- **Escenario de Abuso / Vector de Ataque:**
  Si un nuevo endpoint o query omite accidentalmente el filtro `WHERE merchant_id = ?` o sufre una vulnerabilidad de IDOR (Insecure Direct Object Reference), un comercio malicioso podría listar o modificar ventas, cupones o cuentas bancarias de otros comercios de la plataforma.
- **Impacto:** Fuga masiva de datos financieros (PII, facturación y cuentas bancarias) e infracción de la Ley 29733 de Protección de Datos Personales.
- **Causa Raíz:** Ausencia de políticas de seguridad declarativas a nivel de motor de base de datos (`ALTER TABLE ... ENABLE ROW LEVEL SECURITY`).
- **Recomendaciones:**
  1. Habilitar PostgreSQL Row Level Security (RLS) en tablas `payment_links`, `merchant_sessions`, `provider_profiles` y `ledger_entries`.
  2. Asignar variable de sesión en conexión Postgres: `SET LOCAL app.current_tenant_id = '...'` y aplicar política `USING (tenant_id = current_setting('app.current_tenant_id'))`.
- **Criterio de Aceptación:** Una consulta directa `SELECT * FROM payment_links` sin filtro WHERE debe retornar únicamente los registros pertenecientes al tenant en sesión.

---

### FND-03: Riesgo de Ejecución Accidental de Simulación de Liquidación en Producción
- **Severidad:** Alta (Actualmente Mitigada)
- **Ubicación en Código:** `backend/src/routes/dev.routes.ts:postSettlePending:L86-L108`
  - Commit: `d7bac8b329d817bd6cc39f4fae0e751bda319c5d`
- **Evidencia en Código:**
  ```typescript
  if (config.isProd || process.env.NODE_ENV === 'production' || process.env.KUOTA_SANDBOX === '0' || !config.sandboxEnabled) {
    return res.status(403).json({ error: { code: 'SANDBOX_ONLY', message: '...' } });
  }
  ```
- **Escenario de Abuso / Vector de Falla:**
  Si por error de configuración en el despliegue de producción las variables `NODE_ENV` o `isProd` no son evaluadas correctamente o se expone el router `/dev`, un atacante o script automatizado podría invocar `POST /dev/settle-pending`, liquidando fondos prematuramente sin haber recibido la confirmación real de 360Pay.
- **Impacto:** Descalce financiero severo: Kuota transferiría dinero real a comercios por cobros que podrían haber sido revertidos o rechazados en la pasarela bancaria.
- **Causa Raíz:** Presencia de rutas de desarrollo y simulación en el mismo bundle del servidor Express.
- **Recomendaciones:**
  1. No cargar `devRouter` en la inicialización de `app.ts` si `process.env.NODE_ENV === 'production'`.
  2. Excluir el archivo `dev.routes.ts` del bundle de build para producción mediante configuración en `tsconfig.prod.json` o esbuild.
- **Criterio de Aceptación:** En entorno de producción, la ruta `/dev/*` debe devolver HTTP 404 (no encontrada), no HTTP 403.

---

### FND-04: Impacto de Comisión Mínima Fija en Micro-Transacciones de Comercios
- **Severidad:** Media (Riesgo Comercial y de Adopción)
- **Ubicación en Código:** `backend/src/security/pricing.ts:computeFees:L15-L21`
  - Commit: `d7bac8b329d817bd6cc39f4fae0e751bda319c5d`
- **Evidencia en Código:**
  `MIN_FEE_CENTS = 450`. Con IGV (18%), la comisión mínima es S/ 5.31.
  En una venta de S/ 50.00, la comisión efectiva es de **10.62%**, contrastando drásticamente con la promesa publicitaria de "1% + IGV".
- **Escenario de Falla:**
  Los proveedores o comercios que transaccionan montos pequeños percibirán cobros inesperados en sus estados de cuenta, provocando reclamos por publicidad engañosa y abandono de la plataforma hacia opciones como transferencias directas sin costo (Yape/Plin).
- **Causa Raíz:** Estructura de costos impuesta por el contrato con 360Pay (S/ 3.82 fijo por transacción), que traslada el piso mínimo al comercio final.
- **Recomendaciones:**
  1. Incluir en la pantalla de cotización (`/links/quote`) y en el flujo de creación una advertencia transparente del desglose de la comisión mínima.
  2. Negociar con 360Pay o gateways alternativos un modelo de pricing porcentual puro sin costo fijo para micro-pagos (< S/ 100).
- **Criterio de Aceptación:** Mostrar el monto neto a recibir y la comisión aplicable antes de que el usuario confirme la generación del link de cobro.

---

### FND-05: Ambigüedad en Cómputo de Plazo de Liquidación de 48 Horas
- **Severidad:** Media
- **Ubicación en Código:** `frontend/src/screens/provider/ProviderHomeScreen.tsx:L529` y `backend/src/security/links.ts`
  - Commit: `d7bac8b329d817bd6cc39f4fae0e751bda319c5d`
- **Evidencia en Código:**
  La UI muestra: *"Plazo estimado cumplido: Se conserva el estado Por confirmar a la espera de evidencia formal de 360Pay (plazo real y cómputo de horas hábiles vs calendario pendientes de validar con 360)"*.
- **Escenario de Falla:**
  Si un cliente paga un viernes a las 18:00, las 48 horas calendario vencen el domingo a las 18:00. Si 360Pay liquida en 48 horas **hábiles**, el abono recién ocurrirá el martes o miércoles siguiente. Durante ese lapso, el comercio asumirá un retraso o incumplimiento de Kuota, generando fricción y saturación del canal de soporte.
- **Causa Raíz:** Falta de formalización contractual y técnica del SLA de liquidación con 360Pay en el código.
- **Recomendaciones:**
  1. Definir formalmente en `config.ts` un calendario bancario peruano (excluyendo feriados nacionales y fines de semana).
  2. Implementar cálculo de fecha estimada de abono usando horas hábiles bancarias.
- **Criterio de Aceptación:** Mostrar al comercio la fecha y hora exacta estimada de liquidación bancaria considerando feriados del BCRP.

---

### FND-06: Integridad de Bitácora WORM Vulnerable a Bypass por Superusuario de Base de Datos
- **Severidad:** Media (Hardening de Infraestructura)
- **Ubicación en Código:** `backend/src/security/audit.ts:L1-L20`
  - Commit: `d7bac8b329d817bd6cc39f4fae0e751bda319c5d`
- **Evidencia en Código:**
  La inmutabilidad de `audit_log` depende de triggers SQL que bloquean `UPDATE` y `DELETE`. No obstante, la conexión de la aplicación se ejecuta con credenciales que poseen permisos de DDL o alteración de triggers.
- **Escenario de Abuso:**
  Un atacante o empleado desleal con acceso a las credenciales de base de datos podría ejecutar `ALTER TABLE audit_log DISABLE TRIGGER ALL`, modificar transacciones pasadas y recalcular los hashes para encubrir un fraude financiero.
- **Causa Raíz:** Falta de segregación de privilegios a nivel de rol de base de datos.
- **Recomendaciones:**
  1. Crear un rol de base de datos dedicado para la aplicación con permisos estrictos de solo `INSERT` y `SELECT` sobre `audit_log` (`REVOKE UPDATE, DELETE, TRUNCATE, ALTER ON audit_log FROM kuota_app`).
  2. Exportar logs de auditoría en streaming asíncrono hacia un almacenamiento WORM externo (ej. AWS S3 Object Lock en Compliance Mode o Google Cloud Storage Bucket Lock).
- **Criterio de Aceptación:** Comprobar que el usuario de la aplicación no puede deshabilitar triggers ni ejecutar UPDATE/DELETE incluso teniendo una sesión SQL interactiva.
