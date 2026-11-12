# Política de seguridad

Kuota maneja identidades, PIN y (cuando se active) dinero. Si encuentras una vulnerabilidad, queremos saberlo.

## Cómo reportar

- Usa **GitHub → pestaña Security → “Report a vulnerability”** de este repositorio (reporte privado).
- **No abras un issue público** con detalles de la falla, ni publiques datos de personas.
- Si esa opción no aparece, abre un issue **sin detalles técnicos** pidiendo un contacto privado; te responderemos por otro canal.
- Incluye: qué viste, cómo reproducirlo, qué impacto tiene y, si puedes, una prueba mínima. No necesitas arreglarla.

Responderemos lo antes posible y te avisaremos cuando esté corregida.

## Qué está dentro del alcance

- El backend (`backend/`) y su despliegue de pruebas.
- La app Android (`frontend/`, `releases/Kuota.apk`).
- Las páginas públicas servidas por el backend (`/pay/:código`, páginas legales).

## Reglas para probar

- Usa **cuentas tuyas** o la cuenta demo en un entorno local. No accedas a datos de otras personas.
- **No** hagas pruebas destructivas, de fuerza bruta ni de denegación de servicio contra producción. El script
  `security-tests/pentest.mjs --safe` hace solo pruebas no destructivas; la batería completa corre solo en local
  (`bash security-tests/run-local.sh`).
- Hoy el backend de pruebas está en **modo simulado** (no mueve dinero real): el simulador de pagos encendido es un hallazgo conocido (`SBX-01`).

## Qué hacemos nosotros

- Antes de cada APK y de cada despliegue corre una batería de ataques y una auditoría del APK ([security-tests/](security-tests/README.md)).
- El CI revisa dependencias de producción con `npm audit`.
- Los secretos nunca se versionan; los de desarrollo se generan localmente y están en `.gitignore`.
- El detalle de controles está en [docs/SEGURIDAD.md](docs/SEGURIDAD.md) y [docs/SEGURIDAD-PAYMENTS.md](docs/SEGURIDAD-PAYMENTS.md).

## Si encuentras un secreto en el repositorio

Avísanos por el mismo canal privado. No lo uses ni lo copies. Lo rotaremos y lo quitaremos del historial si hace falta.
