# Barrido de fechas en pruebas

Base: `3a62120984c31b3c869f691755dce9ab7a644b0e`. Rama: `codex/barrido-fechas-20261102`.

Solo se modifican pruebas y esta evidencia. Sin merge, push, PR, despliegues, secretos ni bases persistentes. `docs/CONTEXTO_MAESTRO.md` permanece intacto.

El CSV adjunto registra 687 coincidencias en 133 archivos. Se buscaron fechas `2026[-/](0[1-9]|1[0-2])`, `new Date()`, `Date.now()`, palabras mes/año/month/year y nombres con año. En backend/src se incluyen exclusivamente *.spec.ts. También se revisaron vencimientos de 2025 y 2099 cercanos a los hallazgos. Una coincidencia es una línea candidata, no necesariamente una prueba defectuosa. Las fechas fijas de los fixtures se conservan.

| Archivo:línea (árbol entregado) | Clase | Acción / fundamento |
|---|---|---|
| backend/test/dashboard.postgres.integration.ts:109 | a | Reloj Date simulado y ventas en ese instante. Matriz: 15 noviembre al mediodía, primer minuto del 15 noviembre y del 1 enero. Restar un minuto podía registrar las ventas en ayer. |
| backend/test/cxc-cxp-balance.postgres.integration.ts:142 | a | Fija 15 noviembre 2026; la deuda de enero permanece vencida y la relativa a +3 días permanece por vencer. |
| backend/test/estado-cuenta-cliente.postgres.integration.ts:125 | a | Fija 15 noviembre 2026 para las cuentas históricas vencidas/vigentes. |
| backend/test/garantias.postgres.integration.ts:378 | a | Fija 15 noviembre 2026 al contrastar garantía de 2025 vencida y garantía vigente. |
| backend/src/operaciones/compras-proveedores.spec.ts:478 | a | Fija 15 noviembre 2026 para la expectativa de deuda de 2025 vencida; restaura reloj tras cada prueba. |
| backend/src/cotizaciones/cotizaciones.service.spec.ts:40 | a | Fija 15 noviembre 2026; no confía en que las cotizaciones de 2099 siempre estén en el futuro. Los casos de zona horaria conservan su reloj específico. |
| frontend/e2e-real/garantias-real.spec.ts:67 | a | El estado deja de ser siempre VIGENTE: se deriva del vencimiento persistido y del día de Tegucigalpa del servidor PostgreSQL temporal. Se acota la recarga por si cruza medianoche. page.clock no cambia el reloj de la API. |
| frontend/e2e/contabilidad-simulado.spec.ts:331 | a (refuerzo de corrección existente) | Dos regresiones adicionales cambian page.clock a noviembre y enero, comprueban período y nombre de Excel de octubre/diciembre. |
| backend/test/contabilidad.postgres.integration.ts:342 | a ya corregida en base | La expectativa del mes en curso se calcula con la fecha actual en Tegucigalpa; conservada. No se modificó este archivo. |
| frontend/e2e/contabilidad-simulado.spec.ts:44 | a ya corregida en base | Reloj fijo de octubre para fixtures y nombres de septiembre; conservado. |
| backend/test/reportes-zona-horaria.postgres.integration.ts:200 | b | Ya simula el reloj; las fechas de borde son el objetivo de la prueba. |
| backend/test/compras.postgres.integration.ts:344 | b | El instante de referencia se pasa explícitamente al servicio. |
| frontend/test/contabilidad-ui.test.mjs:71 | b | Período anterior con argumento explícito; no usa hoy del host. |
| frontend/e2e-real/contabilidad-real.spec.ts:86 | b | Consulta PERIODO explícito y nombre de archivo del mismo período. |
| frontend/e2e-real/seed.cjs:59 | b | Ventas históricas sintéticas utilizadas por las expectativas de garantía; no cambiadas. |
| resto del CSV | b | Datos sintéticos, instantes explícitos/ya simulados, intervalos relativos, identificadores o tiempos de espera. No cambiar por aparecer una fecha. |

