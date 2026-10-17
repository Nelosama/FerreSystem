#!/bin/bash
# Clúster PostgreSQL temporal + migraciones del repositorio (usuario sin privilegios: initdb no corre como root).
# Uso: pg.sh <directorio-temporal> <puerto>   ·   PG_BIN=/usr/lib/postgresql/16/bin por defecto.
set -e
D=$1; PORT=$2; B=${PG_BIN:-/usr/lib/postgresql/16/bin}
REPO=${REPO:-$(cd "$(dirname "$0")/../../.." && pwd)}
rm -rf "$D"; mkdir -p "$D"
"$B/initdb" -D "$D/data" -U postgres -A trust --locale=C -E UTF8 --no-sync >/dev/null
"$B/pg_ctl" -D "$D/data" -l "$D/pg.log" -o "-h 127.0.0.1 -p $PORT -k $D" -w start >/dev/null
for m in $(ls "$REPO/backend/prisma/migrations" | sort); do
  f="$REPO/backend/prisma/migrations/$m/migration.sql"
  [ -f "$f" ] && "$B/psql" -X -q -h 127.0.0.1 -p "$PORT" -U postgres -d postgres -v ON_ERROR_STOP=1 -f "$f" >/dev/null
done
echo listo
