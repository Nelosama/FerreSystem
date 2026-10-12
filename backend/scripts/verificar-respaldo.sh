#!/usr/bin/env bash
# Verifica un respaldo creado con respaldo-previo-migracion.sh: restaura en un PostgreSQL TEMPORAL y AISLADO (127.0.0.1, puerto libre, se elimina al terminar),
# compara los conteos con el manifiesto y, con --ensayo-migracion, aplica las migraciones pendientes SOLO sobre esa copia y comprueba que no se pierde ninguna fila,
# que la base queda LISTA y que el backend compilado arranca con ella. No usa ni necesita acceso a producción.
# Uso: bash backend/scripts/verificar-respaldo.sh /ruta/privada/respaldo-AAAAMMDD-HHMM [--ensayo-migracion]
# Requisitos: PostgreSQL 16 (initdb, pg_ctl, pg_restore, psql), Node, backend compilado (npm run build) para la prueba de arranque.
# Si se ejecuta como root usa el usuario `nobody` para el clúster temporal (PostgreSQL no arranca como root).
set -uo pipefail
DIR="${1:?Uso: bash $0 DIRECTORIO_DEL_RESPALDO [--ensayo-migracion]}"; ENSAYO="${2:-}"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"; PG_BIN="${PG_BIN:-$(dirname "$(command -v initdb 2>/dev/null || echo /usr/lib/postgresql/16/bin/initdb)")}"
DIR="$(cd "$DIR" && pwd)"
WORK="$(mktemp -d /tmp/ferre-verifica-XXXXXX)"; chmod 777 "$WORK"
if [[ "$(id -u)" == 0 ]]; then AS=(runuser -u nobody --); else AS=(); fi
PORT="$(node -e 'const s=require("net").createServer().listen(0,"127.0.0.1",()=>{console.log(s.address().port);s.close()})')"
URL="postgresql://postgres@127.0.0.1:$PORT/postgres"
API_PID=""; RES=(); FALLOS=0
fin() { [[ -n "$API_PID" ]] && kill "$API_PID" 2>/dev/null; "${AS[@]}" "$PG_BIN/pg_ctl" -D "$WORK/data" -m immediate stop >/dev/null 2>&1; rm -rf "$WORK"; }
trap fin EXIT
ok() { RES+=("PASS  $1"); echo "PASS  $1"; }
ko() { RES+=("FAIL  $1 — $2"); echo "FAIL  $1 — $2"; FALLOS=$((FALLOS+1)); }
conteos() { psql -X -At -h 127.0.0.1 -p "$PORT" -U postgres -d postgres -c "SELECT table_name||'='||(xpath('/row/c/text()', query_to_xml(format('select count(*) as c from public.%I', table_name), false, true, '')))[1]::text FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' ORDER BY 1" | grep '='; }

[[ -f "$DIR/manifest.json" && -f "$DIR/database.dump" ]] || { echo "Faltan manifest.json o database.dump en $DIR" >&2; exit 2; }
ESPERADO="$(node -e 'console.log(JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).sha256)' "$DIR/manifest.json")"
[[ "$(sha256sum "$DIR/database.dump" | cut -d' ' -f1)" == "$ESPERADO" ]] && ok "Integridad: el SHA-256 del respaldo coincide con el manifiesto" || ko "Integridad del respaldo" "el SHA-256 no coincide"
pg_restore --list "$DIR/database.dump" >/dev/null 2>&1 && ok "El respaldo es legible (pg_restore --list)" || ko "Legibilidad" "pg_restore --list falló"

