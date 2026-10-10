#!/bin/bash
cd /home/user/FerreSystem/backend
D=$(mktemp -d /tmp/ferre-fk-XXXX); PORT=$(python3 -c 'import socket;s=socket.socket();s.bind(("127.0.0.1",0));print(s.getsockname()[1]);s.close()')
B=/usr/lib/postgresql/16/bin; $B/initdb -D $D/data -U postgres -A trust --locale=C -E UTF8 --no-sync >/dev/null
$B/pg_ctl -D $D/data -l $D/pg.log -o "-h 127.0.0.1 -p $PORT -k $D" -w start >/dev/null
for m in $(ls prisma/migrations | sort); do [ -f prisma/migrations/$m/migration.sql ] || continue
  $B/psql -X -q -h 127.0.0.1 -p $PORT -U postgres -d postgres -v ON_ERROR_STOP=1 -f prisma/migrations/$m/migration.sql >/dev/null 2>&1; done
$B/psql -X -h 127.0.0.1 -p $PORT -U postgres -d postgres -At -c "SELECT conrelid::regclass||' '||conname||' -> '||confrelid::regclass||' ON DELETE '||confdeltype::text FROM pg_constraint WHERE contype='f' AND conrelid::regclass::text IN ('costos_compra','devoluciones','detalles_devolucion','movimientos_inventario','cuentas_operativas','pagos_cuenta','recepciones_compra','ventas','clientes') ORDER BY 1"
$B/pg_ctl -D $D/data -m immediate -w stop >/dev/null; rm -rf $D
