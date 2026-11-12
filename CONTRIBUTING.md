# Cómo trabajar en este repositorio

## Preparar el entorno

```bash
git clone --recurse-submodules https://github.com/Kuota-inc/kuota-app.git
cd kuota-app
npm run install:all
npm run dev:backend      # http://localhost:3001/api/v1 (Postgres embebido, cuenta demo)
npm run dev:frontend     # http://localhost:5173
```

Node 22 o superior. Detalle en el [README](README.md).

## Antes de abrir un PR (o de hacer push a `main`)

```bash
npm run check            # tipos + pruebas del backend + tipos y lint del frontend
```

- Todo cambio de lógica lleva su prueba (`backend/test/*.test.ts`). Los cambios de seguridad o de dinero, además, un ataque
  en `security-tests/pentest.mjs` cuando tenga sentido.
- **Antes de cada APK o despliegue:** `bash security-tests/run-local.sh`. Solo debe fallar lo ya aceptado (`SBX-01`).
- El CI debe quedar en verde (tipos, pruebas en PGlite y Postgres 16, lint, build, `npm audit`).

## Ramas y commits

- `main` es la rama estable y lo que se despliega. Para cambios grandes, una rama corta y un PR.
- Mensajes de commit en español, formato `tipo(ámbito): qué cambia y por qué`:
  `feat`, `fix`, `security`, `docs`, `build`, `chore`, `test`, `refactor`.
  Ejemplo: `fix(auth): el cambio de perfil ya no cierra la sesión por un token de Proveedor viejo`.
- Una idea por commit. El cuerpo explica el motivo, no repite el diff.

## Reglas del proyecto

1. **Dinero en céntimos enteros** (`amount_cents`), PEN. Nunca decimales ni `float`.
2. **Nada inventado en pantalla:** ninguna cifra, nombre, promoción o identidad de ejemplo. Si no hay dato real: estado de carga, error con reintento o vacío honesto.
3. **El servidor manda:** el cliente nunca decide permisos, montos ni estados. Toda entrada se valida en el backend.
4. **Datos personales:** no registrar celulares, DNI ni PIN en logs; enmascarar al responder (`+51 ••• ••• 123`).
5. **Sin secretos en git:** `.env`, `.dev-secrets.json`, `keystore.properties`, `*.jks`, `google-services.json` están ignorados. Si dudas, no lo subas.
6. **`docs/gtm/` es interno** y está ignorado: el repositorio es público.
7. **Textos de la app en español**, con “Proveedor” (no “Provider”). El código y los identificadores internos (`PROVIDER`, `/providers/…`) no se renombran.
8. **Finales de línea LF** (lo fija `.gitattributes`; los `.bat` usan CRLF).
9. **Migraciones:** archivo nuevo `NNNN_descripcion.sql` en `backend/migrations/`, nunca editar una ya aplicada. Actualizar la lista en `backend/test/platform.test.ts`.

## Estructura del código

Mapa en [docs/ARQUITECTURA.md](docs/ARQUITECTURA.md). Despliegue y APK en [docs/DESPLIEGUE.md](docs/DESPLIEGUE.md).

## Vulnerabilidades

No las reportes en un issue público: [SECURITY.md](SECURITY.md).
