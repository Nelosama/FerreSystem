#!/bin/sh
# Vercel: exit 0 omite el despliegue; exit 1 permite construir.
case "$VERCEL_GIT_COMMIT_REF" in
  nexus/*|fix/inventario-inicial-seguro|fix/pilot-readiness|codex/auditoria-precision-monetaria|codex/fix-expired-sessions|fix/jowa-operacion-estable|codex/fix-camera-lifecycle-ios|codex/estabilidad-operativa) exit 0 ;;
  *) exit 1 ;;
esac
