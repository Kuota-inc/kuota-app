# Kuota · Fintech de Crédito y Cobros (Perú)

Ecosistema financiero y comercial B2B/B2C desarrollado para emprendedores y proveedores mayoristas en el mercado peruano, implementando los **16 PRDs** y el **Design System oficial de Stitch**.

---

## 🚀 Arquitectura y Tecnologías

- **Backend REST API v1 (`/backend`):**
  - **Runtime:** Node.js + TypeScript
  - **Framework:** Express + CORS + Dotenv + UUID
  - **Base de Datos:** SQLite de alto rendimiento con `better-sqlite3` en modo WAL y llaves foráneas activas.
  - **Convenciones financieras:** Montos en céntimos enteros PEN (`amount_cents`), fechas ISO 8601 UTC (presentación `America/Lima`), partida doble en `ledger_entries`, y respuestas de error en español según PRD 00.
- **Frontend App Móvil Interactiva (`/frontend`):**
  - **Framework:** React + Vite + TypeScript
  - **Estilos:** Tailwind CSS v4 con los tokens semánticos exactos de Stitch (`DESIGN.md` y `design_8.md`).
  - **Simulador:** Marco de dispositivo móvil interactivo con selector lateral para alternar y probar en vivo cualquiera de las 16 pantallas.

---

## 📱 Módulos y Pantallas Implementadas (PRD 01 al 16)

### 🔹 Flujo Emprendedor (`MERCHANT`)
1. **PRD 01 — Bienvenida · Elige tu perfil:** Selector de rol, contadores comunitarios (`+18,500 negocios`) y creación de sesión de onboarding.
2. **PRD 02 — Actividad comercial (Paso 1/3):** Rubros (`FASHION`, `FOOD`, etc.), rangos de antigüedad, cálculo de `tier_hint` y autoguardado.
3. **PRD 03 — Añadir productos (Paso 2/3):** Catálogo de productos con precio en soles, marcas de frecuencia y autoguardado.
4. **PRD 04 — Onboarding exitoso (Paso 3/3):** Creación atómica de línea de crédito inicial (**S/ 1,400.00 en Nivel 1 Brote**), RUC y proveedores recomendados.
5. **PRD 05 — Inicio (Home):** Endpoint agregado de baja latencia con saldo disponible, poder de compra ($2\times$), próximo vencimiento y racha de puntualidad.
6. **PRD 06 — Ventas de mi negocio:** Balance mensual de ventas verificadas vs declaradas, registro de venta rápida, simulación de OCR de comprobantes Yape/Plin (+8 pts Score) y Score Kuota.
7. **PRD 07 — Modal Kuotear:** Hoja modal con resumen de línea, acciones habilitadas según la **Regla 3.2** y simulador interactivo de cuotas quincenales.
8. **PRD 08 — Cobrar con link de pago:** Teclado numérico, desglose en tiempo real de comisión (1.00%) y neto a recibir, generación de link y código QR, y botón de simulación de pago del cliente con webhook automático.
9. **PRD 09 — Comprar al crédito (Plan Kuota 3X):** Compra activa en curso con Confecciones Don Lucho, amortización progresiva, pago de cuotas con recarga automática de línea y liquidación anticipada.
10. **PRD 10 — Mi línea de crédito:** Escala canónica unificada de 6 niveles (`Brote` 50% $\to$ `Raíz` 40% $\to$ `Tallo` 30% $\to$ `Rama` 20% $\to$ `Fruto` 10% $\to$ `Cosecha` 0% de inicial).

### 🔹 Flujo Proveedor (`PROVIDER`)
11. **PRD 11 — Registro fiscal:** Consulta en tiempo real de RUC 11 dígitos contra padrón SUNAT (Activo y Habido), DNI de representante legal (Reniec) y WhatsApp comercial.
12. **PRD 12 — Validando datos (KYC / Scoring):** Proceso asíncrono con `request_id` (`PRV-89420-PE`) en 3 etapas: SUNAT, Reniec y Scoring inicial.
13. **PRD 13 — Actividad comercial:** Insumo predominante y antigüedad comercial contrastada.
14. **PRD 14 — Confirmación GPS:** Mapa interactivo con pin GPS en Gamarra/La Victoria y dirección normalizada.
15. **PRD 15 — Notificaciones y permisos:** Vista previa del panel de control con límite aprobado (**S/ 45,000.00 PEN**) y comercios asociados.
16. **PRD 16 — Resultado y ahorro final:** Desglose del **71% de ahorro** (S/ 588.00 al año sobre S/ 24,000 facturados con tarifa Kuota del 1.00% vs 3.45% del mercado), registro de cuenta bancaria CCI y activación de cuenta.

---

## 💻 Instrucciones para Iniciar

### 0. Clonar e instalar
```bash
git clone --recurse-submodules <url-del-repo>
cd kuota-app
npm --prefix backend install
npm --prefix frontend install
```

`scrapers/scrap-sunat` es un submódulo de [debugsito/scrap-sunat](https://github.com/debugsito/scrap-sunat)
(MIT). El backend lo usa como respaldo opcional para consultar RUC; si no está instalado,
usa las otras fuentes. La base SQLite (`backend/kuota.db`) se crea y siembra al arrancar, y el
APK de Android no se versiona: va en GitHub Releases.

### 1. Iniciar el Backend API
```bash
cd backend
npm run dev
# Servidor escuchando en http://localhost:3001/api/v1
```

### 2. Iniciar el Frontend Móvil
```bash
cd frontend
npm run dev
# Aplicación disponible en http://localhost:5173/
```

### 3. Probar los Endpoints del Backend con cURL o PowerShell
```powershell
# Estado del servicio
Invoke-RestMethod http://localhost:3001/api/v1/health

# Home agregado del emprendedor
Invoke-RestMethod http://localhost:3001/api/v1/merchants/me/home

# Estado de la línea y niveles
Invoke-RestMethod http://localhost:3001/api/v1/credit/line
```
