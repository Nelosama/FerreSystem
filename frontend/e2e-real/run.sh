#!/usr/bin/env bash
# E2E REAL: backend NestJS compilado + PostgreSQL 16 temporal aislado + frontend real. Sin mocks.
# Nunca lee DATABASE_URL del entorno ni apunta a producción: crea su propio clúster efímero.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
PG_BIN="${PG_BIN:-/usr/lib/postgresql/16/bin}"
PG_PORT="${E2E_PG_PORT:-55433}"
API_PORT="${E2E_API_PORT:-3100}"
WEB_PORT="${E2E_WEB_PORT:-4173}"
WORK="$(mktemp -d /tmp/ferre-e2e-real-XXXXXX)"
chmod 755 "$WORK"
export DATABASE_URL="postgresql://postgres@127.0.0.1:${PG_PORT}/postgres"
export DIRECT_URL="$DATABASE_URL"
export E2E_PASSWORD="E2E-$(head -c 18 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | head -c 20)"
export JWT_SECRET="$(head -c 32 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | head -c 48)"
export FRONTEND_URL="http://127.0.0.1:${WEB_PORT}"
export PORT="$API_PORT"
export E2E_API_URL="http://127.0.0.1:${API_PORT}/api"
export E2E_DIST="$WORK/dist"
export E2E_API_TARGET="http://127.0.0.1:${API_PORT}"
export PG_BIN
export POS_OFFLINE_ENABLED=true
export E2E_PG_PORT="$PG_PORT"
API_PID=""
cleanup() {
  [[ -n "$API_PID" ]] && kill "$API_PID" 2>/dev/null || true
  runuser -u nobody -- "$PG_BIN/pg_ctl" -D "$WORK/data" -m immediate stop >/dev/null 2>&1 || true
  rm -rf "$WORK"
}
trap cleanup EXIT

echo "== 1. PostgreSQL temporal (usuario nobody, puerto $PG_PORT)"
mkdir -p "$WORK"
chmod 777 "$WORK"
runuser -u nobody -- "$PG_BIN/initdb" -D "$WORK/data" -U postgres -A trust --locale=C -E UTF8 --no-sync >/dev/null
runuser -u nobody -- "$PG_BIN/pg_ctl" -D "$WORK/data" -l "$WORK/pg.log" -o "-h 127.0.0.1 -p $PG_PORT -k $WORK" -w start >/dev/null

echo "== 2. Migraciones con Prisma (migrate deploy, la ruta de producción)"
(cd "$ROOT/backend" && npx prisma migrate deploy >"$WORK/migrate.log" 2>&1) || { cat "$WORK/migrate.log"; exit 1; }
grep -E "migrations? (have|applied)|All migrations" "$WORK/migrate.log" | head -2 || true

echo "== 3. Deriva de esquema: solo la tabla nueva"
(cd "$ROOT/backend" && npx prisma migrate diff --from-url "$DATABASE_URL" --to-schema-datamodel prisma/schema.prisma --script >"$WORK/drift.sql" 2>/dev/null) || true
if grep -q "coberturas_garantia" "$WORK/drift.sql"; then echo "DERIVA en coberturas_garantia:"; grep "coberturas_garantia" "$WORK/drift.sql" | head -5; exit 1; fi
echo "sin deriva en coberturas_garantia"

echo "== 4. Datos de prueba"
(cd "$ROOT/frontend/e2e-real" && node seed.cjs > "$WORK/seed.json")
cat "$WORK/seed.json" | head -c 400; echo

echo "== 5. Backend NestJS compilado (dist/main)"
if python3 -c "import socket,sys; s=socket.socket(); s.settimeout(1); sys.exit(0 if s.connect_ex(('127.0.0.1', $API_PORT))==0 else 1)"; then
  echo "El puerto $API_PORT ya está ocupado: no se puede verificar la API de esta ejecución"; exit 1
fi
(cd "$ROOT/backend" && npm run build >"$WORK/api-build.log" 2>&1) || { tail -30 "$WORK/api-build.log"; exit 1; }
(cd "$ROOT/backend" && exec node dist/main.js >"$WORK/api.log" 2>&1) &
API_PID=$!
for _ in $(seq 1 60); do
  code="$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:${API_PORT}/api/auth/me" || true)"
  [[ "$code" == "401" ]] && break
  sleep 1
done
[[ "$code" == "401" ]] || { echo "API no levantó"; tail -40 "$WORK/api.log"; exit 1; }
echo "API arriba en $E2E_API_URL"

echo "== 6. Frontend real (build con /api; la vista previa reenvía a $E2E_API_TARGET)"
(cd "$ROOT/frontend" && VITE_API_URL=/api npx vite build --outDir "$E2E_DIST" --emptyOutDir >"$WORK/web-build.log" 2>&1) || { tail -20 "$WORK/web-build.log"; exit 1; }

echo "== 7. Playwright contra backend real"
cd "$ROOT/frontend"
npx playwright test -c playwright.real.config.ts "$@"
