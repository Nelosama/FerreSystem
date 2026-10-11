#!/usr/bin/env bash
# Simulacro de recuperación AISLADO (nunca toca producción: crea dos clústeres PostgreSQL temporales y los elimina).
# Migrar (comando de producción) -> operar -> reiniciar backend -> pg_dump -> restaurar en base vacía -> arrancar sobre la restaurada.
# Requiere ejecutarse como root (usa runuser -u nobody para PostgreSQL), PostgreSQL 16 instalado y el backend compilable. Uso: bash backend/scripts/simulacro-recuperacion.sh
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"; PG_BIN="${PG_BIN:-/usr/lib/postgresql/16/bin}"
WORK=$(mktemp -d /tmp/ferre-simulacro-XXXXXX); chmod 777 $WORK
PA=55601; PB=55602; API_A=3301; API_B=3302
export JWT_SECRET="$(head -c 32 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | head -c 48)"
export CONTINGENCIA_CLAVE_OPERACIONES="$(head -c 48 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | head -c 48)"
export E2E_PASSWORD="E2E-$(head -c 18 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | head -c 20)"
export POS_OFFLINE_ENABLED=true FRONTEND_URL=http://127.0.0.1:4173
PIDS=""
limpiar(){ for p in $PIDS; do kill $p 2>/dev/null; done; for d in a b; do runuser -u nobody -- $PG_BIN/pg_ctl -D $WORK/$d -m immediate stop >/dev/null 2>&1; done; rm -rf $WORK; }
trap limpiar EXIT
arrancar_pg(){ runuser -u nobody -- $PG_BIN/initdb -D $WORK/$1 -U postgres -A trust --locale=C -E UTF8 --no-sync >/dev/null && runuser -u nobody -- $PG_BIN/pg_ctl -D $WORK/$1 -l $WORK/$1.log -o "-h 127.0.0.1 -p $2 -k $WORK" -w start >/dev/null; }
esperar_api(){ for _ in $(seq 1 60); do [[ "$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:$1/api/auth/me)" == 401 ]] && return 0; sleep 1; done; return 1; }
paso(){ echo "[$1] $2"; }
psqlq(){ $PG_BIN/psql -X -At -h 127.0.0.1 -p $1 -U postgres -d postgres -c "$2"; }
RES=""; ok(){ RES="$RES\n$1 | PASS | $2"; echo "PASS: $1 - $2"; }; ko(){ RES="$RES\n$1 | FAIL | $2"; echo "FAIL: $1 - $2"; }
cd $ROOT/backend && npm run build >/dev/null 2>&1

paso 1 "PostgreSQL A + migración con el comando de producción (migration-safe deploy)"
arrancar_pg a $PA
export DATABASE_URL="postgresql://postgres@127.0.0.1:$PA/postgres"; export DIRECT_URL=$DATABASE_URL
if node scripts/migration-safe.mjs deploy > $WORK/mig.log 2>&1; then ok "Migración desde base vacía (migration-safe deploy)" "$(psqlq $PA "SELECT COUNT(*) FROM _prisma_migrations WHERE finished_at IS NOT NULL") migraciones aplicadas, 0 pendientes"; else ko "Migración desde base vacía" "$(tail -3 $WORK/mig.log)"; fi
if node scripts/migration-safe.mjs deploy > $WORK/mig2.log 2>&1; then ok "Segunda ejecución de la migración (reinicio): idempotente" "sin cambios"; else ko "Segunda ejecución de migración" "$(tail -3 $WORK/mig2.log)"; fi

paso 2 "Datos de prueba y backend A"
(cd $ROOT/frontend/e2e-real && node seed.cjs > $WORK/seed.json)
PORT=$API_A node dist/main.js > $WORK/api-a.log 2>&1 & PIDS="$PIDS $!"; API_A_PID=$!
esperar_api $API_A && ok "Backend arranca con la clave de contingencia y la base migrada" "puerto $API_A" || ko "Backend arranca" "$(tail -3 $WORK/api-a.log)"

