# 📘 ESPECIFICACIÓN INTEGRAL DE KUOTA (APK & BACKEND) PARA GESTIÓN EN LINEAR

> **Versión:** 1.2.0  
> **Fecha:** Noviembre 2026  
> **Ámbito:** Frontend Móvil (React + Capacitor Android), Backend REST API (Node.js + Express 5 + Postgres), Seguridad Bancaria, Integraciones y Cumplimiento Regulatorio (Perú).  
> **Objetivo:** Documento maestro de arquitectura y matriz de trazabilidad para importación, asignación y seguimiento de épicas, historias y tareas en **Linear**.

---

## 🧭 ÍNDICE GENERAL

1. [Visión General del Producto y Arquitectura](#1-visión-general-del-producto-y-arquitectura)
2. [Estructura Recomendada para Linear (Workspaces, Projects, Labels y Prioridades)](#2-estructura-recomendada-para-linear)
3. [Módulo A: Onboarding y Autenticación del Emprendedor (MERCHANT)](#3-módulo-a-onboarding-y-autenticación-del-emprendedor-merchant)
4. [Módulo B: Dashboard Principal y Operaciones del Emprendedor](#4-módulo-b-dashboard-principal-y-operaciones-del-emprendedor)
5. [Módulo C: Onboarding y Gestión del Proveedor Mayorista (PROVIDER)](#5-módulo-c-onboarding-y-gestión-del-proveedor-mayorista-provider)
6. [Módulo D: Checkout Público de Pagos (PAY PAGE)](#6-módulo-d-checkout-público-de-pagos-pay-page)
7. [Módulo E: Seguridad Bancaria, Criptografía y Kuota Payments](#7-módulo-e-seguridad-bancaria-criptografía-y-kuota-payments)
8. [Módulo F: Capacidades Nativas Android (Capacitor & Kotlin)](#8-módulo-f-capacidades-nativas-android-capacitor--kotlin)
9. [Módulo G: Base de Datos y Modelo Relacional (PostgreSQL)](#9-módulo-g-base-de-datos-y-modelo-relacional-postgresql)
10. [Módulo H: Cumplimiento Regulatorio, UIF, SBS e INDECOPI](#10-módulo-h-cumplimiento-regulatorio-uif-sbs-e-indecopi)
11. [Matriz de Estado y Roadmap para Linear](#11-matriz-de-estado-y-roadmap-para-linear)

---

## 1. VISIÓN GENERAL DEL PRODUCTO Y ARQUITECTURA

**Kuota** es una plataforma fintech B2B/B2C diseñada para el ecosistema comercial peruano (foco inicial: Emporio Comercial de Gamarra y comerciantes independientes). Combina tres pilares operativos:
1. **Línea de crédito rotativo en cuotas quincenales (Plan Kuota 3X)** para abastecimiento de mercadería con proveedores mayoristas aliados.
2. **Pasarela de cobros móviles con tarifa disruptiva del 1.00%** mediante links de pago y código QR interoperable con Yape, Plin y tarjetas de crédito/débito.
3. **Scoring alternativo en tiempo real** alimentado por historial de ventas verificadas, comprobantes OCR y detección automática de abonos digitales en el celular.

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           ARQUITECTURA DEL SISTEMA                              │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│   📱 FRONTEND (Android APK / Web Simulator)                                     │
│   ├── Framework: React 18 + Vite 6 + TypeScript 5                               │
│   ├── Estilos: Tailwind CSS v4 (Tokens de diseño oficiales Stitch)              │
│   ├── Runtime Nativo: Capacitor 7 (Android SDK 34 / Java-Kotlin)                │
│   └── Plugins Nativos Propios:                                                  │
│       ├── KuotaBiometric (BiometricPrompt / Huella / Rostro)                    │
│       ├── KuotaSecure (FLAG_SECURE anti-capturas / grabación de pantalla)       │
│       └── KuotaNotifications (NotificationListenerService Yape/Plin)            │
│                                                                                 │
│         ▲                                                  ▲                    │
│         │ HTTPS (REST API v1)                              │ Webhook HMAC       │
│         ▼                                                  ▼                    │
│                                                                                 │
│   ⚙️ BACKEND API (Node.js 24 + Express 5)                                       │
│   ├── Middleware: Helmet, CORS estricto, Rate Limiting, JSON rawBody            │
│   ├── Sesiones: Bearer Tokens de 15 min ligados a Device-ID                     │
│   ├── Criptografía: Scrypt + Pepper (PIN), HMAC-SHA256 (Links, QR, Webhooks)    │
│   ├── Motor de Riesgo: 14 reglas antifraude en caliente + Step-up PIN          │
│   └── Integraciones Externas:                                                   │
│       ├── SUNAT (Consulta RUC 11 dígitos vía scrap-sunat y APIs públicas)       │
│       ├── RENIEC / Didit (Verificación biométrica y validación DNI)             │
│       ├── Pay360 & Openpay (Adquirencia y cobros con tarjeta/QR)                │
│       └── Nodemailer (Notificaciones transaccionales y Libro Reclamaciones)     │
│                                                                                 │
│         ▲                                                  ▲                    │
│         │ Pool pg (Esquema Public)                         │ Pool pg (Payments) │
│         ▼                                                  ▼                    │
│                                                                                 │
│   🗄️ PERSISTENCIA (PostgreSQL 16 Multi-Esquema / PGlite local)                 │
│   ├── Esquema `public`: Comercios, usuarios, catálogos, créditos, compras.     │
│   └── Esquema `payments`: Dinero, links firmados, ledger contable de partida    │
│       doble (`ledger_entries`), credenciales, bitácora SHA-256 inmutable.       │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. ESTRUCTURA RECOMENDADA PARA LINEAR

Para organizar el trabajo en **Linear**, se recomienda la siguiente taxonomía:

### 2.1 Equipos en Linear (Teams)
- `KUO-FE`: Frontend App & Android Native (Capacitor/React)
- `KUO-BE`: Backend Core & API Services (Node.js/Postgres)
- `KUO-SEC`: Seguridad, Fraude & Pagos (Cryptography & Risk)
- `KUO-OPS`: DevOps, Cloud GCP/Railway & Regulatorio

### 2.2 Convención de Estados (Workflow States)
- `Backlog`: Tareas identificadas sin iniciar.
- `Todo`: Tareas planificadas para el sprint/ciclo activo.
- `In Progress`: En desarrollo activo.
- `In Review`: Pull Request abierto / validación de pruebas.
- `Verified (Done)`: Implementado en staging / producción.
- `Canceled`: Tarea descartada o aplazada.

### 2.3 Matriz de Prioridades en Linear
- `Urgent (P1)`: Bloqueantes de seguridad, vulnerabilidades de dinero, transacciones rotas, fallos de build APK.
- `High (P2)`: Funcionalidades críticas de los PRD (flujo de cuotas, links de pago, login, validaciones RENIEC/SUNAT).
- `Medium (P3)`: Mejoras de UX, animaciones Stitch, nuevos reportes de scoring.
- `Low (P4)`: Refactorizaciones cosméticas o tareas no bloqueantes.

---

## 3. MÓDULO A: ONBOARDING Y AUTENTICACIÓN DEL EMPRENDEDOR (MERCHANT)

### Épica: `EPIC-ONB-MERCHANT` · Onboarding y Validación de Identidad Emprendedor

#### 3.1 PRD 01 — Bienvenida y Selección de Perfil
- **Linear Issue:** `KUO-101` · Pantalla de Bienvenida con Selección de Rol
- **Componente Frontend:** `WelcomeScreen.tsx`
- **Funcionalidad:**
  - Selector de dos roles: **Emprendedor** (`MERCHANT`) vs **Proveedor Mayorista** (`PROVIDER`).
  - Contadores sociales en vivo: `+18,500 negocios activos`, `S/ 4.2M movidos`.
  - Botón secundario para acceso directo a inicio de sesión (`LoginScreen`).
  - Creación de sesión de onboarding temporal persistida en localStorage.
- **Backend Endpoint:** `POST /api/v1/onboarding/sessions`
  - *Payload:* `{ role: "MERCHANT" | "PROVIDER" }`
  - *Response:* `{ session_id: "ses_uuid", step: "IDENTITY", expires_at: "..." }`

#### 3.2 PRD 02 — Identidad y Validación RENIEC / Didit
- **Linear Issue:** `KUO-102` · Registro de Identidad con Validación DNI en Vivo
- **Componentes Frontend:** `MerchantIdentityScreen.tsx`, `MerchantValidatingScreen.tsx`
- **Funcionalidad:**
  - Entrada de DNI peruano (8 dígitos con validación de dígito verificador).
  - Consulta en tiempo real de nombres completos oficiales contra RENIEC.
  - Registro de número celular peruano (prefijo 9, 9 dígitos) y consentimiento de términos.
  - Pantalla interactiva de validación asíncrona con stepper visual (RENIEC, consultas fiscales, evaluación de riesgo).
- **Backend Endpoints:**
  - `GET /api/v1/onboarding/reniec/:dni`: Validación rápida de DNI y nombres.
  - `POST /api/v1/onboarding/sessions/:id/merchant-identity`: Guarda datos personales y arranca proceso KYC.
  - `GET /api/v1/onboarding/merchant-kyc/:requestId`: Consulta de estado de validación (`PENDING`, `APPROVED`, `MANUAL_REVIEW`).

#### 3.3 PRD 02 (Paso 1/3) — Actividad Comercial
- **Linear Issue:** `KUO-103` · Selección de Rubro y Cálculo de Nivel Sugerido
- **Componente Frontend:** `MerchantActivityScreen.tsx`
- **Funcionalidad:**
  - Selector visual de rubros comerciales: Confección/Moda (`FASHION`), Gastronomía (`FOOD`), Tecnología (`TECH`), Bodegas, Calzado, etc.
  - Rango de antigüedad comercial (<6 meses, 6-12 meses, 1-3 años, >3 años).
  - Selector de ventas mensuales estimadas.
  - Cálculo dinámico en frontend del `tier_hint` (Nivel Brote sugerido).
  - Autoguardado con debounce en el backend.
- **Backend Endpoint:** `PUT /api/v1/onboarding/sessions/:id/merchant-activity`

#### 3.4 PRD 03 (Paso 2/3) — Catálogo de Productos
- **Linear Issue:** `KUO-104` · Registro Rápido de Inventario de Productos
- **Componente Frontend:** `MerchantProductsScreen.tsx`
- **Funcionalidad:**
  - Formulario de alta rápida de productos principales (nombre, precio en Soles PEN, rotación: Alta, Media, Baja).
  - Lista dinámica con eliminación y cálculo del valor total del inventario registrado.
  - Autoguardado en sesión.
- **Backend Endpoint:** `PUT /api/v1/onboarding/sessions/:id/products`

#### 3.5 PRD 04 (Paso 3/3) — Aprobación y Resumen de Bienvenida
- **Linear Issue:** `KUO-105` · Aprobación de Línea Inicial y Proveedores Sugeridos
- **Componente Frontend:** `MerchantWelcomeSummaryScreen.tsx`
- **Funcionalidad:**
  - Pantalla de celebración con confeti nativo (`canvas-confetti`).
  - Notificación de línea de crédito aprobada (**S/ 1,400.00 en Nivel 1 Brote**).
  - Desglose de condiciones: Compra en 3 cuotas quincenales, 50% de inicial.
  - Directorio de proveedores aliados recomendados en Gamarra.
  - Redirección automática a la configuración de PIN de seguridad.
- **Backend Endpoint:** `POST /api/v1/onboarding/sessions/:id/complete`
  - *Lógica interna:* Crea atómicamente el registro en `merchants`, la línea de crédito en `credit_lines` y siembra productos iniciales.

#### 3.6 Configuración de PIN de Seguridad (Fin de Onboarding)
- **Linear Issue:** `KUO-106` · Creación y Confirmación de PIN de Seguridad (6 Dígitos)
- **Componente Frontend:** `SecurityPinScreen.tsx`
- **Funcionalidad:**
  - Teclado numérico táctil seguro integrado en UI.
  - Flujo de dos pasos: `Crear PIN` -> `Confirmar PIN`.
  - Verificación de PINs débiles (bloqueo de secuencias `123456`, repetidos `111111`).
  - Hashing en servidor con scrypt + salt + pepper.
  - Vinculación del dispositivo (`device_id`) a las credenciales creadas.
- **Backend Endpoint:** `POST /api/v1/onboarding/sessions/:id/security-pin`

#### 3.7 Inicio de Sesión (Login) y Gestión de Sesión
- **Linear Issue:** `KUO-107` · Login con DNI + PIN y Manejo de Bloqueos
- **Componente Frontend:** `LoginScreen.tsx`
- **Funcionalidad:**
  - Autenticación por DNI y PIN de 6 dígitos.
  - Contador de intentos fallidos (máximo 5 intentos antes de bloqueo temporal de 15 minutos).
  - Opción de desbloqueo biométrico rápido si el dispositivo está enrolado.
  - Token bearer de 15 minutos con renovación automática.
- **Backend Endpoints:**
  - `POST /api/v1/auth/sessions`: Emisión de token de sesión.
  - `GET /api/v1/auth/me`: Verificación de identidad y vigencia de token.
  - `DELETE /api/v1/auth/sessions/current`: Cierre de sesión y revocación en servidor.

---

## 4. MÓDULO B: DASHBOARD PRINCIPAL Y OPERACIONES DEL EMPRENDEDOR

### Épica: `EPIC-DASHBOARD` · Dashboard del Comercio y Operaciones Financieras

#### 4.1 PRD 05 — Pantalla de Inicio (Home Agregado)
- **Linear Issue:** `KUO-201` · Home Agregado de Baja Latencia (<400ms)
- **Componente Frontend:** `HomeScreen.tsx`
- **Funcionalidad:**
  - Saludo contextual según la hora local de Lima (Buenos días / tardes / noches).
  - Tarjeta de crédito principal: Límite total (`S/ 1,400.00`), saldo utilizado, saldo disponible y **Poder de Compra (2x en Nivel Brote: S/ 2,800.00)**.
  - Widget de Próximo Vencimiento: Proveedor, número de cuota (ej. Cuota 1 de 3), fecha exacta y monto en Soles.
  - Racha de puntualidad y nivel actual (`Brote`, `Raíz`, etc.).
  - Acciones rápidas flotantes: Kuotear, Cobrar con link, Registrar venta, Pagar cuota.
  - Carrusel de promociones y descuentos activos en proveedores aliados.
- **Backend Endpoint:** `GET /api/v1/merchants/me/home`

#### 4.2 PRD 06 — Ventas del Negocio y Escáner OCR Yape/Plin
- **Linear Issue:** `KUO-202` · Registro de Ventas, OCR de Comprobantes y Score Kuota
- **Componentes Frontend:** `SalesScreen.tsx`, `OcrScannerModal.tsx`
- **Funcionalidad:**
  - Balance de ventas del mes dividido en: **Ventas Verificadas** (cobradas por link Kuota) vs **Ventas Declaradas** (capturadas por notificación o registro manual).
  - Formulario modal de "Venta Rápida": Registro de monto y método (Efectivo, Transferencia, Yape, Plin).
  - Escáner OCR simulado con visor de cámara para comprobantes de pago de Yape/Plin:
    - Extrae número de operación, fecha y monto.
    - Otorga bonificación de **+8 puntos al Score Kuota**.
  - Visualizador de Kuota Score (0 a 100 puntos) con desglose de factores de calificación.
- **Backend Endpoints:**
  - `GET /api/v1/merchants/me/sales/summary`: Totales del mes, promedio diario y comparativo.
  - `POST /api/v1/merchants/me/sales`: Registro manual de venta.
  - `POST /api/v1/merchants/me/sales/ocr`: Procesamiento y validación de comprobante OCR.
  - `GET /api/v1/merchants/me/score`: Calificación crediticia y recomendaciones de mejora.

#### 4.3 PRD 07 — Modal Kuotear (Simulador Financiero de Cuotas)
- **Linear Issue:** `KUO-203` · Modal Kuotear y Motor de Regla 3.2
- **Componente Frontend:** `KuotearModal.tsx`
- **Funcionalidad:**
  - Hoja modal interactiva (*bottom sheet*) invocable desde cualquier pantalla del dashboard.
  - Validación de la **Regla de Negocio 3.2**:
    1. Línea activa y saldo disponible suficiente.
    2. Sin cuotas vencidas impagas.
    3. Inicial mínima cubierta según el nivel (50% en Brote).
  - Slider interactivo para seleccionar el monto de compra.
  - Simulador de 3 cuotas quincenales: Calcula la inicial requerida, el importe de cada cuota y la fecha exacta de vencimiento.
  - Desglose transparente de TCEA, intereses y comisiones conforme a normativa peruana.
- **Backend Endpoints:**
  - `GET /api/v1/merchants/me/kuotear`: Consulta de condiciones y elegibilidad de línea.
  - `POST /api/v1/credit/simulations`: Cálculo matemático exacto de cronograma de amortización.

#### 4.4 PRD 08 — Cobrar con Link de Pago y Código QR
- **Linear Issue:** `KUO-204` · Generador de Link de Pago y QR Interoperable
- **Componente Frontend:** `PaymentLinkScreen.tsx`
- **Funcionalidad:**
  - Teclado POS numérico táctil interactivo con formato Soles (S/).
  - Cálculo instantáneo de comisión Kuota (1.00% + IGV si aplica) y neto a recibir por el comercio.
  - Campo opcional para concepto o detalle del pedido.
  - Generación de Link único firmado criptográficamente (URL con token de 128 bits y MAC).
  - Generación de Código QR nativo en pantalla mediante canvas local (sin dependencias de APIs de terceros no seguras).
  - Botones de acción directa: Compartir por WhatsApp con mensaje pre-redactado, Copiar enlace al portapapeles.
  - Botón de pruebas: "Simular Pago de Cliente" (dispara webhook de pago completado en el entorno de pruebas).
- **Backend Endpoints:**
  - `POST /api/v1/payment-links/quote`: Cotización en vivo de comisiones y neto.
  - `POST /api/v1/payment-links`: Creación e idempotencia del link de cobro (`Idempotency-Key` obligatoria).
  - `GET /api/v1/payment-links/:id`: Consulta de estado en tiempo real (`PENDING`, `PAID`, `EXPIRED`, `CANCELLED`).
  - `POST /api/v1/payment-links/:id/cancel`: Cancelación manual por parte del comercio.

#### 4.5 PRD 09 — Comprar al Crédito (Plan Kuota 3X)
- **Linear Issue:** `KUO-205` · Gestión de Créditos Activos y Pago de Cuotas
- **Componente Frontend:** `BuyOnCreditScreen.tsx`
- **Funcionalidad:**
  - Vista detallada de la compra mayorista activa (ej. Pedido con *Confecciones Don Lucho & Hnos.*).
  - Estado de las cuotas: Pagadas (`PAID`), Pendientes (`PENDING`), Por vencer.
  - Botón "Pagar Cuota": Ejecuta el pago de la cuota quincenal con recarga automática e inmediata del saldo disponible de la línea de crédito.
  - Modal "Liquidar Deuda Total": Permite amortizar anticipadamente todas las cuotas pendientes con recálculo de intereses a favor del comercio.
- **Backend Endpoints:**
  - `GET /api/v1/credit/purchases/active`: Detalle de la compra en curso y cronograma.
  - `POST /api/v1/credit/installments/:id/pay`: Pago de cuota individual.
  - `POST /api/v1/credit/purchases/:id/settle`: Liquidación anticipada total.

#### 4.6 PRD 10 — Mi Línea de Crédito (Escala de 6 Niveles)
- **Linear Issue:** `KUO-206` · Sistema Canónico de Progresión de Crédito (6 Niveles)
- **Componente Frontend:** `CreditLineScreen.tsx`
- **Funcionalidad:**
  - Visualización del nivel actual y barra de progreso basada en pagos puntuales consecutivos.
  - Escala canónica de 6 niveles botánicos:
    1. **Brote:** Inicial 50% | Línea S/ 1,400.
    2. **Raíz:** Inicial 40% | Línea S/ 2,500.
    3. **Tallo:** Inicial 30% | Línea S/ 4,000.
    4. **Rama:** Inicial 20% | Línea S/ 6,500.
    5. **Fruto:** Inicial 10% | Línea S/ 10,000.
    6. **Cosecha:** Inicial 0% (Sin inicial previa) | Línea S/ 15,000+.
  - Lista de requisitos y misiones para subir de nivel (cuotas pagadas a tiempo, ventas registradas).
- **Backend Endpoints:**
  - `GET /api/v1/credit/line`: Consulta de línea y métricas de puntualidad.
  - `GET /api/v1/credit/levels`: Catálogo de los 6 niveles y sus beneficios.

#### 4.7 Perfil del Comercio, Notificaciones y Ajustes de Seguridad
- **Linear Issue:** `KUO-207` · Mi Perfil, Notificaciones y Configuración de Cuenta
- **Componentes Frontend:** `ProfileScreen.tsx`, `NotificationsSheet.tsx`, `PaymentSecurityPanels.tsx`
- **Funcionalidad:**
  - Ficha del negocio: Nombre comercial, titular, DNI, RUC y estado de verificación.
  - Panel de Seguridad:
    - Interruptor de Desbloqueo Biométrico (Huella / Rostro).
    - Cambio de PIN de 6 dígitos (exige verificación del PIN actual).
    - Gestión de Dispositivos Vinculados (ver modelo, fecha de enrolamiento y desvincular).
    - Límites de cobro operativos (máximo por transacción, máximo diario).
  - Cajón de notificaciones push / in-app con contador de no leídos.
  - Enlaces legales obligatorios: Términos y Condiciones, Política de Privacidad y Libro de Reclamaciones Virtual.
  - Cierre seguro de sesión.
- **Backend Endpoints:**
  - `GET /api/v1/merchants/me/payments/limits`: Consulta de límites actuales y pendientes.
  - `PUT /api/v1/merchants/me/payments/limits`: Solicitud de modificación de límites.
  - `GET /api/v1/merchants/me/payments/devices`: Listado de dispositivos autorizados.
  - `DELETE /api/v1/merchants/me/payments/devices/:deviceId`: Desvinculación de dispositivo.
  - `GET /api/v1/merchants/me/notifications/preferences`: Preferencias de alertas.
  - `POST /api/v1/merchants/me/notifications/seen`: Marca notificaciones como leídas.

---

## 5. MÓDULO C: ONBOARDING Y GESTIÓN DEL PROVEEDOR MAYORISTA (PROVIDER)

### Épica: `EPIC-ONB-PROVIDER` · Registro y Onboarding del Proveedor Mayorista

#### 5.1 PRD 11 — Registro Fiscal SUNAT
- **Linear Issue:** `KUO-301` · Verificación de RUC 11 Dígitos y Estado SUNAT
- **Componente Frontend:** `ProviderFiscalScreen.tsx`
- **Funcionalidad:**
  - Búsqueda en vivo de RUC peruano de 11 dígitos contra el padrón de la SUNAT.
  - Verificación estricta de condiciones tributarias: Estado **ACTIVO** y Condición de Domicilio **HABIDO**.
  - Autocompletado de Razón Social y Dirección Fiscal.
  - Verificación del DNI del Representante Legal ante RENIEC.
  - Registro de WhatsApp comercial verificado.
- **Backend Endpoints:**
  - `GET /api/v1/kyc/business-lookup/:ruc`: Consulta directa al scraper/padrón SUNAT.
  - `POST /api/v1/businesses/confirm`: Confirmación de datos fiscales y creación del perfil proveedor.

#### 5.2 PRD 12 — Validación KYC y Scoring de Proveedor
- **Linear Issue:** `KUO-302` · Pipeline Asíncrono de Validación Proveedor
- **Componente Frontend:** `ProviderValidatingScreen.tsx`
- **Funcionalidad:**
  - Identificador público de seguimiento (ej. `PRV-89420-PE`).
  - Animación de validación en 3 etapas:
    1. Consistencia fiscal SUNAT y deudas coactivas.
    2. Identidad del Representante Legal (RENIEC / Didit).
    3. Scoring comercial y capacidad crediticia mayorista.
- **Backend Endpoint:** `GET /api/v1/kyc/requests/:publicId`

#### 5.3 PRD 13 — Actividad Comercial Mayorista
- **Linear Issue:** `KUO-303` · Selección de Categoría de Insumo y Antigüedad
- **Componente Frontend:** `ProviderActivityScreen.tsx`
- **Funcionalidad:**
  - Selección de categoría principal de insumo comercial (Telas/Textil, Denim, Hilos/Mercería, Avíos, Maquinaria, etc.).
  - Años de operación en el mercado mayorista.
- **Backend Endpoint:** `PUT /api/v1/providers/activity`

#### 5.4 PRD 14 — Localización GPS y Georreferenciación
- **Linear Issue:** `KUO-304` · Mapa Interactivo y Pin GPS en Gamarra
- **Componente Frontend:** `ProviderGpsScreen.tsx`
- **Funcionalidad:**
  - Mapa interactivo con marcador arrastrable (Leaflet / OpenStreetMap).
  - Detección automática de ubicación por GPS del dispositivo (`Geolocation API`).
  - Normalización de dirección y referencia dentro del emporio comercial (ej. Jr. Gamarra, Galería Guizado).
- **Backend Endpoints:**
  - `POST /api/v1/geo/reverse`: Geocodificación inversa de coordenadas a dirección.
  - `PUT /api/v1/providers/location`: Almacenamiento de ubicación geográfica del local.

#### 5.5 PRD 15 — Notificaciones, Permisos y Límite Aprobado
- **Linear Issue:** `KUO-305` · Pre-aprobación de Capacidad y Permisos de Operación
- **Componente Frontend:** `ProviderNotificationsScreen.tsx`
- **Funcionalidad:**
  - Vista previa de la capacidad de ventas al crédito aprobada (**Límite aprobado: S/ 45,000.00 PEN**).
  - Red de comercios compradores listos para adquirir mercadería con Kuota.
  - Configuración de canales de alerta (WhatsApp y Notificaciones Push para nuevos pedidos y liquidaciones).
- **Backend Endpoint:** `PUT /api/v1/providers/notifications`

#### 5.6 PRD 16 — Estimación de Ahorro y Cuenta de Abono CCI
- **Linear Issue:** `KUO-306` · Calculadora de Ahorro (71%) y Registro de Cuenta CCI
- **Componente Frontend:** `ProviderSavingsScreen.tsx`
- **Funcionalidad:**
  - Calculadora comparativa interactiva: Tarifa Kuota (1.00%) vs Tasa tradicional de mercado (3.45%).
  - Demostración de **71% de ahorro** (ej. S/ 588.00 al año ahorrados sobre S/ 24,000.00 en ventas).
  - Registro de cuenta bancaria mediante Código de Cuenta Interbancario (CCI de 20 dígitos) para abonos automáticos en 24h.
  - Activación definitiva de la cuenta de proveedor y paso a creación de PIN.
- **Backend Endpoints:**
  - `GET /api/v1/providers/savings-estimate`: Cálculo de proyecciones financieras de ahorro.
  - `PUT /api/v1/providers/settlement-account`: Registro y validación de formato CCI.
  - `POST /api/v1/providers/activate`: Activación de la cuenta de proveedor mayorista.

---

## 6. MÓDULO D: CHECKOUT PÚBLICO DE PAGOS (PAY PAGE)

### Épica: `EPIC-PAY-PAGE` · Experiencia Web de Pago para el Cliente Final

#### 6.1 Página Web de Cobro Responsiva (`/pay/:code`)
- **Linear Issue:** `KUO-401` · Checkout Web Público Móvil sin Fricción
- **Componente Frontend:** `PayPage.tsx` (Renderizable tanto en app como web independiente en `/pay/:code`)
- **Funcionalidad:**
  - Acceso directo mediante escaneo del QR o apertura del enlace desde WhatsApp.
  - Interfaz ultraliviana para móviles sin requerir inicio de sesión ni descarga de app.
  - Muestra nombre comercial del vendedor, nivel de verificación y RUC enmascarado (privacidad).
  - Detalle del importe a pagar y concepto de la compra.
  - Opciones de pago integradas:
    - **Yape:** Generación de código de aprobación o QR dinámico.
    - **Plin:** Pago por QR / número.
    - **Tarjeta de Débito/Crédito:** Formulario seguro tokenizado vía pasarela (Openpay / Pay360).
  - Sondeo en tiempo real (*polling* cada 3 segundos) del estado del link para mostrar pantalla de confirmación con animación de éxito tan pronto como el pago se acredite.
- **Backend Endpoints:**
  - `GET /api/v1/payment-links/public/:code`: Obtención de datos públicos del cobro con verificación de firma HMAC y expiración.
  - `POST /pay/:code`: Manejador HTML / SSR para navegadores web estándar.

---

## 7. MÓDULO E: SEGURIDAD BANCARIA, CRIPTOGRAFÍA Y KUOTA PAYMENTS

### Épica: `EPIC-SECURITY` · Blindaje Criptográfico, Prevención de Fraude y Auditoría

#### 7.1 Criptografía y Gestión de Credenciales
- **Linear Issue:** `KUO-501` · Hashing Seguro de PIN y Sesiones Efímeras
- **Ubicación:** `backend/src/security/crypto.ts`, `backend/src/security/auth.ts`
- **Funcionalidad:**
  - Hashing de PIN con función de derivación de claves `scrypt` (coste parametrizado N=16384, r=8, p=1) + sal criptográfica + pimienta de servidor (`KUOTA_PIN_PEPPER`).
  - Emisión de tokens de sesión con validez de 15 minutos ligados obligatoriamente al identificador único de hardware (`device_id`).
  - Bloqueo preventivo de cuenta ante 5 intentos erróneos consecutivos con ventana de enfriamiento de 15 minutos.
  - Período de enfriamiento (*cooldown*) de 24 horas con límites reducidos al 25% ante enrolamiento de un dispositivo nuevo o reseteo de PIN.

#### 7.2 Integridad de Enlaces de Cobro y Códigos QR
- **Linear Issue:** `KUO-502` · Enlaces Firmados HMAC e Inmutabilidad de Montos
- **Ubicación:** `backend/src/security/links.ts`, `backend/migrations/0002_payments.sql`
- **Funcionalidad:**
  - Token de enlace opaco de 128 bits con MAC integrado para descarte inmediato de URLs forjadas sin tocar la base de datos.
  - Firma HMAC-SHA256 que concatena: `id_link + merchant_id + amount_cents + currency + expires_at`.
  - Disparadores (*triggers*) en PostgreSQL que prohíben estrictamente `UPDATE` o `DELETE` sobre el monto o moneda de un cobro ya emitido.
  - Vencimiento estricto de links a las 48 horas de su generación.

#### 7.3 Recepción de Webhooks Idempotentes y Firma Digital
- **Linear Issue:** `KUO-503` · Webhooks Seguros contra Ataques de Repetición (Replay)
- **Ubicación:** `backend/src/security/webhook.ts`, `backend/src/routes/webhook.routes.ts`
- **Funcionalidad:**
  - Verificación de cabecera `X-Signature-256` utilizando el secreto compartido de pasarela.
  - Ventana de tolerancia máxima de 300 segundos (5 minutos) en el timestamp del evento para impedir ataques de repetición.
  - Validación de identificador único de evento (`X-360pay-Event-ID` / Openpay event ID): transacciones repetidas devuelven respuesta inmediata sin re-procesar; cargas con mismo ID pero diferente cuerpo generan error `409 Conflict`.
  - Procesamiento atómico en una sola transacción SQL.

#### 7.4 Motor Antifraude en Tiempo Real (14 Reglas)
- **Linear Issue:** `KUO-504` · Motor de Reglas de Riesgo y Step-up PIN
- **Ubicación:** `backend/src/security/risk.ts`, `backend/src/security/riskRules.ts`
- **Funcionalidad:**
  - Evaluación de 14 reglas dinámicas editables en caliente sin reiniciar el servidor:
    1. Límite de monto por transacción según nivel KYC.
    2. Límite de monto acumulado diario.
    3. Velocidad de cobros (máximo de transacciones en ventana de 5 minutos).
    4. Detección de estructuración o "pitufeo" (patrones de cobros fraccionados).
    5. Verificación de listas negras (DNI, RUC, Device-ID, IP).
    6. Verificación de lista gris (dispositivos bajo observación).
    7. Cambios de IP geográficamente inverosímiles.
    8. Dispositivos recién vinculados en período de enfriamiento.
    9. Cobros en horarios inusuales de madrugada.
    10. Alertas por discrepancias de montos.
    11. etc.
  - Acciones graduadas del motor: `APPROVE`, `STEP_UP` (exige autorización con PIN de un solo uso), `ON_HOLD` (retención preventiva para revisión manual), `BLOCK` (rechazo total silencioso).

#### 7.5 Contabilidad de Partida Doble y Conciliación Automática
- **Linear Issue:** `KUO-505` · Ledger Inmutable y Conciliación Contable
- **Ubicación:** `backend/src/security/reconciliation.ts`, `backend/migrations/0002_payments.sql`
- **Funcionalidad:**
  - Esquema contable estricto en tabla `payments.ledger_entries`: Cada cobro genera asientos balanceados de Debe y Haber (monto pagado por cliente, comisión Kuota, fondo neto abonado al comercio).
  - Triggers de inmutabilidad: Imposibilidad de modificar o eliminar asientos del libro contable (tabla *append-only*).
  - Proceso de conciliación nocturna automatizada: Compara los reportes liquidados de pasarela frente a los cobros registrados y alerta de cualquier descuadre de céntimos.

#### 7.6 Bitácora de Auditoría Encadenada con SHA-256
- **Linear Issue:** `KUO-506` · Registro Criptográfico Encadenado de Eventos Críticos
- **Ubicación:** `backend/src/security/audit.ts`
- **Funcionalidad:**
  - Tabla `payments.audit_log` con encadenamiento criptográfico: cada fila almacena el hash SHA-256 de la fila anterior, garantizando detección inmediata ante cualquier alteración maliciosa en base de datos.
  - Endpoint administrativo de verificación de integridad: `GET /api/v1/internal/audit/verify`.

---

## 8. MÓDULO F: CAPACIDADES NATIVAS ANDROID (CAPACITOR & KOTLIN)

### Épica: `EPIC-ANDROID-NATIVE` · Integración Nativa Android y Plugins Capacitor

#### 8.1 Autenticación Biométrica Nativa (`KuotaBiometric`)
- **Linear Issue:** `KUO-601` · Plugin Nativo Android BiometricPrompt
- **Archivos:**
  - `frontend/src/plugins/kuotaBiometric.ts` (TypeScript Wrapper)
  - `frontend/android/app/src/main/java/pe/kuota/app/KuotaBiometricPlugin.kt` (Kotlin Plugin)
- **Funcionalidad:**
  - Integración con Android `androidx.biometric.BiometricPrompt`.
  - Soporte para huella dactilar (*Fingerprint*) y reconocimiento facial (*Face Unlock*).
  - Métodos expuestos: `isAvailable()`, `authenticate({ title, subtitle, negativeText })`.
  - Fallback suave al PIN de seguridad ante cancelación o múltiples intentos fallidos.

#### 8.2 Protección Anti-Capturas y Grabación (`KuotaSecure`)
- **Linear Issue:** `KUO-602` · Plugin Anti-Capturas y Protección de Pantalla
- **Archivos:**
  - `frontend/src/plugins/kuotaSecure.ts`
  - `frontend/android/app/src/main/java/pe/kuota/app/KuotaSecurePlugin.kt`
- **Funcionalidad:**
  - Activa y desactiva dinámicamente el flag `WindowManager.LayoutParams.FLAG_SECURE` en la ventana de Android.
  - Bloqueo activo en pantallas sensibles: Ingreso de PIN (`SecurityPinScreen`, `LoginScreen`), datos personales y bancarios (`MerchantIdentityScreen`, `ProviderFiscalScreen`, `ProviderSavingsScreen`, `ProfileScreen`).
  - Habilitación de capturas en pantallas no sensibles (ej. comprobantes de venta compartibles).

#### 8.3 Detector Automático de Notificaciones de Pagos Yape / Plin (`KuotaNotifications`)
- **Linear Issue:** `KUO-603` · Listener Nativo de Notificaciones Push Yape/Plin
- **Archivos:**
  - `frontend/src/plugins/kuotaNotifications.ts`
  - `frontend/src/services/paymentListener.ts`
  - `frontend/android/app/src/main/java/pe/kuota/app/KuotaNotificationService.kt`
  - `frontend/android/app/src/main/java/pe/kuota/app/KuotaNotificationsPlugin.kt`
- **Funcionalidad:**
  - Servicio nativo Android `NotificationListenerService` registrado en `AndroidManifest.xml`.
  - Monitorea en segundo plano notificaciones entrantes de las apps oficiales de Yape (`com.bcp.innovacxion.yapeapp`) y Plin.
  - Expresiones regulares que parsean el importe en Soles y el nombre del pagador.
  - Notifica a la aplicación React en tiempo real para registrar automáticamente la venta declarada e incrementar el Score Kuota sin intervención manual del comerciante.

#### 8.4 Manejo del Botón Atrás del Hardware y Barra de Estado
- **Linear Issue:** `KUO-604` · Experiencia de Navegación Nativa y StatusBar
- **Funcionalidad:**
  - Manejo jerárquico del botón de retroceso de Android (`backButton` listener de `@capacitor/app`):
    1. Si hay un diálogo o modal abierto, lo cierra (ej. Kuotear o PIN).
    2. Si está en un flujo paso a paso de onboarding, retrocede al paso anterior.
    3. Si está en una pestaña secundaria del dashboard, vuelve a la pestaña Inicio.
    4. Si está en el Inicio o Bienvenida, solicita confirmación o sale de la app (`NativeApp.exitApp()`).
  - Configuración de `@capacitor/status-bar` para fondos limpios y contraste de iconos óptimo.

---

## 9. MÓDULO G: BASE DE DATOS Y MODELO RELACIONAL (POSTGRESQL)

### Épica: `EPIC-DATABASE` · Estructura de Datos y Migraciones

La base de datos utiliza PostgreSQL con partición en dos esquemas de seguridad:

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                                TABLAS DEL SISTEMA                               │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│   ESQUEMA `public` (Núcleo Operativo):                                          │
│   ├── `users`: Cuentas de usuario, teléfono, DNI, rol.                          │
│   ├── `merchants`: Perfil del emprendedor, rubro, antigüedad, score crediticio. │
│   ├── `products`: Inventario de productos del comercio con precio en céntimos.  │
│   ├── `sales`: Registro de ventas verificadas vs declaradas, canal y notas.     │
│   ├── `credit_lines`: Línea asignada, saldo usado, nivel (1-6), puntualidad.    │
│   ├── `credit_levels`: Catálogo de niveles (Brote a Cosecha), % inicial y tope. │
│   ├── `credit_purchases`: Compras mayoristas a crédito (Plan Kuota 3X).         │
│   ├── `installments`: Cuotas quincenales, vencimiento, estado y recargo mora.   │
│   ├── `provider_profiles`: Perfil mayorista, RUC, dirección, GPS, cuenta CCI.   │
│   ├── `promotions`: Descuentos y campañas en proveedores aliados.               │
│   ├── `onboarding_sessions`: Estado intermedio de registros paso a paso.        │
│   ├── `kyc_requests`: Auditoría de solicitudes de validación de identidad.      │
│   └── `complaints`: Libro de Reclamaciones virtual (Código correlativo).        │
│                                                                                 │
│   ESQUEMA `payments` (Zona de Dinero - Privilegio Mínimo):                      │
│   ├── `payment_links`: Links de cobro firmados, montos inmutables, estados.     │
│   ├── `charges`: Transacciones procesadas por la pasarela adquirente.           │
│   ├── `ledger_entries`: Asientos de doble partida contable (Debe / Haber).      │
│   ├── `merchant_credentials`: Hash scrypt de PIN, sal, intentos fallidos.       │
│   ├── `merchant_sessions`: Sesiones activas bearer de 15 minutos.               │
│   ├── `device_registrations`: Dispositivos móviles autorizados por comercio.    │
│   ├── `step_up_tokens`: Tokens de un solo uso para operaciones sensibles.       │
│   ├── `payment_limits`: Límites de cobro por nivel y personalizados.            │
│   ├── `risk_rules`: Reglas de fraude evaluables en tiempo real.                 │
│   ├── `risk_lists`: Listas negras, blancas y grises (DNI, IP, RUC, Dispositivo).│
│   ├── `reconciliation_runs`: Registro de ejecuciones de conciliación bancaria.  │
│   └── `audit_log`: Bitácora inmutable encadenada con hashes criptográficos.    │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

#### Historial de Migraciones Versionadas
1. `0001_core.sql`: Tablas base del negocio, usuarios, comercios, crédito y ventas.
2. `0002_payments.sql`: Creación del esquema `payments`, ledger contable, triggers de inmutabilidad y seguridad de links.
3. `0003_roles.sql`: Segregación de usuarios de base de datos (`kuota_core_rw` vs `kuota_payments_rw`).
4. `0004_pay360_coupons.sql`: Soporte para cupones promocionales y pasarela Pay360.
5. `0005_kyc_didit.sql`: Esquema para verificación biométrica externa y estado Didit.
6. `0006_provider_settlement.sql`: Cuentas bancarias de abono CCI para proveedores.
7. `0007_openpay.sql`: Soporte para tokenización y cobros con tarjeta Openpay.
8. `0008_scoring_level1.sql`: Factores cuantitativos para el Score Kuota de nivel 1.
9. `0009_provider_access.sql`: Control de accesos y tokens para proveedores mayoristas.
10. `0010_identity_token.sql`: Tokens efímeros de validación de identidad.
11. `0011_complaints.sql`: Tabla formal del Libro de Reclamaciones según INDECOPI.

---

## 10. MÓDULO H: CUMPLIMIENTO REGULATORIO, UIF, SBS E INDECOPI

### Épica: `EPIC-COMPLIANCE` · Gobernanza, Marco Regulatorio y Legal (Perú)

#### 10.1 Registro y Prevención de Lavado de Activos (SPLAFT / UIF-Perú)
- **Linear Issue:** `KUO-701` · Registro ante UIF (Res. SBS 650-2024) y Oficial de Cumplimiento
- **Requisitos:**
  - Kuota opera prestando con fondos propios (sin captación del público). No requiere licencia bancaria completa, pero **sí está obligada a inscribirse en el Registro de Empresas de Préstamo de la SBS/UIF**.
  - Designación formal de un Oficial de Cumplimiento a dedicación no exclusiva.
  - Monitoreo y reporte de Operaciones Sospechosas (ROS) y Registro de Operaciones (RO) para montos iguales o mayores a USD 10,000 o S/ 30,000 PEN.

#### 10.2 Transparencia de Tasas y Costo del Crédito (Ley 31143 / BCRP)
- **Linear Issue:** `KUO-702` · Transparencia y Cálculo de TCEA vs Límites de Usura
- **Requisitos:**
  - El esquema a 3 cuotas quincenales debe calcular y mostrar con total transparencia la **TCEA** (Tasa de Costo Efectivo Anual) en todas las simulaciones y contratos.
  - Asegurar que la tasa efectiva no sobrepase los topes máximos de interés fijados semestralmente por el Banco Central de Reserva del Perú (BCRP).

#### 10.3 Protección de Datos Personales (Ley 29733 y DS 016-2024-JUS)
- **Linear Issue:** `KUO-703` · Inscripción de Bancos de Datos Personales y Procedimiento ARCO
- **Requisitos:**
  - Registro de los bancos de datos "Clientes", "Proveedores" y "Trabajadores" ante la Autoridad Nacional de Protección de Datos Personales (ANPD).
  - Implementación del procedimiento para atención de derechos ARCO (Acceso, Rectificación, Cancelación y Oposición).
  - Plan de respuesta ante brechas de seguridad con obligación de notificación a la autoridad en un plazo máximo de **48 horas**.

#### 10.4 Protección al Consumidor y Libro de Reclamaciones (INDECOPI)
- **Linear Issue:** `KUO-704` · Libro de Reclamaciones Virtual Conforme a Ley 29571
- **Componentes:** `legal.routes.ts`, `services/complaints.ts`, `ProfileScreen.tsx`
- **Requisitos:**
  - Código correlativo único por hoja de reclamación (`REC-YYYYMMDD-XXXX`).
  - Envío automático de copia en PDF/correo al reclamante y al área de atención de Kuota.
  - Plazo máximo legal de atención perentorio de **15 días hábiles** (Ley 31435).

---

## 11. MATRIZ DE ESTADO Y ROADMAP PARA LINEAR

A continuación se detalla la matriz de estado actual del repositorio para su importación a Linear:

| ID Linear | Épica / Tarea | Módulo | Estado en Repo | Siguiente Paso Técnico |
|---|---|---|---|---|
| `KUO-101` | Selector de Rol y Bienvenida (PRD 01) | Onboarding | ✅ Implementado | Pruebas de usabilidad en móvil |
| `KUO-102` | Identidad DNI y RENIEC en vivo (PRD 02) | Onboarding | ✅ Implementado | Migrar scraper SUNAT a servicio Cloud Run dedicado |
| `KUO-103` | Rubro y Sugerencia de Tier (PRD 02) | Onboarding | ✅ Implementado | Afinar rangos de facturación mensual |
| `KUO-104` | Catálogo de Productos (PRD 03) | Onboarding | ✅ Implementado | Permitir carga masiva de fotos de productos |
| `KUO-105` | Resumen de Aprobación Línea (PRD 04) | Onboarding | ✅ Implementado | Personalización de proveedores por geolocalización |
| `KUO-106` | Creación y Hashing de PIN de 6 Dígitos | Seguridad | ✅ Implementado | Soporte para recuperación de PIN con selfie KYC |
| `KUO-107` | Login DNI + PIN con Cooldown | Autenticación | ✅ Implementado | Integrar biometría en el login directo |
| `KUO-201` | Home Agregado <400ms (PRD 05) | Dashboard | ✅ Implementado | Implementar caché en Redis para p95 < 150ms |
| `KUO-202` | Ventas, OCR Comprobantes y Score (PRD 06) | Dashboard | 🟡 Parcial (Simulado) | Integrar Google Cloud Vision API para OCR real |
| `KUO-203` | Modal Kuotear y Regla 3.2 (PRD 07) | Dashboard | ✅ Implementado | Validar contratos de crédito firmados digitalmente |
| `KUO-204` | Cobro con Link y QR Propio (PRD 08) | Cobros | ✅ Implementado | Soporte para QR interoperable estándar BCRP |
| `KUO-205` | Comprar al Crédito Kuota 3X (PRD 09) | Crédito | ✅ Implementado | Automatizar débito de cuota con débito automático |
| `KUO-206` | Escala Canónica de 6 Niveles (PRD 10) | Crédito | ✅ Implementado | Generar notificaciones automáticas al subir de nivel |
| `KUO-207` | Perfil, Dispositivos y Ajustes | Configuración | ✅ Implementado | Exportación de reporte mensual en PDF |
| `KUO-301` | RUC 11 Dígitos y SUNAT (PRD 11) | Proveedor | ✅ Implementado | Caché de padrón reducido SUNAT en Postgres |
| `KUO-302` | Validación Asíncrona Proveedor (PRD 12) | Proveedor | ✅ Implementado | Integración con Burós de Crédito (Equifax/Experian) |
| `KUO-303` | Actividad Comercial Proveedor (PRD 13) | Proveedor | ✅ Implementado | Clasificación por códigos CIIU oficiales |
| `KUO-304` | Pin GPS y Mapa en Gamarra (PRD 14) | Proveedor | ✅ Implementado | Búsqueda por galerías comerciales populares |
| `KUO-305` | Límite Aprobado y Permisos (PRD 15) | Proveedor | ✅ Implementado | Panel de control web para proveedores mayoristas |
| `KUO-306` | Estimación de Ahorro y CCI (PRD 16) | Proveedor | ✅ Implementado | Validación algorítmica de dígito de control CCI |
| `KUO-401` | Checkout Público de Pago (`/pay`) | Checkout | ✅ Implementado | Pruebas de estrés y testing en navegadores Safari |
| `KUO-501` | Criptografía scrypt y Sesiones de 15m | Seguridad | ✅ Implementado | Auditoría de pruebas de penetración (Pentest) |
| `KUO-502` | Links HMAC e Inmutabilidad SQL | Seguridad | ✅ Implementado | Cobertura de pruebas unitarias al 100% |
| `KUO-503` | Webhooks Firmados Anti-Replay | Pagos | ✅ Implementado | Simulación continua en CI/CD |
| `KUO-504` | Motor Antifraude de 14 Reglas | Riesgo | ✅ Implementado | Modelos de Machine Learning supervisados |
| `KUO-505` | Partida Doble y Conciliación | Contabilidad | ✅ Implementado | Conexión directa a API de estados de cuenta bancaria |
| `KUO-506` | Bitácora SHA-256 Encadenada | Auditoría | ✅ Implementado | Respaldo secundario en almacenamiento WORM |
| `KUO-601` | Plugin Biométrico Android | Nativo | ✅ Implementado | Manejo de excepciones en dispositivos sin hardware |
| `KUO-602` | Plugin Anti-Capturas FLAG_SECURE | Nativo | ✅ Implementado | Añadir detección de root y depuración USB |
| `KUO-603` | Detector Notificaciones Yape/Plin | Nativo | ✅ Implementado | Pruebas con versiones Android 14 y 15 |
| `KUO-701` | Registro UIF y Manual SPLAFT | Legal/Reg. | ⬜ Documentado | Trámite formal ante la SBS |
| `KUO-702` | Adecuación de Tasas a Ley 31143 | Legal/Reg. | 🟡 Parcial | Revisión de hoja resumen con asesoría legal |
| `KUO-703` | Registro de Bancos de Datos ANPD | Legal/Reg. | ⬜ Documentado | Presentación de formularios ante MinJus |
| `KUO-704` | Libro de Reclamaciones Virtual | Legal/Reg. | ✅ Implementado | Configuración de credenciales SMTP de producción |

---

## 💡 GUÍA PARA SINCRONIZACIÓN EN LINEAR

1. **Crear el Proyecto en Linear:** Crear un proyecto titulado `Kuota Android - V1 Launch`.
2. **Importación:** Utilizar la herramienta de importación CSV o la API GraphQL de Linear mapeando los campos:
   - `Title`: Nombre de la tarea (ej. `KUO-204 · Generador de Link de Pago y QR Interoperable`).
   - `Description`: Copiar los requerimientos técnicos y endpoints detallados en cada sección de este documento.
   - `Priority`: `P1` para seguridad/pagos, `P2` para módulos PRD, `P3` para mejoras visuales.
   - `Estimate`: Puntos de historia (Fibonacci: 1, 2, 3, 5, 8).
3. **Mantenimiento Continuo:** A medida que se avance en sprints, actualizar la columna `Estado en Repo` de esta especificación para mantener paridad entre el código fuente y el tablero de Linear.
