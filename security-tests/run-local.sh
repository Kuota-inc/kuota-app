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
MOCK_PORT=3360
PG_PORT=55432
PG=kuota-pentest-pg
OUT="$ROOT/security-tests/reports"
mkdir -p "$OUT"
STAMP=$(date +%Y%m%d-%H%M%S)

# Mata lo que escuche en un puerto (npx/tsx lanzan procesos hijos: matar el subshell no basta).
kill_port() {
  if command -v powershell.exe >/dev/null 2>&1; then
    powershell.exe -NoProfile -Command "Get-NetTCPConnection -LocalPort $1 -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id \$_.OwningProcess -Force -ErrorAction SilentlyContinue }" >/dev/null 2>&1 || true
  elif command -v lsof >/dev/null 2>&1; then
    lsof -ti tcp:"$1" -sTCP:LISTEN | xargs -r kill -9 2>/dev/null || true
  fi
}
port_open() { (echo >"/dev/tcp/127.0.0.1/$1") >/dev/null 2>&1; }

cleanup() {
  kill_port "$PORT"
  kill_port "$MOCK_PORT"
  docker rm -f "$PG" >/dev/null 2>&1 || true
}
trap cleanup EXIT

# Un servidor huérfano de una corrida anterior respondería en lugar del nuevo y falsearía los resultados.
kill_port "$PORT"
kill_port "$MOCK_PORT"
sleep 1
if port_open "$PORT"; then
  echo "El puerto $PORT sigue ocupado. Ciérralo y vuelve a intentar."
  exit 2
fi

echo "› Postgres desechable"
docker rm -f "$PG" >/dev/null 2>&1 || true
docker run -d --name "$PG" -e POSTGRES_PASSWORD=pentest -e POSTGRES_DB=kuota -p "$PG_PORT:5432" postgres:16-alpine >/dev/null
# Por TCP dentro del contenedor (el arranque inicial usa un servidor temporal solo por socket) y desde el host.
for _ in $(seq 1 60); do docker exec "$PG" pg_isready -h 127.0.0.1 -U postgres >/dev/null 2>&1 && port_open "$PG_PORT" && break; sleep 1; done
sleep 2

secret() { node -e "console.log(require('crypto').randomBytes(36).toString('base64url'))"; }

echo "› Simulador de 360pay"
(cd "$ROOT/backend" && npm run --silent pay360:mock >"$OUT/mock-$STAMP.log" 2>&1) &

ADMIN_TOKEN=$(secret)
echo "› Backend en modo producción (puerto $PORT)"
(
  cd "$ROOT/backend"
  NODE_ENV=production PORT=$PORT DATABASE_URL="postgres://postgres:pentest@127.0.0.1:$PG_PORT/kuota" \
  KUOTA_SANDBOX=1 KUOTA_360PAY_API_KEY=sandbox-local KUOTA_360PAY_BASE_URL=http://localhost:$MOCK_PORT/v1 \
  KUOTA_LINK_SIGNING_KEY=$(secret) KUOTA_WEBHOOK_SECRET=$(secret) KUOTA_SESSION_SECRET=$(secret) \
  KUOTA_PIN_PEPPER=$(secret) KUOTA_ADMIN_TOKEN=$ADMIN_TOKEN \
  DIDIT_API_KEY= RESEND_API_KEY= KUOTA_SMTP_URL= \
  npx tsx src/server.ts >"$OUT/server-$STAMP.log" 2>&1
) &
for _ in $(seq 1 90); do
  grep -q "running on" "$OUT/server-$STAMP.log" 2>/dev/null && break
  grep -qE "ECONNREFUSED|Error:" "$OUT/server-$STAMP.log" 2>/dev/null && break
  sleep 1
done
if ! grep -q "running on" "$OUT/server-$STAMP.log"; then
  echo "El backend de pruebas no arrancó (ver $OUT/server-$STAMP.log). Prueba inválida."
  exit 2
fi

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
