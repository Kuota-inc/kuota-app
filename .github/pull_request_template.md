## Qué cambia y por qué

<!-- Una o dos frases. El “por qué” importa más que el “qué”. -->

## Cómo se probó

- [ ] `npm run check` en verde
- [ ] Pruebas nuevas o actualizadas (`backend/test/`)
- [ ] Probé la pantalla o el flujo a mano (web o APK)
- [ ] Si toca seguridad, dinero o el APK: `bash security-tests/run-local.sh` (solo falla lo aceptado, `SBX-01`)

## Revisión rápida

- [ ] Sin secretos, `.env`, claves ni `docs/gtm/` en el diff
- [ ] Sin cifras, nombres o promociones de ejemplo en pantalla
- [ ] Montos en céntimos; datos personales enmascarados y fuera de los logs
- [ ] Migración nueva registrada en `backend/test/platform.test.ts` (si aplica)
- [ ] Documentación actualizada (README, `docs/`, `CHANGELOG.md`) si cambia el comportamiento
