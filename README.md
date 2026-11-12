# Kuota · Crédito y cobros para emprendedores (Perú)

Kuota es una app móvil (Android) y un backend para que **emprendedores** compren a crédito a sus
**proveedores** (aKuotas!) y cobren a sus clientes con **link, QR o código de pago** (Kuota Payments).
Los proveedores reciben pedidos, cobran y ven sus liquidaciones desde su propio panel.

> **Estado:** fase de pruebas. Los pagos funcionan en **modo simulado** (`KUOTA_SANDBOX=1`): no mueven dinero
> real. Antes de operar con dinero hay que cerrar la lista de [docs/DESPLIEGUE.md](docs/DESPLIEGUE.md#antes-de-mover-dinero-real).

APK de pruebas listo para instalar: [`releases/Kuota.apk`](releases/) (también en el release `v0.1.0-pitch`).

---

## Qué hace

| Para | Funciones |
|---|---|
| **Emprendedor** | Registro con DNI/CE, KYC, línea de crédito rotativa de 6 niveles (Brote → Cosecha), compra a crédito en 3 cuotas, calendario de pagos, Score Kuota, ventas (venta rápida y abonos de Yape/Plin detectados en el teléfono), mi cuenta con foto de perfil. |
| **Cobrar y pagar** | Buscador por nombre o celular que avisa si el contacto ya tiene cuenta Kuota, lector de QR que muestra comercio y monto antes de pagar, link/QR/código 360pay con envío por WhatsApp. Comisión **1 % + IGV**, mínima **S/ 4.50 + IGV**, cobro mínimo **S/ 10**. Planes **Basic** (S/ 80 + IGV, hasta S/ 5,000 por cobro) y **Pro** (S/ 120 + IGV). |
| **Proveedor** | Registro con RUC (SUNAT), representante legal, cuenta de abono (CCI), panel con ahorro frente a un POS, ventas y conciliación, clientes, depósitos y liquidaciones. Puede tener también perfil de Emprendedor con **una sola cuenta y un solo PIN**. |
| **Seguridad** | PIN de 6 dígitos verificado en el servidor, sesión única por cuenta, token de identidad por dispositivo, tokens en el Android Keystore, bloqueo de la app, **huella registrada** (se puede usar donde se pide el PIN), capturas bloqueadas en pantallas sensibles, certificados fijados (pinning), bitácora inmutable. |

La explicación completa está en [docs/ARQUITECTURA.md](docs/ARQUITECTURA.md).

---

## Mapa del repositorio

```
backend/          API REST (Express 5 + TypeScript), migraciones SQL, pruebas
frontend/         App React + Vite + Capacitor (web y Android), plugins nativos en Kotlin
security-tests/   Batería de ataques al backend y auditoría del APK
releases/         APK de pruebas firmado y su SHA-256
docs/             Arquitectura, despliegue, seguridad, cumplimiento regulatorio, diseño
scrapers/         Submódulo opcional (consulta de RUC)
.github/          CI, plantillas de issues y PR, Dependabot
```

---

## Empezar

Requisitos: **Node 22 o superior** (el CI usa 24). Para el APK: JDK 21 y el Android SDK.

```bash
git clone --recurse-submodules https://github.com/Kuota-inc/kuota-app.git
cd kuota-app
npm run install:all          # instala backend y frontend
```

**Backend** (http://localhost:3001/api/v1). Sin configurar nada usa Postgres embebido (PGlite), crea y migra
la base, genera secretos de desarrollo y siembra una cuenta demo:

```bash
npm run dev:backend
```

**Frontend** (http://localhost:5173). En un celular, o con `?device=1`, se ve a pantalla completa:

```bash
npm run dev:frontend
```

**Cuenta demo** (solo fuera de producción): el PIN es `DEMO_MERCHANT_PIN` en `backend/src/security/schema.ts`
(se cambia con `KUOTA_DEMO_PIN`). Los secretos de desarrollo quedan en `backend/.dev-secrets.json` (no se versiona).

### Pruebas y calidad

```bash
npm run check                # tipos + pruebas del backend + tipos y lint del frontend
npm --prefix backend test    # solo las pruebas del backend
```

Con `DATABASE_URL` apuntando a un Postgres, las pruebas corren contra ese servidor en bases temporales.
El CI ([.github/workflows/ci.yml](.github/workflows/ci.yml)) corre lo mismo en PGlite y en Postgres 16, más
`npm audit` de producción.

### Seguridad antes de cada APK o despliegue

```bash
bash security-tests/run-local.sh      # requiere Docker; ataques al backend en modo producción + auditoría del APK
```

Detalle y hallazgos aceptados en [security-tests/README.md](security-tests/README.md).

### Generar el APK

```bash
cd frontend
npm run apk:release     # firmado; necesita frontend/android/keystore.properties (ver el .example)
npm run apk             # depuración, solo para desarrollo
```

El APK necesita saber a qué backend hablar: crea `frontend/.env.android` (no se versiona; hay un ejemplo en
`frontend/.env.example`) con `VITE_API_BASE=https://<tu-backend>/api/v1`. Para probar contra tu PC en la misma
Wi-Fi usa `VITE_API_BASE=http://<ip-de-tu-pc>:3001/api/v1` y compila con `KUOTA_DEV_LAN=1` (**nunca entregues ese APK**).
Cómo firmar y publicar: [docs/DESPLIEGUE.md](docs/DESPLIEGUE.md#apk-de-android).

---

## Convenciones

- **Dinero:** siempre en céntimos enteros (`amount_cents`), moneda PEN. Fechas en ISO 8601 UTC, mostradas en `America/Lima`.
- **Nada inventado:** las pantallas no muestran cifras, promociones ni identidades de ejemplo; si el servidor no responde, muestran un error con reintento.
- **Mensajes en español** y respuestas de error con el formato `{ error: { code, message } }`.
- **Finales de línea LF** (ver `.gitattributes`).
- **Secretos:** nunca en el repositorio. Ejemplos de variables en `backend/.env.example` y `frontend/.env.example`.

## Documentación

Índice completo en [docs/README.md](docs/README.md). Para contribuir: [CONTRIBUTING.md](CONTRIBUTING.md). Para reportar una
vulnerabilidad: [SECURITY.md](SECURITY.md). Historial de cambios: [CHANGELOG.md](CHANGELOG.md).

## Licencia

Pendiente de definir por Kuota. Hasta entonces, todos los derechos reservados salvo lo que indique cada dependencia
(`scrapers/scrap-sunat` es MIT).
