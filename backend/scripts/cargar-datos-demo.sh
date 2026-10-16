#!/usr/bin/env bash
# Carga de datos demo de un mes (datos-ficticios-un-mes.sql) con protección de entorno.
#
# Uso:  DEMO_DATABASE_URL=postgresql://... backend/scripts/cargar-datos-demo.sh
#
# Reglas (todas fallan cerradas, antes de insertar nada):
#  - Usa solo DEMO_DATABASE_URL. Nunca DATABASE_URL como alternativa.
#  - Rechaza si DEMO_DATABASE_URL es igual a DATABASE_URL (la misma base de la aplicación).
#  - Lee los identificadores autorizados de backend/prisma/entornos-seed.json. Si la lista está vacía
#    o no contiene UUID válidos, aborta.
#  - El SQL exige marca de entorno DESARROLLO o STAGING cuyo identificador esté en esa lista.
#    Modificar solo el tipo de la marca no basta: el identificador debe estar autorizado.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SEED="$ROOT/prisma/entornos-seed.json"
SQL="$ROOT/scripts/datos-ficticios-un-mes.sql"

fallar() { echo "ERROR: $*" >&2; exit 1; }

[[ -n "${DEMO_DATABASE_URL:-}" ]] || fallar "defina DEMO_DATABASE_URL (no se usa DATABASE_URL)."
if [[ -n "${DATABASE_URL:-}" && "$DEMO_DATABASE_URL" == "$DATABASE_URL" ]]; then
  fallar "DEMO_DATABASE_URL es igual a DATABASE_URL. Use una base de pruebas distinta."
fi
[[ -f "$SEED" ]] || fallar "falta $SEED."
command -v psql >/dev/null || fallar "psql no está instalado."

AUTORIZADOS="$(node -e '
  const fs = require("fs");
  const datos = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
  const lista = datos.identificadores;
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!Array.isArray(lista) || lista.length === 0) { process.exit(3); }
  if (!lista.every((x) => typeof x === "string" && uuid.test(x))) { process.exit(4); }
  console.log(lista.map((x) => x.toLowerCase()).join(","));
' "$SEED")" || {
  case $? in
    3) fallar "la lista de entornos autorizados (prisma/entornos-seed.json) está vacía. No se carga nada." ;;
    4) fallar "la lista de entornos autorizados contiene identificadores no válidos." ;;
    *) fallar "no se pudo leer prisma/entornos-seed.json." ;;
  esac
}

psql "$DEMO_DATABASE_URL" -X -q -v ON_ERROR_STOP=1 -v AUTORIZADOS="$AUTORIZADOS" -f "$SQL"
echo "Carga demo completada."
