#!/bin/sh
if [ "$VERCEL_GIT_COMMIT_REF" = "codex/pr202-auditoria-precios" ] || [ "$VERCEL_GIT_COMMIT_REF" = "claude/pos-sincronizacion-precios" ]; then
  exit 0
fi

# Vercel: exit 0 omite el despliegue; exit 1 permite construir.
# Va en un archivo porque Vercel rechaza un vercel.json cuyo ignoreCommand supera 256 caracteres.
case "$VERCEL_GIT_COMMIT_REF" in
  main|fix/fase3-idempotencia-20261030|claude/sprint-contingencia-seguridad-ux-20261030|claude/prod-matriz-fiscal-20261030|claude/prod-auditoria-infra-20261030|claude/sharp-fermi-ryjhpl|claude/sprint-seguimiento-20261030|claude/focused-hawking-52oiqz) exit 0 ;;
  claude/sweet-davinci-vh7br4|codex/pos-cancelacion-autorizada|codex/guia-control-modulos|codex/auth-recovery-security|nexus/*|fix/inventario-inicial-seguro|fix/pilot-readiness|codex/auditoria-precision-monetaria|codex/fix-expired-sessions|fix/jowa-operacion-estable|codex/fix-camera-lifecycle-ios|codex/estabilidad-operativa|claude/revision-seguridad-jowa-20261020|claude/consolidate-auth-pr200-201-xz1q5m|feat/contabilidad-honduras|claude/jowa-production-audit-integration-mvd8vl|claude/jowa-production-audit-integration-mvd8vl-ensayo) exit 0 ;;
  *) exit 1 ;;
esac