No se confirmó ningún hallazgo de clase c (defecto del producto). La comparación de fecha de garantías es comportamiento correcto: lo defectuoso era esperar VIGENTE para siempre.

## Ejecuciones reales

Todos los comandos finalizaron con código 0 salvo los intentos expresamente indicados. Los logs completos permanecen en `work/` local, fuera de los commits.

| Comando / directorio | Resultado |
|---|---|
| backend: `npx vitest run` (base) | 78 archivos, 842 aprobadas, 0 fallidas; 38.59 s |
| frontend: `npm test` (base) | 591 aprobadas, 0 fallidas; 29.27 s |
| backend: `npx vitest run` (final) | 78 archivos, 842 aprobadas, 0 fallidas; 58.73 s |
| frontend: `npm test` (final) | 591 aprobadas, 0 fallidas, 0 omitidas; 41.19 s |
| frontend: `npm run lint` (final) | 0 errores, 123 avisos; código 0 |
| frontend: `VITE_API_URL=/api npm run build` | TypeScript y build correctos; Vite 1.40 s |
| backend: `PG_BIN=... npx vitest run --config vitest.config.integration.ts test/dashboard.postgres.integration.ts test/estado-cuenta-cliente.postgres.integration.ts test/cxc-cxp-balance.postgres.integration.ts test/garantias.postgres.integration.ts` | PostgreSQL 17.11 temporal; 4 archivos, 69 aprobadas, 0 fallidas; 14.60 s |
| frontend: `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npx playwright test e2e/contabilidad-simulado.spec.ts --project=chromium --workers=2` | 19 aprobadas, 0 fallidas; 25.3 s |
| frontend: `PG_BIN=... PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium bash e2e-real/run.sh garantias-real.spec.ts --project=chromium` | Migraciones y deriva correctas en clúster temporal; API real; 11 aprobadas, 0 fallidas; Playwright 19.3 s |
| frontend: `npx oxlint e2e-real/garantias-real.spec.ts` | 0 errores, 0 avisos |
| `git diff --check` | Código 0 |

PG_BIN utilizado: `/workspace/FerreSystem/work/pg/root/usr/lib/postgresql/17/bin`. PostgreSQL se extrajo de los paquetes Debian oficiales en work/, sin instalación privilegiada. Las cuatro suites crean y eliminan sus propios clústeres. No se usan URLs externas ni bases reales.

## Contrapruebas e incidencias

- Dashboard: conservando el reloj simulado, se restauró temporalmente `new Date(Date.now() - 60 * 1000)` solo en el test. Resultado: 2 fallidas (medianoches), 1 aprobada (mediodía), 14 omitidas por filtro, código 1. Tras restaurar la corrección: 69/69 en las cuatro suites. Ninguna mutación de producto.
- Garantías real: primer intento con el selector nuevo anclado falló porque la etiqueta contiene espacios/icono: 1 fallida y 10 sin ejecutar. Corregido el selector; repetición completa 11/11. No se cambió el comportamiento de producto.
- Descarga de Chromium oficial 1243: rechazada por política de red, HTTP 403 Domain forbidden para cdn.playwright.dev. Pruebas ejecutadas con Chromium 151.0.7922.173 instalado, no con la revisión oficial de Playwright.
- El primer intento de instalación privilegiada de PostgreSQL no pudo arrancar: sudo no existe. Se resolvió mediante extracción local de paquetes oficiales.
- Consultar PR mediante gh fue rechazado por la API: `Post https://api.github.com/graphql: Forbidden`. No se abrió ni modificó ningún PR.

## Límites

No se ejecutaron la integración PostgreSQL completa ni todo e2e/e2e-real: se ejecutaron completos los archivos PostgreSQL y Playwright modificados. No se verificaron navegador oficial 1243, WebKit, dispositivos físicos ni despliegues. Las nuevas simulaciones de noviembre/enero verifican Dashboard y Contabilidad; Garantías real conserva el reloj de la API y calcula su expectativa a partir del día del servidor.
