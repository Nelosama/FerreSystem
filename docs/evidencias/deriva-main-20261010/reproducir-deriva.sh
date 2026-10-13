#!/bin/bash
cd "$(cd "$(dirname "$0")/../../../backend" && pwd)"
D=$(mktemp -d /tmp/ferre-dr-XXXX); PORT=$(python3 -c 'import socket;s=socket.socket();s.bind(("127.0.0.1",0));print(s.getsockname()[1]);s.close()')
B=/usr/lib/postgresql/16/bin; $B/initdb -D $D/data -U postgres -A trust --locale=C -E UTF8 --no-sync >/dev/null
$B/pg_ctl -D $D/data -l $D/pg.log -o "-h 127.0.0.1 -p $PORT -k $D" -w start >/dev/null
for m in $(ls prisma/migrations | sort); do [ -f prisma/migrations/$m/migration.sql ] || continue
  $B/psql -X -q -h 127.0.0.1 -p $PORT -U postgres -d postgres -v ON_ERROR_STOP=1 -f prisma/migrations/$m/migration.sql >/dev/null 2>&1 || echo "FALLA $m"; done
npx prisma migrate diff --from-url "postgresql://postgres@127.0.0.1:$PORT/postgres" --to-schema-datamodel prisma/schema.prisma --script > /tmp/ferre-deriva.sql 2>/dev/null
$B/pg_ctl -D $D/data -m immediate -w stop >/dev/null; rm -rf $D
wc -l /tmp/ferre-deriva.sql
