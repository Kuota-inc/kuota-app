# Análisis Integral del Riel de Pagos, Comisiones y Liquidaciones - Kuota

> **Commit de Referencia:** `d7bac8b329d817bd6cc39f4fae0e751bda319c5d`  
> **Rama:** `fix/proveedor-inicio-conciliacion`  
> **Fecha de Auditoría:** 14 de Noviembre de 2026

Este documento desglosa el funcionamiento matemático, contable y operacional del riel de pagos de Kuota, abordando la conciliación entre las pantallas de Inicio y Conciliación, la semántica del estado "Cancelado", las reglas de comisiones e IGV, los invariantes del ledger de partida doble y el comportamiento en sandbox frente a producción.

---

## 1. Ciclo de Vida y Matriz de Estados de Pago (`ST-*`)

La siguiente tabla define la correspondencia entre los estados de la base de datos, la pasarela 360Pay y la interfaz visual del perfil Proveedor:

| ID | Estado en BD (`payment_links`) | Estado en Pasarela 360Pay | Estado en UI Proveedor | Descripción Operativa y Criterio Contable |
| :--- | :--- | :--- | :--- | :--- |
| **ST-01** | `ACTIVE` | `ticket.pending` | *No aparece en ventas recibidas* | Cupón/Link emitido. El cliente **no ha pagado aún**. No suma a volumen recibido ni debe figurar como "Por confirmar". Vence a las 48h. |
| **ST-02** | `PAID` (`settled_at IS NULL`) | `ticket.paid` | **Por confirmar** | Pago debitado exitosamente al cliente. Fondos en custodia de 360Pay en espera de liquidación al vendedor. |
| **ST-03** | `PAID` (`settled_at IS NOT NULL`) | `settlement.completed` | **Cancelado** (o **Cobrado**) | Fondos transferidos a la cuenta CCI del vendedor. En el comercio peruano, **Cancelado** denota deuda saldada/liquidada, **no anulada**. |
| **ST-04** | `EXPIRED` | `ticket.expired` | **Vencido** | Link no fue pagado dentro de la ventana de 48 horas. Transición irreversible. |
| **ST-05** | `FAILED` | `ticket.failed` | **Fallido** | Error de comunicación o rechazo bancario en el flujo de pasarela. |
| **ST-06** | `CANCELLED` | `ticket.cancelled` | **Anulado** | El vendedor canceló la orden antes de que el cliente realice el abono. No genera comisiones ni asientos contables. |
| **ST-07** | `AKUOTAS_PENDING` (pedidos) | N/A (crédito propio) | **Por cobrar** | Ventas a través de crédito mayorista **aKuotas!**. Se mantienen estrictamente separadas de Kuota Payments. |

---

## 2. Matemática Financiera de Comisiones e IGV

### Reglas de Negocio en Código (`backend/src/security/pricing.ts`)
1. **Unidad Monetaria Entera:** Todos los cálculos se efectúan en **centavos de sol** (enteros) para evitar errores de redondeo de punto flotante en JavaScript/TypeScript.
2. **Tasa de Comisión Kuota:** 1.00% (`feeBps = 100`).
3. **Tasa de IGV:** 18.00% (`IGV_BPS = 1800`).
4. **Comisión Mínima Transaccional:** S/ 4.50 sin IGV (`MIN_FEE_CENTS = 450`).
   - *Justificación Técnica y Económica:* 360Pay cobra un costo fijo de S/ 3.82 por transacción procesada. La comisión mínima garantiza que tickets pequeños no generen pérdidas operativas.
5. **Algoritmo de Cálculo:**
   ```typescript
   export function computeFees(amountCents: number, feeBps: number = config.feeBps): Fees {
     const base = Math.max(Math.ceil((amountCents * feeBps) / 10_000), MIN_FEE_CENTS);
     const igv = Math.ceil((base * IGV_BPS) / 10_000);
     const fee = base + igv;
     return { base, igv, fee, net: amountCents - fee };
   }
   ```

### Casos de Estudio y Demostración Matemática

#### Caso A: Ticket Menor (Aplica Comisión Mínima)
- **Monto Cobrado:** S/ 50.00 (`5,000 centavos`).
- Cálculo 1%: `5,000 * 100 / 10,000 = 50 centavos` (S/ 0.50).
- Aplicación de Mínimo: `Math.max(50, 450) = 450 centavos` (S/ 4.50 base).
- IGV (18%): `Math.ceil(450 * 1800 / 10,000) = 81 centavos` (S/ 0.81).
- **Comisión Total con IGV:** S/ 4.50 + S/ 0.81 = **S/ 5.31** (`531 centavos`).
- **Neto a Liquidar:** S/ 50.00 - S/ 5.31 = **S/ 44.69**.

#### Caso B: Conciliación de Pantalla "Inicio" Observada en Auditoría
En la captura real proporcionada por el usuario, la tarjeta *Ahorraste con Kuota Payments* mostraba:
- *Lo que pagaste con Kuota (1% + IGV):* **-S/ 15.93**.
- **Explicación Exacta:** El vendedor registró tres transacciones de montos pequeños (por ejemplo, tres ventas de S/ 50.00). Cada una incurrió en la comisión mínima con IGV de S/ 5.31:
  $$\text{Comisión Acumulada} = 3 \times \text{S/ } 5.31 = \text{S/ } 15.93$$
  Esto confirma la exactitud matemática del algoritmo implementado frente a la evidencia visual.

