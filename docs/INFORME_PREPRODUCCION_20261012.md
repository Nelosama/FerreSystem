# Informe ejecutivo — preparación de preproducción y entrega piloto (2026-10-12)

Candidato congelado: **`95144a17`** (PR #153). Esta rama (`claude/preproduccion-entrega`) parte de la rama de evidencias (`708c5511`) y **no cambia ni una línea de código de aplicación** (`git diff 95144a17 -- backend/src frontend/src` vacío): solo scripts de despliegue/arranque, pruebas y documentación. Estado: **NO-GO** hasta la autorización expresa del propietario. Sin merge, sin despliegue, sin migraciones productivas, sin secretos.

## Resumen por componente

| Componente | Estado | Bloqueante | Acción necesaria |
|---|---|---|---|
| **Migraciones** | Analizadas (SQL real, datos tocados, error, doble ejecución, recuperación) y ensayadas en aislado. **No aprobadas** (no me corresponde) | `20261017000000` sin aprobación de CODEOWNERS (@Nelosama) · `20261011150000`: falta saber si algún entorno aplicó la variante alterna | Propietario aprueba/rechaza `20261017000000` en el PR #153. Alguien con acceso ejecuta `estado-base-solo-lectura.sql` en cada base |
| **Arranque que migra** | **RESUELTO en el repositorio.** `start:prod` ya no migra: verifica y, si la base no coincide, no arranca y no escribe (probado). La migración es un paso explícito (`npm run migrate:deploy`) | — | Revisar en el panel de Render cuál es el Start Command real y que no haya Pre-Deploy Command |
| **Respaldos** | **Procedimiento ejecutable y VERIFICADO en aislado** (respaldo → legibilidad → restauración → conteos de todas las tablas → ensayo de migración en la copia → arranque del backend). En producción: **sin configurar** | Respaldos automáticos de producción sin configurar ni restauración probada allí | Activar respaldos de Supabase (según el plan) + copia manual inmediata antes de migrar + una restauración de prueba |
| **Render** | Variables inventariadas desde el código; procedimiento escrito. **Sin acceso: no verificado** | Falta `CONTINGENCIA_CLAVE_OPERACIONES`; comprobar `NODE_ENV=production`, `TRUST_PROXY`, `FRONTEND_URLS` | Configurar según `docs/RUNBOOK_PREPRODUCCION_Y_PRODUCCION.md` §1-2 |
| **Supabase** | Solo se usa como PostgreSQL (el código **no lee** `SUPABASE_URL`/`SUPABASE_SERVICE_KEY`). **Sin acceso: no verificado** | Respaldos (arriba); `DIRECT_URL` debe ser conexión directa/session pooler | Confirmar plan y respaldos; separar un proyecto de preproducción |
| **Vercel** | `vercel.json` correcto; el despliegue de vista previa del candidato está «Ready». **Sin acceso a las variables** | `VITE_API_URL` por entorno (la vista previa no debe apuntar a producción) | Configurar `VITE_API_URL` y el dominio; sumarlo a `FRONTEND_URLS` |
| **Seguridad** | `CONTINGENCIA_CLAVE_OPERACIONES`: obligatoria ≥ 32, rechaza ser igual a `JWT_SECRET`, sin valores por defecto, error claro y sin valores, **no aparece en ningún registro ni salida** (probado); contingencia **desactivada** salvo autorización (probado). **Riesgo hallado:** con `NODE_ENV` distinto de `production`, `JWT_SECRET` usa un valor de desarrollo **público** | `NODE_ENV=production` obligatorio y verificado en Render | Comprobarlo; definir la clave solo en Render |
| **Operación comercial** | **PASS** en el ensayo de actualización desde el esquema de `main` con datos históricos (24/24) y en las 124 pruebas `e2e-real` | — | Recorrido real en preproducción (humo + checklist) |
| **Equipos reales** | **SIN PROBAR** (iPhone/Safari, impresora, lector, Wi-Fi, corte de internet) | Safari/iPhone y la impresión son indispensables si se usarán el primer día | Ejecutar `docs/CHECKLIST_EQUIPOS_REALES.md` en la ferretería, contra preproducción |

## Evidencia (esta rama, árbol de trabajo idéntico al commit de la entrega)
- **Ensayo de actualización aislado** (`backend/scripts/ensayo-actualizacion-preproduccion.sh`): **24/24 PASS** con esquema de `main` (13 migraciones) + datos históricos: respaldo y verificación en copia; el arranque por defecto **se niega** con 11 migraciones pendientes sin tocar la base; migración explícita a 24; ninguna venta perdida; solo el producto activo con precio queda aprobado; reparto histórico de entregas correcto; arranque en modo producción; humo con escritura 20/20; entrega de la venta histórica pendiente (95 físicas, reserva 5→0); el producto heredado con precio se vende y el que no tiene precio se rechaza; reinicio con datos idénticos; ningún secreto en registros; restauración idéntica al estado previo; el código nuevo **no arranca** sobre el esquema viejo restaurado.
- **Pruebas nuevas**: `migraciones-control-arranque` (14, PostgreSQL real; con control negativo), `estado-base-solo-lectura.test.mjs` (2). **Suites**: `tsc` sin errores; unitarias 40/377; scripts 42/42; guard de migraciones correcto; **PostgreSQL 54 archivos / 879 aprobadas / 1 omitida**.
- **Hallazgos de mi propia instrumentación corregidos**: la siembra no avanzaba el contador de numeración (500 por clave duplicada), la restauración chocaba con `CREATE SCHEMA public`, procesos huérfanos por guardar el PID de una subcapa, y una expectativa de inventario errónea (una venta reserva y solo descuenta al entregarse). Ninguno era defecto del producto.

## Respuestas obligatorias

**1. ¿Qué bloqueantes se resolvieron realmente?**
(a) El riesgo de que un reinicio migre producción: el arranque ya no migra y se niega ante desajuste (probado). (b) Procedimiento de respaldo/restauración/ensayo ejecutable y verificado en aislado. (c) Comprobaciones previas de solo lectura de todas las migraciones, con precondiciones de datos (verificadas contra datos que las incumplen). (d) Análisis completo de las dos migraciones y del conflicto de `20261011150000` (con prueba de que un entorno con la variante alterna queda bloqueado, no corrompido). (e) Configuración y validación de `CONTINGENCIA_CLAVE_OPERACIONES`, y la prueba de que no se filtra. (f) Inventario real de variables (detectó que Supabase no se usa más que como PostgreSQL). (g) Humo de API reutilizable, runbook y checklist de equipos.

**2. ¿Qué bloqueantes requieren su intervención?**
Aprobar o rechazar `20261017000000` (usted es el CODEOWNER); ejecutar o autorizar `estado-base-solo-lectura.sql` en cada base; configurar Render/Supabase/Vercel (no tengo acceso); activar respaldos de Supabase; autorizar el merge a `main` y la ventana de despliegue; decidir si se espera la auditoría de CENTINELA/FARO o se sale con la contingencia apagada; probar en los equipos reales.

**3. ¿Qué debo configurar exactamente en Render y Supabase?**
En Render (`docs/RUNBOOK_PREPRODUCCION_Y_PRODUCCION.md` §1-2): Root `backend`; Build `npm ci --include=dev && node node_modules/prisma/build/index.js generate && npm run build`; Start `npm run start:prod`; **Pre-Deploy vacío**; Health `/api/health`; variables `NODE_ENV=production`, `DATABASE_URL`, `DIRECT_URL` (directa), `JWT_SECRET`, **`CONTINGENCIA_CLAVE_OPERACIONES`** (≥ 32 aleatorios, distinta de `JWT_SECRET`), `FRONTEND_URLS`, `TRUST_PROXY=1`; **no** definir `POS_OFFLINE_ENABLED` ni `FERRE_MIGRAR_AL_ARRANCAR`. En Supabase: confirmar plan y activar respaldos; usar la conexión directa/session pooler en `DIRECT_URL`; un proyecto separado para preproducción; no hacen falta claves `anon`/`service_role`.

**4. ¿Qué PRs están listos para revisión?**
El **PR #153** (candidato `95144a17`, sin cambios) y el **PR de preproducción** de esta rama (evidencias + control de despliegue; **cambio de comportamiento a revisar: `start:prod` ya no migra**; requiere CODEOWNERS porque toca `migration-safe.mjs` y `deploy/`). Ambos en borrador; ninguno está aprobado.

**5. ¿Es seguro autorizar un despliegue de preproducción?**
**Sí, con condiciones:** en un proyecto Supabase, un servicio Render y un despliegue Vercel **separados de producción**, con variables y claves distintas y datos de prueba (o una copia que usted autorice), desplegando el código de la **rama de preproducción** (para ensayar el arranque seguro). No es seguro apuntar la preproducción a la base de producción ni reutilizar `JWT_SECRET`/claves.

**6. ¿Qué falta para autorizar producción?**
(1) Preproducción desplegada y recorrida (humo con escritura 20/20, reinicio, checklist de equipos sin FAIL en lo indispensable). (2) Respaldos de producción activos y una restauración probada. (3) Su aprobación de `20261017000000` y el resultado de `estado-base-solo-lectura.sql` en producción sin sorpresas. (4) Variables de Render confirmadas (`NODE_ENV`, clave, `TRUST_PROXY`, `FRONTEND_URLS`). (5) La auditoría independiente de CENTINELA/FARO sobre el SHA final —o su decisión expresa de salir primero con la contingencia apagada—. (6) Su autorización expresa de merge, ventana y despliegue.

## Lo que NO se afirma
Nada se verificó contra Render, Supabase ni Vercel. Ningún equipo real fue probado. La compatibilidad del backend anterior con la base ya migrada no está verificada (la reversión real es restaurar la copia). Ninguna revisión de CENTINELA, FARO ni NEXUS fue recibida.