cat > $WORK/operar.mjs <<'EON'
const [api, fase] = process.argv.slice(2); const PW = process.env.E2E_PASSWORD;
const j = async (m, r, t, d, h = {}) => { const res = await fetch(api + r, { method: m, headers: { 'content-type': 'application/json', ...(t ? { authorization: 'Bearer ' + t } : {}), ...h }, body: d ? JSON.stringify(d) : undefined }); const tx = await res.text(); return { s: res.status, b: tx ? JSON.parse(tx) : null, c: res.headers.get('set-cookie') }; };
const out = {};
const adm = await j('POST', '/auth/login', null, { email: 'admin.a@e2e.invalid', password: PW }); out.loginAdmin = adm.s;
if (fase === 'operar') {
  const rid = () => crypto.randomUUID();
  const caj = await j('POST', '/auth/login', null, { email: 'cajero.a@e2e.invalid', password: PW }); out.loginCajero = caj.s;
  // El cajero de la semilla necesita permiso de venta: lo da el administrador por API de usuarios si existe; si no, la venta la hace el administrador.
  const cajaAdm = await j('POST', '/operaciones/caja/abrir', adm.b.accessToken, { solicitudId: rid(), monto: 500 }); out.cajaAbrir = cajaAdm.s;
  const prod = await j('POST', '/productos', adm.b.accessToken, { codigo: 'SIM-' + rid().slice(0, 6), nombre: 'Producto simulacro', precioVenta: 100, precioCosto: 60, stockActual: 20, stockMinimo: 1 }); out.productoCrear = prod.s;
  const venta = await j('POST', '/ventas', adm.b.accessToken, { solicitudId: rid(), metodoPago: 'EFECTIVO', detalles: [{ productoId: prod.b.id, cantidad: 3, precioUnitario: 100 }] }); out.venta = venta.s; out.ventaTotal = venta.b?.total;
  const ent = await j('POST', `/operaciones/ventas/${venta.b.id}/entregar`, adm.b.accessToken, { solicitudId: rid(), receptorNombre: 'Cliente simulacro' }); out.entrega = ent.s;
  out.ventaId = venta.b.id; out.productoId = prod.b.id; out.cookie = !!adm.c;
}
console.log(JSON.stringify(out));
EON
O1=$(node $WORK/operar.mjs http://127.0.0.1:$API_A/api operar); echo "operar: $O1"
VENTA=$(echo "$O1" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).ventaId))'); PROD=$(echo "$O1" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).productoId))')
[[ -n "$VENTA" && "$VENTA" != undefined ]] && ok "Operación: caja, producto, venta de contado y entrega" "venta $VENTA, total $(echo $O1 | grep -o 'ventaTotal":[0-9.]*')" || ko "Operación de negocio" "$O1"
stock_a=$(psqlq $PA "SELECT stock_actual::float||'/'||stock_reservado::float FROM productos WHERE id='$PROD'")
[[ "$stock_a" == "17/0" ]] && ok "Inventario tras venta+entrega" "stock físico 17, reservado 0" || ko "Inventario tras venta+entrega" "stock=$stock_a (esperado 17/0)"
snap(){ psqlq $1 "SELECT (SELECT COUNT(*) FROM ventas)||'|'||(SELECT COALESCE(SUM(total),0)::float FROM ventas)||'|'||(SELECT COUNT(*) FROM movimientos_caja)||'|'||(SELECT COALESCE(SUM(stock_actual),0)::float FROM productos)||'|'||(SELECT COUNT(*) FROM auditoria_operaciones)||'|'||(SELECT COUNT(*) FROM usuarios)"; }
S_A=$(snap $PA); echo "foto A (ventas|total|mov_caja|stock|auditoria|usuarios): $S_A"

paso 3 "Reinicio del backend A (misma base y mismas claves)"
kill $API_A_PID; sleep 1
PORT=$API_A node dist/main.js > $WORK/api-a2.log 2>&1 & PIDS="$PIDS $!"
esperar_api $API_A && ok "Backend vuelve a arrancar tras reiniciar" "sin intervención" || ko "Reinicio del backend" "$(tail -3 $WORK/api-a2.log)"
O2=$(node $WORK/operar.mjs http://127.0.0.1:$API_A/api verificar); echo "$O2" | grep -q '"loginAdmin":200' && ok "Inicio de sesión tras reiniciar" "administrador 200" || ko "Inicio de sesión tras reiniciar" "$O2"
[[ "$(snap $PA)" == "$S_A" ]] && ok "Datos intactos tras reiniciar" "ventas, caja, stock y auditoría idénticos" || ko "Datos tras reiniciar" "$(snap $PA)"

paso 4 "Respaldo (pg_dump -Fc), restauración en base vacía B y arranque sobre B"
$PG_BIN/pg_dump -h 127.0.0.1 -p $PA -U postgres -d postgres -Fc -f $WORK/respaldo.dump && ok "Respaldo con pg_dump" "$(stat -c %s $WORK/respaldo.dump) bytes" || ko "Respaldo" "pg_dump falló"
$PG_BIN/pg_restore --list $WORK/respaldo.dump > /dev/null && ok "pg_restore --list lee el respaldo" "legible"
arrancar_pg b $PB
if $PG_BIN/pg_restore -h 127.0.0.1 -p $PB -U postgres -d postgres --no-owner --exit-on-error $WORK/respaldo.dump > $WORK/restore.log 2>&1; then ok "Restauración en base vacía" "sin errores"; else ko "Restauración" "$(tail -3 $WORK/restore.log)"; fi
S_B=$(snap $PB); echo "foto B: $S_B"
[[ "$S_B" == "$S_A" ]] && ok "Datos restaurados idénticos al origen" "$S_B" || ko "Datos restaurados" "A=$S_A B=$S_B"
export DATABASE_URL="postgresql://postgres@127.0.0.1:$PB/postgres"; export DIRECT_URL=$DATABASE_URL
node scripts/migration-safe.mjs deploy > $WORK/mig3.log 2>&1 && ok "migration-safe deploy sobre la base restaurada" "historial consistente, sin migraciones pendientes" || ko "migration-safe sobre la restaurada" "$(tail -3 $WORK/mig3.log)"
PORT=$API_B node dist/main.js > $WORK/api-b.log 2>&1 & PIDS="$PIDS $!"
esperar_api $API_B && O3=$(node $WORK/operar.mjs http://127.0.0.1:$API_B/api verificar) && echo "$O3" | grep -q '"loginAdmin":200' && ok "Backend sobre la base restaurada: inicio de sesión" "administrador 200" || ko "Backend sobre la restaurada" "$(tail -3 $WORK/api-b.log)"
echo; echo "===== RESUMEN ====="; echo -e "$RES"
