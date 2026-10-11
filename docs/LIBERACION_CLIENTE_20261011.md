# Liberación al cliente — decisión, bloqueantes y plan (2026-10-11)

SHA candidato: **`95144a17`** (rama `claude/h5-identidad-operacion-a`, PR #153, borrador). Estado: **NO-GO**. Este documento no autoriza merge, despliegue ni migraciones; deja la decisión y el plan listos. Evidencia reproducible: Issue #151. **No contiene ningún valor secreto.**

## 1. Informe ejecutivo

| Elemento | Resultado |
|---|---|
| CI de GitHub sobre `95144a17` | **PASS** (`validate`, `test`, `guard-base-datos`, Vercel) |
| Auditorías independientes (CENTINELA y FARO) sobre `95144a17` | **PENDIENTE** — solicitadas, sin respuesta |
| Migraciones | **PENDIENTES**: `20261017000000` sin revisión de NEXUS/CODEOWNERS; `20261011150000` sin inspección de solo lectura |
| Configuración de producción | **INCOMPLETA** — no verificable desde esta sesión (sin acceso a Render/Supabase/Vercel); `CONTINGENCIA_CLAVE_OPERACIONES` sin definir en ningún entorno real |
| Operación comercial básica (entorno aislado, PostgreSQL real) | **PASS** en los 10 pasos (ver §4), con 3 funciones **no implementadas** (§3, P1/P2) |
| Respaldos y recuperación | **PENDIENTES en producción**; **procedimiento VERIFICADO en entorno aislado** (§5) |
| **Estado final** | **NO-GO** |

**Qué impide entregar hoy (y la corrección mínima):** no es el código del flujo comercial — funciona de extremo a extremo en pruebas reales — sino cinco condiciones de **entorno y aprobación** que solo pueden cerrar personas con acceso (§2). La más larga es integrar a `main`, que hoy no contiene ni la contingencia ni las entregas ni la caja (13 migraciones en `main` frente a 24 en el candidato): cualquier despliegue desde `main` exige antes un merge autorizado por usted.

## 2. Clasificación de pendientes

### P0 — Bloqueantes (impiden desplegar en el cliente)

| # | Pendiente | Por qué es P0 | Corrección mínima | Quién |
|---|---|---|---|---|
| 1 | **Respaldos automáticos no configurados en producción y sin restauración verificada allí** | El sistema maneja dinero e inventario y las migraciones reescriben datos históricos (reparto de entregas). Sin copia reciente no hay marcha atrás | Activar los respaldos de Supabase (o `pg_dump` programado), tomar una copia manual justo antes del despliegue y restaurarla una vez en una base de prueba. El procedimiento ya está validado en aislado (§5) | Propietario / responsable de Supabase |
| 2 | **`CONTINGENCIA_CLAVE_OPERACIONES` no definida en Render** | El backend **no arranca** sin ella (mensaje controlado y código 1) | Crear una variable nueva en Render con un valor aleatorio de ≥ 32 caracteres, distinto de `JWT_SECRET` y no copiado de otro entorno (`docs/CONTINGENCIA_CLAVE_OPERACIONES.md`) | Propietario / responsable de Render |
| 3 | **Migración `20261011150000`: dos contenidos con el mismo nombre** | Si algún entorno aplicó la otra versión, `migration-safe` detiene el arranque con `CHECKSUM_DISTINTO` (falla segura, pero el servicio no levanta) | Ejecutar `backend/scripts/inspeccion-solo-lectura-migracion-20261011150000.sql` (solo SELECT) en cada entorno existente y pegar el resultado. Si ninguno la aplicó, no hay acción más (plan: `docs/PLAN_RECONCILIACION_MIGRACION_20261011150000.md`) | Quien tenga acceso a la base |
| 4 | **Migración `20261017000000` sin revisión** (reemplaza un CHECK de la tabla del diario de contingencia; lleva la marca `CONT-1017 @Nelosama`) | El guard de CI exige revisión del CODEOWNER para cualquier `DROP`. **El CODEOWNER de `/backend/prisma/` es usted (@Nelosama)**: la aprobación humana de CODEOWNERS la puede dar usted en el PR; NEXUS es un agente sin canal confirmado | Aprobar (o rechazar) la migración en el PR #153 tras leer `docs/NEXUS_SOLICITUD_REVISION_F5_20261017.md`; si quiere la opinión de NEXUS, hay que contactarlo por un canal real | Propietario |
| 5 | **Integración a `main` y autorización de despliegue** | `main` no contiene el candidato; Render y Vercel despliegan desde la rama configurada (no verificable aquí) | Decisión expresa suya: merge del candidato (o apuntar un entorno de preproducción a la rama) | Propietario |
| 6 | **Auditoría independiente de CENTINELA y FARO sobre `95144a17`** | Cinco rondas de auditoría adversarial encontraron defectos reales (texto que rompía el lote, identificadores, concurrencia). Sin una auditoría sobre el SHA final no puede decirse «nada se escapó» | Que CENTINELA y FARO respondan en el Issue #151. **Alternativa suya:** salir primero con la contingencia **apagada** (ver §6) y exigir la auditoría solo antes de habilitarla | Propietario decide; CENTINELA/FARO ejecutan |

### P1 — Importantes (no bloquean el arranque, requieren decisión o prueba)

| # | Pendiente | Alternativa segura hoy |
|---|---|---|
| 7 | **Entrega parcial de una venta no está implementada** (`docs/POS_VENTA_ENTREGA_DECISION.md` deja la decisión al propietario) | Entregar completa o dividir la venta. Si la ferretería entrega en varios viajes con frecuencia, es P0 operativo: usted decide |
| 8 | **Safari/iPhone, impresión de comprobantes, lector físico de códigos y corte de red real: no probados** (solo hay Chromium en este entorno) | Emulación móvil en Chromium aprobada (§4). Probar en los equipos reales de la ferretería antes del primer día |
| 9 | **Plan de reversión de código no verificado:** que el backend anterior funcione contra la base ya migrada no se ha probado | Reversión real = restaurar la copia previa (P0 #1). Desplegar fuera de horario de ventas |
| 10 | **Producción de Render/Supabase sin verificar** (`TRUST_PROXY`, `NODE_ENV`, claves demo, orígenes CORS) — pendientes heredados en `docs/agentes/BLOQUEOS_REALES_REQUIEREN_ACCESO.md` | Lista de comprobación en §6 |

### P2 — Posponibles (no impiden la operación inicial)

- **Vuelto en el POS en línea:** el sistema cobra y registra el total; el cálculo del cambio solo existe en el POS de contingencia. Alternativa: el cajero calcula el cambio; la caja concilia por totales. Conviene decidir si se implementa antes del uso diario porque afecta a todas las ventas en efectivo.
- Referencia de autorización del datáfono; reporte por cajero; canal web; respuesta tardía del POS (pruebas omitidas, funciones sin implementar).
- Prueba 3 de contingencia lenta bajo carga (4 de 15 ejecuciones ~34 s, causa sin probar); `productos-edicion.spec.ts:155` intermitente 1 vez en 4 ejecuciones completas (módulo no tocado; 3 de 3 en aislado).
- Un administrador que declara un cajero distinto del dueño de la caja produce una fila que el cierre manual con efectivo no puede cerrar (caso raro, solo contingencia).
- `backend/test/app.e2e-spec.ts` (plantilla de Nest) rota y fuera de CI.

## 3. Hallazgos de las pruebas de esta ronda

- **Ningún defecto de producto** en el ciclo comercial.
- Dos errores de **mi** instrumentación, corregidos y documentados: la comprobación de sesiones en el simulacro (la sesión nueva tras reiniciar es legítima) y el selector móvil de la auditoría.

## 4. Validación del negocio (PostgreSQL real aislado; nada productivo)

Entorno: `frontend/e2e-real/run.sh` (PostgreSQL 16 temporal, `prisma migrate deploy`, backend `dist/main`, frontend compilado, Chromium). `e2e-real` completa sobre `aa084142`: **119 aprobadas / 10 omitidas / 0 fallos**; con la prueba nueva de esta ronda (`historial-auditoria-real.spec.ts`, 5/5) incluida en la suite: **124 aprobadas / 10 omitidas / 0 fallos**.

| # | Operación | Resultado | Evidencia (archivo › prueba) |
|---|---|---|---|
| 1 | Inicio de sesión de administrador y cajero | **PASS** | `inicio-roles` (2), `faro-auditoria-integral` matriz de roles (1), todos los `login` de las suites |
| 2 | Registro y consulta de productos | **PASS** | `inventario-interfaz-real` (alta desde la pantalla, persistencia en PostgreSQL), `precios-real`, `faro-auditoria-integral` §2 (3) |
| 3 | Levantamiento / ajuste de inventario | **PASS** | `negocio-ciclo-real` 1 (alta con existencias, ajuste con `stockAnterior`, ajuste obsoleto 409), `inventario-interfaz-real` |
| 4 | Consulta de existencias y precios | **PASS** | `precios-real`, `faro-auditoria-integral` §2 (precio aprobado, producto pendiente fuera del catálogo) |
| 5 | Venta de contado | **PASS** | `qa-ciclo-venta` 1.1 (total con ISV 15 %, stock reservado) y 14.1/14.2 (POS en pantalla, doble clic = una venta) |
| 6 | Registro del cobro | **PASS** | `qa-ciclo-venta` 1.1 (movimiento de caja `VENTA_POS`), `caja-interfaz-real` |
| 7 | Confirmación de entrega | **PASS** (entrega **completa**) | `cobro-entrega-real`, `qa-ciclo-venta` 12.1 (el cajero no puede; el administrador sí; repetir no duplica). Entrega parcial: **no implementada** (P1 #7) |
| 8 | Actualización del inventario | **PASS** | `qa-ciclo-venta` 12.1 (descuenta una sola vez, libera reserva), simulacro §5 (stock 20 → 17 tras vender 3 y entregar) |
| 9 | Cierre y conciliación de caja | **PASS** | `caja-interfaz-real` (abrir, cobrar, cerrar desde la pantalla y verificar), `qa-ciclo-venta` 15.1, `negocio-ciclo-real` 3 (cierre sin diferencia; reintento rechazado) |
| 10 | Historial de ventas y auditoría | **PASS** | **Nueva** `historial-auditoria-real` (5/5): la venta aparece en el historial con total y método; la auditoría registra `VENTA_CREAR` (cajero) y `VENTA_ENTREGAR` (administrador); la API y la pantalla son solo del administrador; escritorio y 390 px sin desbordamiento; el cajero ve «Acceso Denegado» |

**Dispositivos:** emulación móvil táctil en Chromium (Pixel 7) sobre caja, inventario, compras, auditoría, clientes, inicio, cobro/entrega, precios, garantías y ciclo de venta: **58 aprobadas / 5 omitidas conocidas / 0 fallos** (`PW_CONFIG=playwright.real.mobile.config.ts bash frontend/e2e-real/run.sh <archivos>`). **No** es Safari ni un iPhone real (BLOQUEADO en este entorno).

## 5. Simulacro de recuperación (entorno aislado) — `backend/scripts/simulacro-recuperacion.sh`

14 de 14 PASS: migración desde base vacía con el **mismo comando de producción** (`migration-safe deploy`: 24 migraciones, 0 pendientes) y segunda ejecución idempotente; backend arranca con la clave; caja → producto → venta de contado → entrega (stock físico 17, reservado 0); **reinicio del backend** (vuelve solo, inicio de sesión 200, datos idénticos); `pg_dump -Fc` y `pg_restore --list`; **restauración en base vacía sin errores con datos idénticos** (ventas, total, movimientos de caja, stock, auditoría, usuarios); `migration-safe deploy` sobre la restaurada consistente; backend y sesión sobre la restaurada. **No cubre:** cifrado con restic, destino remoto, retención, ni nada de Supabase real.

## 6. Plan de liberación controlada (para su aprobación; nada se ejecuta sin ella)

**Opción recomendada para salir antes:** primera versión con la **contingencia apagada** (no definir `POS_OFFLINE_ENABLED`; viene apagada por defecto, por empresa y por entorno). El cobro, la entrega, el inventario y la caja no dependen de ella. La clave y la migración F5 siguen siendo necesarias porque el código y el esquema se despliegan. La contingencia se habilita después, empresa por empresa, tras la auditoría de CENTINELA/FARO.

0. **Antes (sin riesgo):** (a) usted aprueba/rechaza las migraciones en el PR (P0 #4); (b) alguien con acceso ejecuta la inspección de solo lectura de `20261011150000` en cada base (P0 #3); (c) definir en Render, **sin escribir valores en ningún documento**: `DATABASE_URL`, `DIRECT_URL` (conexión directa, sin pooler, para migraciones), `JWT_SECRET`, `CONTINGENCIA_CLAVE_OPERACIONES` (nueva, independiente), `NODE_ENV=production`, `FRONTEND_URLS` (orígenes exactos), `TRUST_PROXY` según el número de proxies, `SUPABASE_URL`/`SUPABASE_SERVICE_KEY`; y en Vercel `VITE_API_URL` (URL HTTPS de Render con `/api`); (d) respaldos activos y una restauración de prueba (P0 #1).
1. **Ensayo en preproducción** (una base y un servicio separados de producción): desplegar el candidato, comprobar que `migration-safe` migra, recorrer los 10 pasos de §4 a mano desde una computadora y un teléfono reales, reiniciar el servicio y volver a entrar.
2. **Producción, fuera del horario de ventas:** copia manual → autorización suya de merge → el despliegue del backend **ejecuta las migraciones al arrancar** (`npm run start:prod` = `migration-safe deploy` + `node dist/main`) → vigilar el registro del arranque → desplegar el frontend → recorrido de humo (inicio de sesión, una venta pequeña de contado con entrega, cierre de caja de prueba) → entregar al cliente.
3. **Criterios de marcha atrás** (cualquiera): el servicio no arranca (`CHECKSUM_DISTINTO`, falta de clave), error de migración, inconsistencia de inventario o de caja en el recorrido de humo. Acción: frontend → «Instant Rollback» a la versión anterior de Vercel; backend → volver a desplegar la versión anterior **solo si** el recorrido de humo confirma que funciona con la base migrada (no verificado, P1 #9); datos → restaurar la copia previa. Toda venta posterior a la copia se pierde: por eso el despliegue va fuera de horario y con la caja del día cerrada.
4. **Después:** monitoreo diario las primeras semanas, auditoría de CENTINELA/FARO, y solo entonces habilitar la contingencia en una empresa piloto.

## 7. Decisiones que solo usted puede tomar

1. ¿Aprueba (como CODEOWNER) la migración `20261017000000`?
2. ¿Autoriza el merge a `main` y el despliegue, y con qué ventana?
3. ¿Sale primero con la contingencia apagada, o espera la auditoría de CENTINELA/FARO?
4. Entrega parcial: ¿la ferretería la necesita desde el primer día?
5. Vuelto en el POS en línea: ¿antes del primer día o después?
