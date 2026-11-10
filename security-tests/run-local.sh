#!/usr/bin/env bash
# Kuota — corre la batería completa de ataques contra un backend LOCAL en modo producción.
# Base de datos limpia en Docker (Postgres 16), simulador de 360pay y secretos aleatorios de un solo uso.
#
#   bash security-tests/run-local.sh            # batería completa + análisis del APK
#   bash security-tests/run-local.sh --no-apk   # sin APK
#
# Requisitos: Docker Desktop en marcha y Node 20+. No toca producción ni servicios externos.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PORT=3901
PG=kuota-pentest-pg
OUT="$ROOT/security-tests/reports"
mkdir -p "$OUT"
STAMP=$(date +%Y%m%d-%H%M%S)

cleanup() {
  [ -n "${SRV:-}" ] && kill "$SRV" 2>/dev/null || true
  [ -n "${MOCK:-}" ] && kill "$MOCK" 2>/dev/null || true
  docker rm -f "$PG" >/dev/null 2>&1 || true
}
trap cleanup EXIT

echo "› Postgres desechable"
docker rm -f "$PG" >/dev/null 2>&1 || true
docker run -d --name "$PG" -e POSTGRES_PASSWORD=pentest -e POSTGRES_DB=kuota -p 55432:5432 postgres:16-alpine >/dev/null
for _ in $(seq 1 40); do docker exec "$PG" pg_isready -U postgres >/dev/null 2>&1 && break; sleep 1; done
sleep 2

secret() { node -e "console.log(require('crypto').randomBytes(36).toString('base64url'))"; }

echo "› Simulador de 360pay"
(cd "$ROOT/backend" && npm run --silent pay360:mock >"$OUT/mock-$STAMP.log" 2>&1) &
MOCK=$!

ADMIN_TOKEN=$(secret)
echo "› Backend en modo producción (puerto $PORT)"
(
  cd "$ROOT/backend"
  NODE_ENV=production PORT=$PORT DATABASE_URL="postgres://postgres:pentest@127.0.0.1:55432/kuota" \
  KUOTA_SANDBOX=1 KUOTA_360PAY_API_KEY=sandbox-local KUOTA_360PAY_BASE_URL=http://localhost:3360/v1 \
  KUOTA_LINK_SIGNING_KEY=$(secret) KUOTA_WEBHOOK_SECRET=$(secret) KUOTA_SESSION_SECRET=$(secret) \
  KUOTA_PIN_PEPPER=$(secret) KUOTA_ADMIN_TOKEN=$ADMIN_TOKEN \
  DIDIT_API_KEY= RESEND_API_KEY= KUOTA_SMTP_URL= \
  npx tsx src/server.ts >"$OUT/server-$STAMP.log" 2>&1
) &
SRV=$!
for _ in $(seq 1 60); do curl -sf "http://localhost:$PORT/api/v1/health" >/dev/null && break; sleep 1; done

echo "› Ataques"
set +e
PENTEST_BASE="http://localhost:$PORT" PENTEST_ADMIN_TOKEN="$ADMIN_TOKEN" PENTEST_JSON="$OUT/backend-$STAMP.json" node "$ROOT/security-tests/pentest.mjs" | tee "$OUT/backend-$STAMP.txt"
CODE=${PIPESTATUS[0]}

if [ "${1:-}" != "--no-apk" ]; then
  echo "› APK"
  node "$ROOT/security-tests/apk-audit.mjs" | tee "$OUT/apk-$STAMP.txt"
  [ "${PIPESTATUS[0]}" -ne 0 ] && CODE=1
fi
set -e
echo "Informes en $OUT"
exit "$CODE"
