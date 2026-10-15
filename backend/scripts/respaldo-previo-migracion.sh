#!/usr/bin/env bash
# Respaldo completo y verificable ANTES de migrar. SOLO LEE la base de origen (pg_dump y conteos); no migra ni escribe en ella.
# Uso:  FERRE_ORIGEN_URL='postgresql://usuario:clave@host:5432/base' bash backend/scripts/respaldo-previo-migracion.sh /ruta/privada/respaldo-AAAAMMDD-HHMM
#  - FERRE_ORIGEN_URL: conexión DIRECTA (no el pooler de Supabase). Se pasa por entorno, no por argumentos, y no se imprime.
#  - El destino debe estar FUERA del repositorio y vacío; se crea con permisos 0700. Contiene datos del cliente: protéjalo como la base.
# Resultado: database.dump (formato custom, esquema public), contenido.txt (lista legible), manifest.json (sha256, tamaño, conteos exactos por tabla).
# El manifest.json es el que exige `migration-safe adopt`; `restoreTested` queda en false hasta ejecutar verificar-respaldo.sh.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
exec node "$ROOT/backend/scripts/backup-consistent.mjs" "$@"
