# Evidencia P0 y P1 — 2026-10-29

Base: `origin/main` 3a6c6695 (merge de #211). Rama: `claude/p1-liveness-20261029`. Sin merge, despliegue, cambios en Render, Vercel, Supabase ni datos reales.

## P0 — Respaldo y restauración

Evidencia existente (no creada en esta rama):
- CI «Piloto con API y PostgreSQL reales» sobre `3a6c6695` (run 40801739066, **success**). Pasos del simulacro: «Respaldo cifrado, fallos de restauración y snapshot concurrente» y «Reinicio y restauración de la aplicación» (**success**). Es una base PostgreSQL efímera de CI, no producción.
- Scripts del repositorio: `backend/scripts/backup-verify-isolated.mjs`, `restore-verify.mjs`, `simulacro-recuperacion.sh`, `backup-worker.mjs`.

No demostrado:
- Respaldos reales de Supabase productivo: frecuencia, retención y última copia válida no verificadas.
- RPO y RTO: no medidos. Cualquier valor es propuesta, no resultado.
- La restauración local no se ejecutó en esta sesión: no hay PostgreSQL instalado en este equipo y Docker no está activo.

## P1 — Salud del servicio

- `GET /api/health`: readiness (consulta `SELECT 1`); sin cambios.
- `GET /api/health/live` (nuevo): liveness sin consultar la base. Evita que una caída temporal de PostgreSQL reinicie el proceso.
- Pruebas: `src/common/health.controller.spec.ts` (3/3).
- Backend unitarias: 748 aprobadas, 3 omitidas, 0 fallos (`npm test`, `vitest run`).
- Build de producción (`tsconfig.build.json`): sin errores.
- `tsc` con `tsconfig.json`: errores preexistentes en archivos de prueba sin globales de Vitest; no relacionados con este cambio.

No demostrado: qué ruta usa Render como health check. No verificado; debe confirmarlo quien administra Render.

## Pendiente humano
- Confirmar el health check configurado en Render y el SHA desplegado.
- Confirmar frecuencia y verificación de respaldos de producción (Supabase).
- Aprobar RPO y RTO objetivo.