"${AS[@]}" "$PG_BIN/initdb" -D "$WORK/data" -U postgres -A trust --locale=C -E UTF8 --no-sync >/dev/null 2>&1 &&
"${AS[@]}" "$PG_BIN/pg_ctl" -D "$WORK/data" -l "$WORK/pg.log" -o "-h 127.0.0.1 -p $PORT -k $WORK" -w start >/dev/null 2>&1 || { ko "Clúster temporal" "no pudo iniciarse"; exit 1; }
# El volcado trae CREATE SCHEMA public; la base TEMPORAL ya lo tiene, así que se vacía el esquema de ESTA base aislada antes de restaurar.
psql -X -q -h 127.0.0.1 -p "$PORT" -U postgres -d postgres -c "DROP SCHEMA public CASCADE" >/dev/null 2>&1
if pg_restore -h 127.0.0.1 -p "$PORT" -U postgres -d postgres --no-owner --no-privileges --exit-on-error "$DIR/database.dump" > "$WORK/restore.log" 2>&1; then ok "Restauración en base aislada vacía, sin errores"; else ko "Restauración" "$(tail -2 "$WORK/restore.log" | tr '\n' ' ')"; exit 1; fi

conteos > "$WORK/restaurado.txt"
node -e '
const fs=require("fs"); const m=JSON.parse(fs.readFileSync(process.argv[1],"utf8")).conteos;
const r=Object.fromEntries(fs.readFileSync(process.argv[2],"utf8").trim().split("\n").map(l=>{const [k,v]=l.split("=");return [k,Number(v)]}));
const dif=Object.keys(m).filter(t=>r[t]!==m[t]).map(t=>`${t}: origen ${m[t]} / restaurada ${r[t]}`);
if(dif.length){console.log(dif.join("; "));process.exit(1)}' "$DIR/manifest.json" "$WORK/restaurado.txt" > "$WORK/dif.txt" && ok "Integridad de datos: los conteos de TODAS las tablas coinciden con el origen ($(wc -l < "$WORK/restaurado.txt") tablas)" || ko "Integridad de datos" "$(cat "$WORK/dif.txt")"

psql -X -h 127.0.0.1 -p "$PORT" -U postgres -d postgres -f "$ROOT/backend/scripts/estado-base-solo-lectura.sql" > "$DIR/estado-restaurada.txt" 2>&1 && ok "Estado de migraciones de la copia guardado en estado-restaurada.txt" || ko "Informe de estado" "el SQL de solo lectura falló"

