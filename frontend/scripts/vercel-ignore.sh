#!/bin/sh
# Paso «Ignored Build Step» de Vercel: exit 0 omite el despliegue, exit 1 lo construye.
# Ramas de trabajo sin previews automáticas. Va en un archivo porque Vercel rechaza
# un vercel.json cuyo ignoreCommand supera 256 caracteres (error de validación del esquema).
case "$VERCEL_GIT_COMMIT_REF" in
  nexus/*|fix/inventario-inicial-seguro|fix/pilot-readiness|codex/auditoria-precision-monetaria|codex/fix-expired-sessions|fix/jowa-operacion-estable|codex/fix-camera-lifecycle-ios|codex/estabilidad-operativa|claude/revision-seguridad-jowa-20261020) exit 0 ;;
  *) exit 1 ;;
esac
