#!/usr/bin/env bash
# Respaldo completo y verificable ANTES de migrar. SOLO LEE la base de origen (pg_dump y conteos); no migra ni escribe en ella.
# Uso:  FERRE_ORIGEN_URL='postgresql://usuario:clave@host:5432/base' bash backend/scripts/respaldo-previo-migracion.sh /ruta/privada/respaldo-AAAAMMDD-HHMM
#  - FERRE_ORIGEN_URL: conexión DIRECTA (no el pooler de Supabase). Se pasa por entorno, no por argumentos, y no se imprime.
#  - El destino debe estar FUERA del repositorio y vacío; se crea con permisos 0700. Contiene datos del cliente: protéjalo como la base.
# Resultado: database.dump (formato custom, esquema public), contenido.txt (lista legible), manifest.json (sha256, tamaño, conteos exactos por tabla).
# El manifest.json es el que exige `migration-safe adopt`; `restoreTested` queda en false hasta ejecutar verificar-respaldo.sh.
set -euo pipefail
DEST="${1:?Uso: FERRE_ORIGEN_URL=... bash $0 DIRECTORIO_DESTINO}"
[[ -n "${FERRE_ORIGEN_URL:-}" ]] || { echo "Defina FERRE_ORIGEN_URL en el entorno (conexión directa)." >&2; exit 2; }
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
mkdir -p "$DEST"; DEST="$(cd "$DEST" && pwd)"
case "$DEST/" in "$ROOT"/*) echo "El destino debe estar FUERA del repositorio." >&2; exit 2;; esac
[[ -z "$(ls -A "$DEST")" ]] || { echo "El destino debe estar vacío (no se sobrescriben respaldos)." >&2; exit 2; }
chmod 700 "$DEST"
# Convierte la URL en variables PG* del proceso (libpq) sin mostrarla ni dejarla en la lista de procesos.
eval "$(node -e '
const u = new URL(process.env.FERRE_ORIGEN_URL); const q = (v) => "\x27" + String(v).replace(/\x27/g, "\x27\\\x27\x27") + "\x27";
if (!["postgres:", "postgresql:"].includes(u.protocol)) { console.error("La URL debe ser PostgreSQL"); process.exit(2); }
console.log(`export PGHOST=${q(u.hostname)} PGPORT=${q(u.port || 5432)} PGUSER=${q(decodeURIComponent(u.username))} PGPASSWORD=${q(decodeURIComponent(u.password))} PGDATABASE=${q(u.pathname.slice(1) || "postgres")}`);
if (u.searchParams.get("sslmode")) console.log(`export PGSSLMODE=${q(u.searchParams.get("sslmode"))}`);
')"
unset FERRE_ORIGEN_URL
echo "[1/4] Conteos exactos por tabla (lectura)"
psql -X -At -v ON_ERROR_STOP=1 -c "BEGIN READ ONLY; SELECT table_name||'='||(xpath('/row/c/text()', query_to_xml(format('select count(*) as c from public.%I', table_name), false, true, '')))[1]::text FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' ORDER BY 1; ROLLBACK;" | grep '=' > "$DEST/conteos.txt"
echo "[2/4] pg_dump (formato custom, esquema public)"
pg_dump --format=custom --schema=public --no-owner --no-privileges --file "$DEST/database.dump"
echo "[3/4] Legibilidad (pg_restore --list)"
pg_restore --list "$DEST/database.dump" > "$DEST/contenido.txt"
grep -q 'TABLE DATA public _prisma_migrations' "$DEST/contenido.txt" || { echo "El respaldo no contiene el historial de migraciones: NO es válido." >&2; exit 1; }
[[ "$(wc -l < "$DEST/conteos.txt")" -gt 5 ]] || { echo "Muy pocas tablas: revise que la URL apunte a la base correcta." >&2; exit 1; }
echo "[4/4] Manifiesto"
SHA="$(sha256sum "$DEST/database.dump" | cut -d' ' -f1)"
node -e '
const fs = require("fs"); const [dest, sha] = process.argv.slice(1);
const conteos = Object.fromEntries(fs.readFileSync(dest + "/conteos.txt", "utf8").trim().split("\n").map((l) => { const [k, v] = l.split("="); return [k, Number(v)]; }));
const m = { archiveReadable: true, restoreTested: false, sha256: sha, bytes: fs.statSync(dest + "/database.dump").size, creado: new Date().toISOString(), esquema: "public", conteos };
fs.writeFileSync(dest + "/manifest.json", JSON.stringify(m, null, 2), { mode: 0o600 });
' "$DEST" "$SHA"
chmod 600 "$DEST"/*
echo "Respaldo creado en $DEST ($(stat -c %s "$DEST/database.dump") bytes, sha256 ${SHA:0:16}…). Siguiente paso: bash backend/scripts/verificar-respaldo.sh '$DEST' --ensayo-migracion"