if [[ "$ENSAYO" == "--ensayo-migracion" ]]; then
  echo "--- Ensayo de migración SOBRE LA COPIA (nunca sobre el origen) ---"
  (cd "$ROOT/backend" && DIRECT_URL="$URL" DATABASE_URL="$URL" node scripts/migration-safe.mjs inspect > "$WORK/antes.json" 2>&1); ANTES_ESTADO="$(node -e 'try{console.log(JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).state)}catch{console.log("ERROR")}' "$WORK/antes.json")"
  if [[ "$ANTES_ESTADO" != "LISTA" ]]; then ko "Estado de la copia antes de migrar" "$ANTES_ESTADO (requiere baseline/adopción o está bloqueada: NO migrar el origen)"; else
    if (cd "$ROOT/backend" && DIRECT_URL="$URL" DATABASE_URL="$URL" node scripts/migration-safe.mjs deploy > "$WORK/deploy.json" 2> "$WORK/deploy.err"); then ok "migration-safe deploy sobre la copia: migraciones aplicadas ($(node -e 'console.log(JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).pending.length)' "$WORK/deploy.json") pendientes)"; else ko "migration-safe deploy sobre la copia" "$(tr '\n' ' ' < "$WORK/deploy.err" | cut -c1-300)"; fi
    conteos > "$WORK/migrada.txt"
    node -e '
    const fs=require("fs"); const m=JSON.parse(fs.readFileSync(process.argv[1],"utf8")).conteos;
    const r=Object.fromEntries(fs.readFileSync(process.argv[2],"utf8").trim().split("\n").map(l=>{const [k,v]=l.split("=");return [k,Number(v)]}));
    const per=Object.keys(m).filter(t=>t!=="_prisma_migrations"&&r[t]!==m[t]).map(t=>`${t}: antes ${m[t]} / después ${r[t]}`);
    if(per.length){console.log(per.join("; "));process.exit(1)}' "$DIR/manifest.json" "$WORK/migrada.txt" > "$WORK/dif2.txt" && ok "Ninguna fila perdida ni creada en las tablas existentes tras migrar la copia" || ko "Filas tras migrar" "$(cat "$WORK/dif2.txt")"
    if psql -X -At -h 127.0.0.1 -p "$PORT" -U postgres -d postgres -c "SELECT to_regclass('public.detalles_venta') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='detalles_venta' AND column_name='cantidad_entregada')" | grep -q t; then
      PEND="$(psql -X -At -h 127.0.0.1 -p "$PORT" -U postgres -d postgres -c "SELECT count(*) FROM (SELECT p.id FROM productos p LEFT JOIN detalles_venta d ON d.producto_id = p.id AND d.modo_entrega = 'BODEGA' AND EXISTS (SELECT 1 FROM ventas v WHERE v.id = d.venta_id AND v.estado = 'COMPLETADA' AND v.reserva_pendiente) GROUP BY p.id, p.stock_reservado HAVING p.stock_reservado <> COALESCE(SUM(d.cantidad - d.cantidad_entregada - d.cantidad_cancelada),0)) x")"
      [[ "$PEND" == "0" ]] && ok "Conciliación de reservas tras migrar: 0 productos descuadrados" || ko "Conciliación de reservas" "$PEND productos con reserva distinta de lo pendiente"
    fi
    (cd "$ROOT/backend" && DIRECT_URL="$URL" DATABASE_URL="$URL" node scripts/migration-safe.mjs verify > /dev/null 2>&1) && ok "migration-safe verify: la copia queda LISTA y sin pendientes" || ko "verify tras migrar" "la copia no queda LISTA"
    if [[ -f "$ROOT/backend/dist/main.js" ]]; then
      export JWT_SECRET="$(head -c 32 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | head -c 48)" CONTINGENCIA_CLAVE_OPERACIONES="$(head -c 48 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | head -c 48)"
      ( cd "$ROOT/backend" && exec env DATABASE_URL="$URL" DIRECT_URL="$URL" PORT=3390 FRONTEND_URL=http://127.0.0.1:4173 node dist/main.js > "$WORK/api.log" 2>&1 ) &
      API_PID=$!
      for _ in $(seq 1 60); do [[ "$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3390/api/auth/me)" == 401 ]] && break; sleep 1; done
      [[ "$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3390/api/auth/me)" == 401 ]] && ok "El backend compilado arranca sobre la copia migrada y responde" || ko "Arranque del backend sobre la copia" "$(tail -2 "$WORK/api.log" | tr '\n' ' ' | cut -c1-200)"
      for _ in $(seq 1 20); do [[ "$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3390/api/health)" == 200 ]] && break; sleep 1; done
      [[ "$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3390/api/health)" == 200 ]] && ok "/api/health responde 200 (base conectada)" || ko "/api/health" "no respondió 200"
    else echo "(sin backend/dist/main.js: ejecute npm run build para incluir la prueba de arranque)"; fi
  fi
fi
{ echo "Verificación de respaldo — $(date -u +%FT%TZ)"; printf '%s\n' "${RES[@]}"; echo "FALLOS=$FALLOS"; } > "$DIR/verificacion.txt"
if [[ "$FALLOS" == 0 ]]; then node -e 'const fs=require("fs");const p=process.argv[1];const m=JSON.parse(fs.readFileSync(p,"utf8"));m.restoreTested=true;m.restoreTestedAt=new Date().toISOString();fs.writeFileSync(p+".verificado",JSON.stringify(m,null,2),{mode:0o600})' "$DIR/manifest.json"; echo "VERIFICADO. Manifiesto con restoreTested=true: $DIR/manifest.json.verificado"; else echo "NO VERIFICADO: $FALLOS fallo(s). No migre el origen." >&2; exit 1; fi
