# Arquitectura de Kuota

## Visión general

```
┌────────────────────────┐        HTTPS (certificados fijados)        ┌───────────────────────────────┐
│ App Android (Capacitor)│ ─────────────────────────────────────────▶ │ Backend REST /api/v1 (Express) │
│  React + Vite          │                                            │  Node 22+ · TypeScript         │
│  Plugins Kotlin        │ ◀───────────────────────────────────────── │                                │
└────────────────────────┘                                            └──────┬──────────────┬──────────┘
        ▲                                                                    │              │
        │ QR / link                                                          ▼              ▼
┌───────┴────────────────┐                                  ┌────────────────────┐  ┌──────────────────────┐
│ Página de pago /pay/:c │                                  │ Postgres 16        │  │ Integraciones         │
│ (HTML servido por el   │                                  │  esquema public    │  │  360pay (cobros)      │
│  mismo backend)        │                                  │  esquema payments  │  │  Didit (KYC)          │
└────────────────────────┘                                  └────────────────────┘  │  Openpay (enganche)   │
                                                                                    │  SUNAT/RENIEC, correo │
                                                                                    └──────────────────────┘
```

## Backend (`backend/`)

- **Servidor:** `src/app.ts` arma Express (cabeceras de seguridad, CORS por lista, límites de tasa) y monta las rutas; `src/server.ts` lo arranca.
- **Rutas** (`src/routes/`):

  | Archivo | Responsabilidad |
  |---|---|
  | `onboarding.routes.ts` | Registro del emprendedor paso a paso, identidad (DNI/CE), PIN de seguridad. |
  | `security.routes.ts` | Inicio de sesión (PIN + dispositivo), recuperación de PIN, cambio de PIN, step-up, dispositivos. |
  | `merchant.routes.ts` | Perfil del comercio (`/merchants/me/*`): home, ventas, perfiles y RUC, plan, notificaciones, foto, búsqueda de contactos. |
  | `credit.routes.ts` | Línea de crédito, niveles, simulaciones, compras a crédito, cuotas, score. |
  | `paymentLink.routes.ts` | Links de cobro (Kuota Payments): cotización, creación, emisión, cancelación, consulta pública. |
  | `payPage.routes.ts` | Página HTML de pago para el cliente (`/pay/:código`). |
  | `webhook.routes.ts` | Webhooks firmados (360pay, Openpay, Didit) y simuladores de pasarela (solo modo simulado). |
  | `provider.routes.ts` | Registro y panel del proveedor, cuenta de abono, pedidos, proveedores afiliados, foto. |
  | `providerPayments.routes.ts` | Kuota Payments para el perfil Proveedor (crea y vincula su cuenta de cobros). |
  | `internal.routes.ts` | Administración (revisión de RUC, bitácora) con token de administración. |
  | `legal.routes.ts`, `public.routes.ts` | Páginas legales, Libro de Reclamaciones, catálogos y fotos públicas. |

- **Seguridad** (`src/security/`): autenticación y sesiones (`auth.ts`), cifrado y PIN (`crypto.ts`), límites por nivel (`limits.ts`), antifraude (`risk.ts`, `riskRules.ts`), bitácora encadenada (`audit.ts`), idempotencia y límites de tasa (`guards.ts`), precios y comisiones (`pricing.ts`), titularidad del RUC (`rucOwnership.ts`).
- **Servicios** (`src/services/`): scoring (`scoring.service.ts`), KYC (`kyc.service.ts`), SUNAT (`sunat.service.ts`), correo (`mailer.ts`), reclamos (`complaints.ts`).
- **Integraciones** (`src/integrations/`): `pay360.ts`, `didit.ts`, `openpay.ts`. Sin credenciales funcionan en modo simulado, nunca en producción.
- **Base de datos:** `migrations/*.sql` (versionadas, se aplican solas al arrancar salvo `KUOTA_AUTO_MIGRATE=0`). Desarrollo y pruebas usan PGlite embebido; producción, Postgres 16.
  - Esquema `public`: personas, comercios, proveedores, crédito, ventas, fotos, notificaciones.
  - Esquema `payments`: zona de dinero (links, eventos de pago, sesiones, límites, bitácora, conciliación) con su propio usuario de privilegio mínimo.