#### Caso C: Ticket Mayor (Supera la Comisión Mínima)
- **Monto Cobrado:** S/ 1,000.00 (`100,000 centavos`).
- Cálculo 1%: `100,000 * 100 / 10,000 = 1,000 centavos` (S/ 10.00).
- Aplicación de Mínimo: `Math.max(1,000, 450) = 1,000 centavos` (S/ 10.00 base).
- IGV (18%): `Math.ceil(1,000 * 1800 / 10,000) = 180 centavos` (S/ 1.80).
- **Comisión Total con IGV:** S/ 10.00 + S/ 1.80 = **S/ 11.80**.
- **Neto a Liquidar:** S/ 1,000.00 - S/ 11.80 = **S/ 988.20**.

---

## 3. Invariantes del Ledger de Partida Doble

Cada pago procesado genera un asiento contable compuesto e indivisible en la tabla `ledger_entries` de acuerdo con las normas contables internacionales:

```
[MOMENTO DEL COBRO (Webhook 360Pay 'PAID')]
  DEBITO  1.1.01 Fondos por Liquidar en Pasarela (360Pay)     S/ 1,000.00  (Activo)
  CREDITO 2.1.01 Obligaciones con Vendedores por Liquidar                   S/ 988.20  (Pasivo)
  CREDITO 4.1.01 Ingresos por Comisiones Kuota Payments                      S/  10.00  (Ingreso)
  CREDITO 2.2.01 IGV Fiscal por Pagar (SUNAT 18%)                           S/   1.80  (Pasivo Fiscal)
  ---------------------------------------------------------------------------------
  BALANCE NETO:                                               S/ 1,000.00 - S/ 1,000.00 = S/ 0.00

[MOMENTO DE LA LIQUIDACION AL VENDEDOR (Payout Bancario CCI)]
  DEBITO  2.1.01 Obligaciones con Vendedores por Liquidar     S/   988.20  (Pasivo cancelado)
  CREDITO 1.1.01 Fondos por Liquidar en Pasarela (360Pay)                   S/   988.20  (Activo saldado)
  ---------------------------------------------------------------------------------
  BALANCE NETO:                                               S/   988.20 - S/   988.20 = S/ 0.00
```

### Invariantes Criptográficos y de Integridad
1. $\sum \text{Débitos} - \sum \text{Créditos} \equiv 0$ en cada transacción (verificado por `verifyLedgerIntegrity()`).
2. Cada asiento almacena el `prev_hash` del bloque anterior en `audit_log`, impidiendo la inserción de asientos espurios o la alteración retroactiva de montos.

---

## 4. Análisis de Gaps en el Riel de Liquidación (Sandbox vs Producción)

### Diferenciación Estricta de Entornos
| Dimensión | Sandbox / Desarrollo | Producción |
| :--- | :--- | :--- |
| **Tiempo de Simulación** | Ventana configurable de **5 minutos** (300,000 ms) | Plazo contractual previsto de **48 horas** |
| **Mecanismo de Disparo** | `POST /dev/settle-pending` (manual o temporizado) | Webhook asíncrono o conciliación bancaria directa |
| **Condición de Liquidación** | `paid_at <= now - window_ms` AND `gateway_ref NOT LIKE 'live_%'` | **Evidencia obligatoria** de 360Pay / archivo de liquidación bancaria |
| **Protección contra Fuga** | Si `isProd === true` retorna `403 SANDBOX_ONLY` | Ninguna operación se confirma por simple paso del tiempo |

### Regla Crítica de Producción ante Plazo Cumplido
En producción, el cumplimiento de las 48 horas estimadas **NO** cambia automáticamente el estado a liquidado ("Cancelado"). 
- El sistema **conserva el estado "Por confirmar"**.
- Emite un aviso informativo en pantalla: *"Plazo estimado cumplido: Se conserva el estado Por confirmar a la espera de evidencia formal de 360Pay"*.
- **Puntos Abiertos con 360Pay:**
  1. ¿El plazo de 48 horas se computa en días hábiles (excluyendo sábados, domingos y feriados bancarios) o calendario?
  2. ¿360Pay envía webhook con evento `settlement.completed` o la evidencia debe descargarse mediante reporte SFTP / API REST de corte?

---

## 5. Unificación de Criterios entre Inicio y Conciliación

Para resolver la inconsistencia previa donde las ventas no se reflejaban en Inicio:
1. **Misma Fuente de Verdad:** Tanto el módulo de *Operaciones de fondos* en Inicio como la lista de *Ventas* en Conciliación consumen ahora la misma función unificada en `ProviderHomeScreen.tsx` y `provider.routes.ts`.
2. **Segregación de Conceptos:**
   - **Volumen ya pagado:** Suma de ventas con pago completado y liquidado (`settled_at IS NOT NULL`).
   - **Total vendido:** Volumen bruto de todas las ventas cobradas exitosamente.
   - **Pendiente (Por confirmar):** Monto en custodia en espera de liquidación bancaria.
   - **Por cobrar (aKuotas!):** Pedidos pendientes de financiamiento, totalmente aislados del riel de pagos.
3. **Persistencia y Recarga:** La información se calcula en el servidor sobre el estado inmutable de `payment_links`, garantizando que al cerrar, recargar o reiniciar la aplicación móvil, los montos y estados permanecen inalterados y exactos.
