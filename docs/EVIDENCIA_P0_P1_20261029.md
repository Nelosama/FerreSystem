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

## Segunda pasada — verificación HTTP y lint (2026-10-29)

Base: `origin/main` `3a6c6695`. Esta pasada corrige una afirmación previa: la evidencia de CI debe citarse por SHA completo.

### Verificación HTTP sin PostgreSQL (manual, `dist/` compilado con `nest build`)

| Petición | Resultado |
| --- | --- |
| `GET /api/health/live` | **200** `{"status":"ok"}`, sin consultar la base |
| `GET /api/health` (PostgreSQL inaccesible) | **503** con mensaje genérico, sin detalles de conexión |
| `GET /health/live` (sin prefijo) | **404**: el prefijo `/api` se aplica (`src/main.ts`, `setGlobalPrefix('api')`) |

Arranque: el servicio rechaza `TRUST_PROXY=false` (espera un entero). Es el comportamiento esperado de la configuración.

### Pruebas automatizadas (nuevas)

- `src/common/health.controller.spec.ts`: 3 pruebas unitarias (readiness con base y sin base, liveness sin consulta).
- `src/common/health.http.spec.ts`: 4 pruebas HTTP con Nest y prefijo global: live 200 con base caída; health 503 sin filtrar el error; health 200 con base; `/health/live` sin prefijo responde 404.
- Ambos archivos: **7/7 aprobadas** (`npx vitest run src/common/health`).
- Suite unitaria del backend en la pasada anterior: 748 aprobadas, 3 omitidas.

### Lint (P5)

- `oxlint src test e2e` sobre `53e2cc95` (antes de la integración reciente): **127** líneas con aviso.
- Sobre `3a6c6695`: **127**. Comparación por archivo y regla: **idéntica**. **0 regresiones** introducidas por #210–#211.
- El registro previo de 117 avisos estaba desactualizado; no se reproduce con el mismo binario.

### Pendiente
- CI de `264655e5` (resultado final, 2026-10-29): `test` (piloto API + PostgreSQL) **verde**; `guard-base-datos` **verde**; `validate` **rojo**: integración 1204/1206, 2 fallos en `test/aislamiento-barrido.postgres.integration.ts` porque `GET /api/health/live` (pública por diseño, como `/api/health`) no estaba en el inventario `PUBLICAS` del barrido. No es un defecto de seguridad del endpoint: devuelve solo `{status:'ok'}` sin datos de negocio.
- Corrección en el commit siguiente: `/api/health/live` añadida a `PUBLICAS`. Local con PostgreSQL 16 real: barrido **7/7**. CI del nuevo SHA pendiente; el PR sigue en borrador hasta verlo verde.
- Render: sin verificar qué ruta usa como health check ni qué SHA está desplegado.
- Prueba de readiness con PostgreSQL real disponible (200): cubierta por el piloto de CI, no por la prueba manual de esta pasada.
