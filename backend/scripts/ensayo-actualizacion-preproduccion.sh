#!/usr/bin/env bash
# ENSAYO COMPLETO de la actualización a esta versión, en un PostgreSQL local aislado que simula la producción actual (esquema de `main`
# + datos históricos). NUNCA toca una base real: crea y elimina sus propios clústeres temporales (127.0.0.1).
# Secuencia: respaldo -> verificación/restauración/ensayo de migración sobre la copia -> el arranque por defecto se NIEGA con migraciones pendientes
# -> migración explícita -> arranque con el procedimiento de producción (NODE_ENV=production) -> humo de API -> casos históricos -> reinicio y persistencia
# -> reversión simulada (restaurar el respaldo y comprobar que el código nuevo no arranca sobre el esquema viejo).
# Requisitos: root o usuario con PostgreSQL 16 (initdb), Node, backend instalado. Uso: bash backend/scripts/ensayo-actualizacion-preproduccion.sh
set -uo pipefail
unset POS_OFFLINE_ENABLED FERRE_MIGRAR_AL_ARRANCAR   # el ensayo reproduce la producción: contingencia apagada y arranque que no migra
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"; PG_BIN="${PG_BIN:-/usr/lib/postgresql/16/bin}"; export PG_BIN PATH="$PG_BIN:$PATH"
WORK="$(mktemp -d /tmp/ferre-ensayo-XXXXXX)"; chmod 777 "$WORK"
if [[ "$(id -u)" == 0 ]]; then AS=(runuser -u nobody --); else AS=(); fi
# Puertos libres elegidos al momento: uno fijo dentro del rango efímero (32768-60999) puede estar ocupado por un socket cliente.
libre() { node -e 'const s=require("net").createServer().listen(0,"127.0.0.1",()=>{console.log(s.address().port);s.close()})'; }
PP="$(libre)"; API=3391
PRODURL="postgresql://postgres@127.0.0.1:$PP/postgres"
export JWT_SECRET="$(head -c 32 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | head -c 48)"
export CONTINGENCIA_CLAVE_OPERACIONES="$(head -c 48 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | head -c 48)"
# Configuración de auth exigida en producción: valores efímeros de esta copia aislada, nunca productivos.
export AUTH_MFA_ENCRYPTION_KEY="$(head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n')"
export AUTH_MAIL_GMAIL_USER="ensayo@example.test"
export AUTH_MAIL_GMAIL_APP_PASSWORD="$(head -c 24 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | head -c 16)"
export AUTH_PUBLIC_URL="https://ferreteria.example.test"
PW="Ens-$(head -c 18 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | head -c 18)"
API_PID=""; RES=(); FALLOS=0
fin() { [[ -n "$API_PID" ]] && kill "$API_PID" 2>/dev/null; for d in prod q; do "${AS[@]}" "$PG_BIN/pg_ctl" -D "$WORK/$d" -m immediate stop >/dev/null 2>&1; done; if [[ "${FERRE_ENSAYO_CONSERVAR:-}" == SI ]]; then echo "Registros conservados en $WORK (contienen datos de PRUEBA, no del cliente)"; else rm -rf "$WORK"; fi; }
trap fin EXIT
ok() { RES+=("PASS | $1 | $2"); echo "PASS  $1 — $2"; }
ko() { RES+=("FAIL | $1 | $2"); echo "FAIL  $1 — $2"; FALLOS=$((FALLOS+1)); }
q() { psql -X -At -h 127.0.0.1 -p "$1" -U postgres -d postgres -c "$2"; }
cluster() { "${AS[@]}" "$PG_BIN/initdb" -D "$WORK/$1" -U postgres -A trust --locale=C -E UTF8 --no-sync >/dev/null && "${AS[@]}" "$PG_BIN/pg_ctl" -D "$WORK/$1" -l "$WORK/$1.log" -o "-h 127.0.0.1 -p $2 -k $WORK" -w start >/dev/null; }
espera() { for _ in $(seq 1 60); do [[ "$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:$API/api/auth/me)" == 401 ]] && return 0; sleep 1; done; return 1; }
arrancar() { # $1 = etiqueta del registro. Procedimiento de arranque de producción: verificación (sin migrar) y luego el backend. exec: el PID guardado ES el de node
  ( cd "$ROOT/backend" && exec env DATABASE_URL="$PRODURL" DIRECT_URL="$PRODURL" NODE_ENV=production PORT=$API FRONTEND_URLS=https://ferreteria.example.test TRUST_PROXY=1 sh -c 'node scripts/migration-safe.mjs startup && exec node dist/main' > "$WORK/api-$1.log" 2>&1 ) &
  API_PID=$!; }
mfa_ensayo() { DATABASE_URL="$PRODURL" DIRECT_URL="$PRODURL" NODE_ENV=test node "$ROOT/backend/test/synthetic-upgrade-mfa.cjs"; }
foto() { q "$PP" "SELECT (SELECT count(*) FROM ventas)||'|'||(SELECT sum(total)::float FROM ventas)||'|'||(SELECT count(*) FROM detalles_venta)||'|'||(SELECT sum(stock_actual)::float FROM productos)||'|'||(SELECT sum(stock_reservado)::float FROM productos)||'|'||(SELECT count(*) FROM usuarios)"; }
cd "$ROOT/backend" && npm run build >/dev/null 2>&1

echo "== 1. Producción simulada: esquema de main (13 migraciones) + datos históricos"
cluster prod $PP
CORTE=20261010120000
mkdir -p "$WORK/proy/prisma/migrations" && cp prisma/schema.prisma "$WORK/proy/prisma/" && cp prisma/migrations/migration_lock.toml "$WORK/proy/prisma/migrations/"
for m in $(ls prisma/migrations | grep -E '^[0-9]{14}_' | sort); do [[ "${m%%_*}" -le "$CORTE" ]] && cp -r "prisma/migrations/$m" "$WORK/proy/prisma/migrations/"; done
N_MAIN="$(ls "$WORK/proy/prisma/migrations" | grep -cE '^[0-9]{14}_')"
(DATABASE_URL="$PRODURL" DIRECT_URL="$PRODURL" node node_modules/prisma/build/index.js migrate deploy --schema "$WORK/proy/prisma/schema.prisma" > "$WORK/main.log" 2>&1) && ok "Base simulada con el esquema de main" "$N_MAIN migraciones" || { ko "Base simulada" "$(tail -3 "$WORK/main.log")"; exit 1; }
HASH="$(node -e 'require("bcrypt").hash(process.argv[1],10).then(h=>console.log(h))' "$PW")" || { echo "No se pudo generar la contraseña de prueba" >&2; exit 2; }
q "$PP" "
INSERT INTO tenants (id, nombre_comercial, estado, updated_at) VALUES ('T1','Ferretería histórica','ACTIVO',NOW());
INSERT INTO usuarios (id, tenant_id, nombre, email, password_hash, rol, permisos, permisos_configurados, updated_at) VALUES
 ('UA','T1','Administrador','admin@piloto.invalid','$HASH','ADMIN','{}',false,NOW()),
 ('UC','T1','Cajero','cajero@piloto.invalid','$HASH','CAJERO','{pos.vender}',true,NOW());
-- Super Admin de plataforma: la auditoría de un negocio es exclusiva de este rol.
INSERT INTO super_admins (id, nombre, email, password_hash, activo, updated_at) VALUES ('SA1','Super Admin ensayo','superadmin@piloto.invalid','$HASH',true,NOW());
INSERT INTO productos (id, tenant_id, codigo, nombre, precio_venta, precio_costo, stock_actual, stock_reservado, stock_minimo, activo, updated_at) VALUES
 ('P-ACT','T1','A-1','Tornillo histórico',100,40,100,5,1,true,NOW()),
 ('P-CERO','T1','A-2','Producto sin precio',0,0,20,0,1,true,NOW()),
 ('P-INAC','T1','A-3','Producto inactivo',50,20,7,0,1,false,NOW());
INSERT INTO ventas (id, tenant_id, numero_venta, usuario_id, subtotal, isv, total, reserva_pendiente, entregado_at, estado, created_at) VALUES
 ('V_PEND','T1',1,'UA',500,75,575,true,NULL,'COMPLETADA',NOW()),
 ('V_ENT','T1',2,'UA',300,45,345,false,NOW(),'COMPLETADA',NOW());
-- Contador de numeración de ventas de la empresa, coherente con las 2 ventas históricas (la aplicación lo avanza al vender).
INSERT INTO secuencias_tenant (id, tenant_id, tipo, ultimo_numero) VALUES (gen_random_uuid(),'T1','VENTA',2);
INSERT INTO detalles_venta (id, venta_id, producto_id, cantidad, precio_unitario, subtotal, costo_unitario, sin_inventario) VALUES
 ('D_PEND','V_PEND','P-ACT',5,100,500,40,false), ('D_ENT','V_ENT','P-ACT',3,100,300,40,false);" > /dev/null && ok "Datos históricos sembrados" "2 usuarios, 3 productos, 2 ventas (una con entrega pendiente)" || { ko "Siembra" "falló"; exit 1; }
FOTO_PRE="$(foto 2>/dev/null)"; echo "   foto previa (ventas|total|líneas|stock|reservado|usuarios): $FOTO_PRE"

echo "== 2. Respaldo previo y verificación (restauración + ensayo de migración sobre la COPIA)"
if FERRE_ORIGEN_URL="$PRODURL" bash "$ROOT/backend/scripts/respaldo-previo-migracion.sh" "$WORK/respaldo" > "$WORK/respaldo.log" 2>&1; then ok "Respaldo creado" "$(grep -o '[0-9]* bytes' "$WORK/respaldo.log" | head -1)"; else ko "Respaldo" "$(tail -2 "$WORK/respaldo.log")"; exit 1; fi
if bash "$ROOT/backend/scripts/verificar-respaldo.sh" "$WORK/respaldo" --ensayo-migracion > "$WORK/verif.log" 2>&1; then ok "Verificación del respaldo + ensayo de migración en la copia" "$(grep -c '^PASS' "$WORK/verif.log") comprobaciones PASS"; else ko "Verificación del respaldo" "$(grep '^FAIL' "$WORK/verif.log" | head -2 | tr '\n' ' ')"; fi
[[ "$(foto 2>/dev/null)" == "$FOTO_PRE" ]] && ok "El origen no cambió durante el respaldo ni el ensayo" "foto idéntica" || ko "Origen intacto" "la foto cambió"

echo "== 3. El arranque por defecto se NIEGA con migraciones pendientes y no escribe"
arrancar guardia; sleep 6
if kill -0 "$API_PID" 2>/dev/null; then ko "Guardia de arranque" "el backend arrancó con migraciones pendientes"; else ok "El backend NO arranca con migraciones pendientes" "$(grep -o 'faltan [0-9]* migraciones' "$WORK/api-guardia.log" | head -1)"; fi
[[ "$(q "$PP" "SELECT count(*) FROM information_schema.columns WHERE table_name='productos' AND column_name='precio_aprobado'")" == "0" ]] && ok "El arranque no modificó el esquema de producción simulada" "columna precio_aprobado ausente" || ko "Arranque sin escritura" "el esquema cambió"
API_PID=""

echo "== 4. Migración explícita y autorizada (npm run migrate:deploy)"
if (cd "$ROOT/backend" && DATABASE_URL="$PRODURL" DIRECT_URL="$PRODURL" node scripts/migration-safe.mjs deploy > "$WORK/deploy.json" 2> "$WORK/deploy.err"); then ok "Migración aplicada" "base LISTA, 24 migraciones"; else ko "Migración" "$(tr '\n' ' ' < "$WORK/deploy.err" | cut -c1-200)"; fi
[[ "$(q "$PP" "SELECT password_hash FROM super_admins WHERE id='SA1'")" == "$HASH" ]] && ok "Credencial histórica de Super Admin preservada" "hash idéntico tras migrar" || ko "Credencial histórica" "hash alterado"
POST="$(foto)"; [[ "${POST%%|*}" == "${FOTO_PRE%%|*}" ]] && ok "Ninguna venta perdida ni creada por la migración" "ventas ${POST%%|*}" || ko "Ventas tras migrar" "$POST"
q "$PP" "SELECT string_agg(id||'='||precio_aprobado::text||'/'||coalesce(precio_aprobado_por,'-'), ' ' ORDER BY id) FROM productos" | grep -q "P-ACT=true/LEGADO_MIGRACION P-CERO=false/- P-INAC=false/-" && ok "Aprobación de precios heredados" "solo el producto activo con precio queda aprobado" || ko "Aprobación de precios heredados" "$(q "$PP" "SELECT string_agg(id||'='||precio_aprobado::text, ' ') FROM productos")"
[[ "$(q "$PP" "SELECT sum(cantidad_entregada)::float FROM detalles_venta WHERE venta_id='V_ENT'")" == "3" && "$(q "$PP" "SELECT sum(cantidad_entregada)::float FROM detalles_venta WHERE venta_id='V_PEND'")" == "0" ]] && ok "Reparto histórico de entregas" "venta entregada = 3 de 3; venta pendiente = 0 de 5" || ko "Reparto histórico de entregas" "contadores inesperados"

echo "== 5. Arranque con el procedimiento de producción (NODE_ENV=production, sin migrar)"
arrancar produccion
if espera; then ok "El backend arranca en modo producción sobre la base migrada" "puerto $API"; else ko "Arranque en producción" "$(tail -3 "$WORK/api-produccion.log" | tr '\n' ' ' | cut -c1-200)"; fi
if API_URL="http://127.0.0.1:$API/api" ADMIN_EMAIL=admin@piloto.invalid ADMIN_PASSWORD="$PW" CAJERO_EMAIL=cajero@piloto.invalid CAJERO_PASSWORD="$PW" SUPERADMIN_EMAIL=superadmin@piloto.invalid SUPERADMIN_PASSWORD="$PW" SUPERADMIN_MFA_CODE="$(mfa_ensayo)" node "$ROOT/backend/scripts/humo-preproduccion.mjs" --escribe > "$WORK/humo.log" 2>&1; then ok "Humo de API con escritura" "$(tail -1 "$WORK/humo.log")"; else ko "Humo de API" "$(grep FAIL "$WORK/humo.log" | head -2 | tr '\n' ' ')"; fi
cat > "$WORK/historicos.mjs" <<'EON'
const [api, pw] = process.argv.slice(2);
const j = async (m, r, t, d) => { const res = await fetch(api + r, { method: m, headers: { 'content-type': 'application/json', ...(t ? { authorization: 'Bearer ' + t } : {}) }, body: d ? JSON.stringify(d) : undefined }); const x = await res.text(); return { s: res.status, b: x ? JSON.parse(x) : null }; };
const id = () => crypto.randomUUID();
const adm = (await j('POST', '/auth/login', null, { email: 'admin@piloto.invalid', password: pw })).b.accessToken;
const caj = (await j('POST', '/auth/login', null, { email: 'cajero@piloto.invalid', password: pw })).b.accessToken;
const out = {};
// El administrador entrega la venta histórica con entrega pendiente (reserva 5).
out.entregaHistorica = (await j('POST', '/operaciones/ventas/V_PEND/entregar', adm, { solicitudId: id(), receptorNombre: 'Cliente histórico' })).s;
// Producto heredado aprobado: se vende; producto heredado sin precio: se rechaza.
const cajas = await j('GET', '/operaciones/caja', caj);
for (const c of (cajas.b || []).filter((x) => x.estado === 'ABIERTA')) await j('POST', `/operaciones/caja/${c.id}/cerrar`, caj, { monto: Number(c.efectivoEsperado) });
const abierta = await j('POST', '/operaciones/caja/abrir', caj, { solicitudId: id(), monto: 100 });
out.ventaProductoHeredado = (await j('POST', '/ventas', caj, { solicitudId: id(), metodoPago: 'EFECTIVO', tipoPago: 'CONTADO', detalles: [{ productoId: 'P-ACT', cantidad: 1 }] })).s;
out.ventaProductoSinPrecio = (await j('POST', '/ventas', caj, { solicitudId: id(), metodoPago: 'EFECTIVO', tipoPago: 'CONTADO', detalles: [{ productoId: 'P-CERO', cantidad: 1 }] })).s;
const c2 = await j('GET', '/operaciones/caja', caj);
const ab = (c2.b || []).find((x) => x.id === abierta.b?.id);
if (ab) await j('POST', `/operaciones/caja/${ab.id}/cerrar`, caj, { monto: Number(ab.efectivoEsperado) });
console.log(JSON.stringify(out));
EON
H="$(node "$WORK/historicos.mjs" "http://127.0.0.1:$API/api" "$PW")"; echo "   históricos: $H"
echo "$H" | grep -q '"entregaHistorica":201' && ok "Entrega de la venta histórica pendiente" "201" || ko "Entrega de la venta histórica" "$H"
[[ "$(q "$PP" "SELECT stock_actual::float||'/'||stock_reservado::float FROM productos WHERE id='P-ACT'")" == "95/1" ]] && ok "Inventario correcto: lo histórico se entregó (100 - 5 = 95 físicas, reserva 5 -> 0) y la venta nueva reserva 1 hasta entregarse" "95/1" || ko "Inventario histórico" "$(q "$PP" "SELECT stock_actual::float||'/'||stock_reservado::float FROM productos WHERE id='P-ACT'")"
echo "$H" | grep -q '"ventaProductoHeredado":201' && ok "Se vende el producto heredado con precio" "201" || ko "Venta de producto heredado" "$H"
echo "$H" | grep -qE '"ventaProductoSinPrecio":4[0-9][0-9]' && ok "NO se vende el producto heredado sin precio aprobado" "rechazado 4xx" || ko "Producto sin precio" "$H"

echo "== 6. Reinicio del backend y persistencia"
SNAP1="$(foto)"; kill "$API_PID" 2>/dev/null; sleep 3; arrancar reinicio
if espera; then ok "El backend reinicia solo con el procedimiento de producción" "sin migrar"; else ko "Reinicio" "$(tail -3 "$WORK/api-produccion.log" | tr '\n' ' ' | cut -c1-200)"; fi
[[ "$(foto)" == "$SNAP1" ]] && ok "Datos idénticos tras el reinicio" "$SNAP1" || ko "Persistencia tras reinicio" "$(foto)"
API_URL="http://127.0.0.1:$API/api" ADMIN_EMAIL=admin@piloto.invalid ADMIN_PASSWORD="$PW" CAJERO_EMAIL=cajero@piloto.invalid CAJERO_PASSWORD="$PW" SUPERADMIN_EMAIL=superadmin@piloto.invalid SUPERADMIN_PASSWORD="$PW" SUPERADMIN_MFA_CODE="$(mfa_ensayo)" node "$ROOT/backend/scripts/humo-preproduccion.mjs" > "$WORK/humo2.log" 2>&1 && ok "Humo de solo lectura tras el reinicio" "$(tail -1 "$WORK/humo2.log")" || ko "Humo tras el reinicio" "$(grep FAIL "$WORK/humo2.log" | head -2 | tr '\n' ' ')"
kill "$API_PID" 2>/dev/null; API_PID=""
FUGAS=0; for f in "$WORK"/api-*.log "$WORK"/humo*.log "$WORK"/verif.log "$WORK"/respaldo.log "$WORK"/deploy.err; do for v in "$CONTINGENCIA_CLAVE_OPERACIONES" "$AUTH_MFA_ENCRYPTION_KEY" "$JWT_SECRET" "$PW"; do grep -qF -- "$v" "$f" 2>/dev/null && FUGAS=$((FUGAS+1)); done; done
[[ "$FUGAS" == 0 ]] && ok "Ningún secreto en registros ni salidas" "ni la clave de contingencia, ni JWT_SECRET, ni las contraseñas aparecen en los registros del backend, el humo, el respaldo o la verificación" || ko "Secretos en registros" "$FUGAS coincidencias"

echo "== 7. Reversión simulada: restaurar el respaldo y proteger contra el código nuevo sobre el esquema viejo"
PQ="$(libre)"; QURL="postgresql://postgres@127.0.0.1:$PQ/postgres"
cluster q $PQ || { ko "Arranque del clúster de reversión" "$(tail -3 "$WORK/q.log")"; }
psql -X -q -h 127.0.0.1 -p $PQ -U postgres -d postgres -c "DROP SCHEMA public CASCADE" >/dev/null 2>&1
if pg_restore -h 127.0.0.1 -p $PQ -U postgres -d postgres --no-owner --no-privileges --exit-on-error "$WORK/respaldo/database.dump" > "$WORK/restore.log" 2>&1; then ok "Restauración del respaldo previo en una base nueva" "sin errores"; else ko "Restauración" "$(tail -2 "$WORK/restore.log")"; fi
RQ="$(q "$PQ" "SELECT (SELECT count(*) FROM ventas)||'|'||(SELECT sum(total)::float FROM ventas)||'|'||(SELECT count(*) FROM detalles_venta)||'|'||(SELECT sum(stock_actual)::float FROM productos)||'|'||(SELECT sum(stock_reservado)::float FROM productos)||'|'||(SELECT count(*) FROM usuarios)")"
[[ "$RQ" == "$FOTO_PRE" ]] && ok "La base restaurada es idéntica a la de antes de migrar" "$RQ" || ko "Estado restaurado" "esperado $FOTO_PRE, obtenido $RQ"
if (cd "$ROOT/backend" && DATABASE_URL="$QURL" DIRECT_URL="$QURL" node scripts/migration-safe.mjs startup > "$WORK/q.out" 2> "$WORK/q.err"); then ko "Guardia sobre el esquema viejo" "el código nuevo habría arrancado"; elif FQ="$(grep -o 'faltan [0-9]* migraciones' "$WORK/q.err" | head -1)" && [[ -n "$FQ" ]]; then ok "El código nuevo NO arranca sobre el esquema viejo restaurado" "$FQ"; else ko "Guardia sobre el esquema viejo" "falló por otra causa: $(tail -2 "$WORK/q.err" | tr '\n' ' ')"; fi

echo; echo "===== RESUMEN DEL ENSAYO ====="; printf '%s\n' "${RES[@]}"; echo "FALLOS=$FALLOS"
exit $((FALLOS>0))
