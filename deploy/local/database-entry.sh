#!/bin/sh
set -eu
# Docker Compose conserva permisos del archivo del host. Crear copia privada en tmpfs
# para que PostgreSQL pueda leerla durante la inicialización sin abrir el secreto al host.
install -d -m 0700 -o postgres -g postgres /run/ferre-secrets
install -m 0600 -o postgres -g postgres /run/secrets/database_password /run/ferre-secrets/runtime_password
exec docker-entrypoint.sh "$@"
