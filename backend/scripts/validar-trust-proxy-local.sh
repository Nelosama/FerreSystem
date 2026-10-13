#!/bin/bash
# CENTINELA — validación local de TRUST_PROXY: API real + PostgreSQL temporal + proxy que añade la IP real.
# Requiere: dist compilado (npm run build), PostgreSQL 16 (PG_BIN=/usr/lib/postgresql/16/bin) y ejecución como root o con runuser.
REPO="$(cd "$(dirname "$0")/.." && pwd)"
W=/tmp/ferre-proxy-run; rm -rf $W; mkdir -p $W; chmod 777 $W
PG=/usr/lib/postgresql/16/bin; PGP=$(python3 -c 'import socket;s=socket.socket();s.bind(("127.0.0.1",0));print(s.getsockname()[1]);s.close()')
API=3310; PROXY=3311; NODE=/opt/node22/bin/node
runuser -u nobody -- $PG/initdb -D $W/data -U postgres -A trust --locale=C -E UTF8 --no-sync >/dev/null
runuser -u nobody -- $PG/pg_ctl -D $W/data -l $W/pg.log -o "-h 127.0.0.1 -p $PGP -k $W" -w start >/dev/null
cd $REPO
for m in $(ls prisma/migrations | sort); do [ -f prisma/migrations/$m/migration.sql ] || continue
  $PG/psql -X -q -h 127.0.0.1 -p $PGP -U postgres -d postgres -v ON_ERROR_STOP=1 -f prisma/migrations/$m/migration.sql >/dev/null 2>&1 || echo "FALLA migración $m"; done
URL=postgresql://postgres@127.0.0.1:$PGP/postgres
APIPID=""; PROXYPID=""
start_api() {
  [ -n "$APIPID" ] && kill $APIPID 2>/dev/null; sleep 1
  if [ -n "$1" ]; then TP="TRUST_PROXY=$1"; else TP=""; fi
  env -u TRUST_PROXY $TP DATABASE_URL=$URL DIRECT_URL=$URL JWT_SECRET=validacion-centinela-secreto-largo-0123456789 PORT=$API NODE_ENV=production AUTH_LOGIN_MAX_FALLOS_IP=3 AUTH_LOGIN_MAX_FALLOS_CUENTA=50 \
    $NODE dist/main.js > $W/api-$1.log 2>&1 &
  APIPID=$!
  for i in $(seq 1 60); do curl -s -o /dev/null http://127.0.0.1:$API/api/auth/me && break; sleep 0.5; done
}
proxy_on() { [ -n "$PROXYPID" ] && kill $PROXYPID 2>/dev/null; sleep 0.5; $NODE scripts/proxy-simulado.mjs --puerto $PROXY --destino http://127.0.0.1:$API > $W/proxy.log 2>&1 & PROXYPID=$!; sleep 1; }
limpiar() { $PG/psql -X -q -h 127.0.0.1 -p $PGP -U postgres -d postgres -c "DELETE FROM intentos_login" >/dev/null; }
probe() { $NODE scripts/verificar-trust-proxy.mjs --api "$1" --limite 3 --modo evasion --local; echo "   exit=$?"; }
login() { curl -s -o /dev/null -w "   status=%{http_code}\n" $1 -X POST "$2" -H 'content-type: application/json' -d '{"email":"otro@invalid.test","password":"sonda-no-es-una-clave"}'; }

echo "### A. Directo (sin proxy), TRUST_PROXY=1  [esperado: EVASION]"
start_api 1; limpiar; probe http://127.0.0.1:$API/api
echo "### B. Con proxy (1 salto), TRUST_PROXY=1  [esperado: CORRECTO]"
start_api 1; limpiar; proxy_on; probe http://127.0.0.1:$PROXY/api
echo "   desde 127.0.0.2 (otra IP) tras el bloqueo de 127.0.0.1  [esperado 401]"; login "--interface 127.0.0.2" http://127.0.0.1:$PROXY/api/auth/login
echo "   desde 127.0.0.1 de nuevo  [esperado 429]"; login "" http://127.0.0.1:$PROXY/api/auth/login
echo "### C. Con proxy (1 salto), TRUST_PROXY=2  [esperado: EVASION]"
start_api 2; limpiar; probe http://127.0.0.1:$PROXY/api
echo "### D. Con proxy (1 salto), TRUST_PROXY sin definir  [esperado: CORRECTO en evasión; cubo compartido]"
start_api ""; limpiar; probe http://127.0.0.1:$PROXY/api
echo "   desde 127.0.0.2 tras el bloqueo  [esperado 429: cubo compartido]"; login "--interface 127.0.0.2" http://127.0.0.1:$PROXY/api/auth/login
kill $APIPID $PROXYPID 2>/dev/null; sleep 1; runuser -u nobody -- $PG/pg_ctl -D $W/data -m immediate -w stop >/dev/null 2>&1
echo FIN