## Identidad, perfiles y sesiones

- Una **persona** puede tener perfil de **Emprendedor** (`merchant_profiles`) y de **Proveedor** (`provider_profiles`), enlazados por `user_id`, con **un solo PIN**.
- **Emprendedor:** cada dispositivo tiene un *token de identidad* (cabeceras `X-Merchant-Id`, `X-Merchant-Token`, `X-Device-Id`) que vive en el Android Keystore. Para cobrar se abre una *sesión de cobros* con el PIN (`Authorization: Bearer`, solo en memoria, de corta duración). Las operaciones grandes piden *step-up* (PIN otra vez, token de un solo uso).
- **Proveedor:** `X-Provider-Id` + `X-Provider-Token`. Una sola sesión por cuenta: iniciar sesión en otro equipo cierra la anterior y **el token del proveedor se rota en cada sesión de cobros**, por eso la app guarda siempre el nuevo.
- **RUC como llave:** un RUC 10 debe contener el DNI de la persona; un RUC 20 pasa por revisión manual (`/internal/ruc-reviews`).
- **Contactos:** `POST /merchants/me/contacts/lookup` dice si un celular ya tiene Kuota. Exige sesión, limita consultas por minuto y hora, anota la consulta sin el número y devuelve solo lo ya público (nombre del negocio o nombre con apellidos abreviados y foto si la puso).
- **Foto de perfil:** el teléfono la recorta (256 px, JPEG, sin EXIF) y el servidor la revalida. Se sirve en `/api/v1/public/avatar/:token` con un token aleatorio que cambia con cada foto.

## Dinero

- Montos en céntimos enteros; comisión **1 % + IGV** (mínimo S/ 4.50 + IGV), cobro mínimo S/ 10, topes por plan y por nivel.
- El link lleva el monto firmado, vence y es de un solo uso; el pago se confirma **solo** por el webhook firmado de 360pay (HMAC, anti-repetición, idempotente).
- Pagar una cuota o liquidar una compra de crédito solo es posible en modo simulado: sin pasarela que confirme el dinero el servidor responde `PAYMENT_GATEWAY_REQUIRED`.
- Una sola fuente para el score: `computeScore` (300–900). Los niveles de **crédito** (Brote, Raíz, Tallo, Rama, Fruto, Cosecha) son distintos del **puntaje** (Básico, Intermedio, Avanzado).

## App (`frontend/`)

- **React 19 + Vite + TypeScript + Tailwind 4.** `src/App.tsx` decide la pantalla (bienvenida, registro, inicio, panel de proveedor) y concentra la sesión, el bloqueo y el cambio de perfil.
- `src/screens/`: `onboarding/` (registro e inicio de sesión), `dashboard/` (Emprendedor), `provider/` (panel del proveedor), `pay/` (página de pago web).
- `src/api/`: `client.ts` (todas las llamadas), `payments.ts` (sesión de cobros y PIN), `profiles.ts` (perfiles).
- `src/components/`, `src/hooks/`, `src/services/` (ajustes, huella, escucha de pagos), `src/utils/`.
- `src/demo/`: servidor simulado para la demo web sin backend.
- **Android nativo** (`frontend/android/…/pe/kuota/app/`, Kotlin): `KuotaVaultPlugin` (bóveda cifrada con Keystore), `KuotaBiometricPlugin` (huella: el PIN se sella con una clave biométrica), `KuotaSecurePlugin` (bloquea capturas), `KuotaNotificationService`/`KuotaNotificationsPlugin` (detecta abonos de Yape y Plin).
- **Red:** `network_security_config.xml` solo permite HTTPS y fija las CA raíz del backend; la fecha de vencimiento de los pines está en ese archivo (revisarla antes de que llegue).

## Calidad

CI en GitHub Actions: tipos, pruebas (PGlite y Postgres 16), lint, build y `npm audit`. Antes de cada APK o despliegue: `bash security-tests/run-local.sh`.
