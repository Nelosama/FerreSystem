# FARO — Validación independiente de DEF-01 (PR #146) — 2026-10-11

**PR:** #146 `claude/guardian-def01-offline` (`d62dd4a2`) · **Base:** `nexus/integracion-temp` (`e8b75ae6`)
**Rama de validación:** `nexus/faro-validacion-def01` = PR #146 + suite independiente + corrección de `balance-real` (ver §8).
**Implementación:** GUARDIAN · **Validación:** FARO (auditoría QA independiente).
Sin cambios de código de producción, sin merge, sin despliegue y sin migraciones.

## 1. Recomendación

**NO MERGE (todavía).**

El fix de DEF-01 resuelve su defecto: en las pruebas pre/post, los escenarios de venta de productos no aprobados, precio cero y aprobación posterior pasan de FAIL en la base a PASS en el PR, y no aparece ninguna regresión en la integración PostgreSQL (526/526) ni en el E2E real.

Pero el propio cambio introduce un riesgo de activación que hoy no tiene salida (**R-01, P0**), y la auditoría encuentra un defecto P1 preexistente que el PR no corrige (**DEF-04**). Pasar a MERGE sin cerrarlos dejaría ventas offline en curso bloqueadas al desplegar.

**Condiciones para cambiar a MERGE:** §6.1 y §6.2. **Condiciones para activar la contingencia en producción:** §7.

## 2. Escenarios: PASS / FAIL / BLOCKED

Entorno: backend NestJS compilado, PostgreSQL 16 temporal y frontend real. Cada escenario compara la base antes y después (ventas, movimientos de caja, stock, numeración, auditoría).

| # | Escenario | Base `e8b75ae6` | PR `d62dd4a2` | Evidencia |
|---|---|---|---|---|
| 1 | Producto pendiente no entra al catálogo; su operación no produce venta ni efecto | FAIL | **PASS** | `faro-validacion-def01.spec.ts` · «producto pendiente…» |
| 2 | Precio cero heredado con aprobación previa: fuera del catálogo; sin venta | FAIL | **PASS** | «precio cero heredado…» |
| 3 | Aprobación posterior no valida la venta en curso; REINTENTAR y ACEPTAR tampoco la aplican; control: ventana posterior sí aplica | FAIL | **PASS** | «aprobación posterior…» |
| 4 | **R-01** Ventana emitida antes del cambio: bloqueada sin salida automática | FAIL (en la base la venta se aplica) | **PASS (documenta el riesgo)** | «RIESGO-ACTIVACION R-01…» |
| 5 | Aprobación revocada (cambio de precio) tras emitir: se aplica con revisión `APROBACION_REVOCADA_POSTERIOR` | FAIL (sin conflicto) | **PASS (diseño, riesgo P2)** | «aprobación revocada…» |
| 6 | Envío concurrente de la misma operación: una venta, un movimiento de caja, una numeración, stock −1 | PASS | PASS | «envío concurrente…» |
| 7 | Misma secuencia local con otro UUID: `SECUENCIA_DUPLICADA`, sin efecto | PASS | PASS | «misma secuencia…» |
| 8 | Payload alterado con el mismo UUID: `OPERACION_ALTERADA`, no se aplica | PASS | PASS | «payload alterado…» |
| 9 | Dos ventas por el último producto: una aplica (con `CUPO_EXCEDIDO`), otra revisión por `STOCK_INSUFICIENTE`; stock final 0 | PASS | PASS | «dos ventas offline…» |
| 10 | I-01: ACEPTAR sobre faltante aplica con `AJUSTE` + `ENTREGA` trazables; stock neto 0, nunca negativo | PASS | PASS | «I-01…» |
| 11 | **R-02** Cierre manual de una operación bloqueada: `RESUELTA_MANUAL`, sin venta ni movimiento de caja | FAIL (409: ya aplicada) | **PASS (documenta el riesgo)** | «RIESGO-ACTIVACION R-02…» |
| 12 | Rechazo no consume numeración: la siguiente venta en línea es consecutiva | PASS | PASS | «numeración…» |
| 13 | Aislamiento: la empresa B no usa la ventana, el dispositivo ni los productos de A; no resuelve operaciones de A | PASS | PASS | «la empresa B…» |
| 14 | **DEF-04** Cajero B cobra en la caja de A con la ventana de A | **FAIL** | **FAIL** | «DEF-04…» |
| 15 | **DEF-03** `POST /ventas` sin `solicitudId` debe rechazarse | **FAIL** | **FAIL** | «DEF-03…» |
| — | `balance-real` (6 pruebas) | FAIL (1) | FAIL (1) sin corrección · **PASS 6/6 con corrección** | §5 |
| — | Integración PostgreSQL completa | — | **526 PASS, 1 omitida (34/34)** | Base: 517 + 1 |
| — | E2E real completa (con el PR, ejecución previa a DEF-04 e I-01) | — | **108 PASS, 2 FAIL (DEF-03 preexistente), 10 omitidas** | Ver §4 |

**BLOCKED:** ninguno de los escenarios pedidos quedó bloqueado. Quedan **fuera de alcance**, sin prueba propia aquí: Windows, Safari y PWA instalada; apagón eléctrico real; cuota de almacenamiento real del dispositivo; y latencia real de tienda (mismas exclusiones que el piloto).

## 3. Hallazgos

### 3.1 Defectos reproducibles

**DEF-04 — Cobro en la caja de otro cajero con la ventana ajena (P1, preexistente)**
- **Reproducción:** `DEF-04: un cajero no puede cobrar en la caja de otro usando la ventana ajena`. Cajero A pide la ventana; cajero B envía una operación válida (`cajeroId = B`) usando esa ventana.
- **Resultado observado, idéntico en base y PR:** `estado = APLICADA`; `ventas.caja_id = caja de A`; el movimiento de caja tiene como `usuario_id` a B. El cobro de B entra al arqueo de A.
- **Causa raíz:** `procesarOperacion` valida que el remitente sea el `cajeroId` declarado (`contingencia.service.ts:271`), pero busca la ventana solo por `id/tenant/dispositivo` (`:275`). La `cajaId` se toma de la ventana (`:290`), no del cajero que la envía. El test existente «un cajero no puede enviar operaciones de otro cajero» cubre un remitente distinto del `cajeroId`, no este caso.
- **Impacto:** cajas que no cuadran en el arqueo; atribución incorrecta del cobro; el dispositivo de contingencia suele compartirse en tienda.
- **Corrección propuesta (no implementada):** exigir `ventana.usuarioId === dto.cajeroId` (o la caja de la ventana abierta por el cajero que envía) y rechazar con conflicto DURO no superable. Añadir prueba PG.
- **Responsables:** **ATLAS** (contingencia). FARO verifica el cierre.

**DEF-03 — `POST /ventas` acepta venta sin `solicitudId` (P2, preexistente, fuera de DEF-01)**
- Igual que en la auditoría anterior: `create-venta.dto.ts:33-35` (`@IsOptional`); `ventas.service.ts:142`. Falla también en la base. Sin cambios en el PR.

### 3.2 Riesgos de activación y de integridad

**R-01 — Ventanas emitidas antes del despliegue quedan bloqueadas sin salida (P0 para activación)**
- **Hecho:** las instantáneas anteriores al cambio no tienen `precioAprobado`. Cada línea produce `PRECIO_SIN_APROBACION`, que es DURO y **no superable**: ni ACEPTAR ni REINTENTAR la aplican (`contingencia.service.ts:425`, `:445`). Verificado en el escenario 4: la venta queda en `REVISION|true` y el efectivo cobrado no entra a caja ni a ventas.
- **Por qué es P0:** en el despliegue, cada cajero con una ventana en curso acumula ventas que no pueden aplicarse. Solo queda `CERRAR_MANUAL` (ver R-02).
- **Mitigación existente:** ninguna en código. El PR la menciona como «reemitir ventanas antes de activar», pero no lo impone.
- **Corrección propuesta:** antes de activar, invalidar las ventanas anteriores (marcarlas revocadas o expiradas en la migración de despliegue) para que el equipo reciba una ventana nueva, **y** rechazar en la recepción, con 4xx, las operaciones de instantáneas sin prueba, para que el cajero lo vea de inmediato y no lo acumule.

**R-02 — Cierre manual deja el efectivo cobrado fuera de caja y de ventas (P1)**
- **Hecho:** `CERRAR_MANUAL` pasa a `RESUELTA_MANUAL` sin venta ni movimiento de caja (`contingencia.service.ts:527-533`). Verificado en el escenario 11: la operación cerrada no genera `ventas` ni `movimientos_caja`.
- **Impacto:** el dinero físico cobrado no aparece en el arqueo; solo queda la auditoría.
- **Corrección propuesta:** exigir un movimiento de caja de conciliación (`INGRESO_MANUAL` con referencia a la operación) al cerrar manualmente, o bloquear el cierre de operaciones con efectivo.

**R-03 — La revocación de aprobación no se aplica a ventas offline ya emitidas (P2, diseño)**
- **Hecho:** `APROBACION_REVOCADA_POSTERIOR` es BLANDO: la venta se aplica con revisión (escenario 5).
- **Riesgo:** un precio revocado por razones de control se sigue vendiendo offline.
- **Recomendación:** decidir con el propietario; si se quiere bloquear, pasar a DURO.

**I-01 — Override administrativo de faltante (P3, observación)**
- El ACEPTAR sobre `STOCK_INSUFICIENTE` registra `AJUSTE` +faltante y luego `ENTREGA`. Neto 0, trazable, sin stock negativo (escenario 10). Correcto por diseño; se deja registrado como decisión auditada.

**Cambio de criterio en conflictos:** `PRODUCTO_FUERA_DE_VENTANA` pasa de BLANDO a DURO. Un producto añadido después de emitir la ventana ya no puede venderse offline hasta reemitirla. Coherente con el objetivo, pero debe comunicarse a operación.

## 4. Regresiones y compatibilidad

- **Integración PostgreSQL:** 34/34 archivos, 526 PASS, 1 omitida con el PR; 517 + 1 en la base. Las nueve pruebas nuevas pasan y los módulos de KARDEX, ATLAS, BALANCE, FORJA y CENTINELA no muestran regresiones.
- **E2E real completa con el PR:** 108 PASS, 2 FAIL (DEF-03 en dos suites, preexistente), 10 omitidas. Sin regresiones de contingencia offline (14/14 `contingencia-real`), compras, precios ni balance.
- **Tratamiento de ventanas antiguas:** R-01 (sección 3.2).
- **Efectivo cobrado:** R-02 (sección 3.2).
- **Cambios integrados de KARDEX y ATLAS:** `construirCatalogo` usa `precioAprobado` del modelo de KARDEX; `aplicar` mantiene la numeración, la caja y el movimiento de stock de ATLAS. Sin conflicto de compatibilidad detectado.

## 5. Causa raíz de `balance-real`

- **Síntoma:** `balance-real.spec.ts:62`, `Expected "30", Received "29"`.
- **Preexistente:** falla igual en la base `e8b75ae6` (mismo mensaje). No la introduce el PR.
- **Causa raíz:** la aserción calcula `vencimiento::date - created_at::date`. `created_at` se guarda en **UTC**; el vencimiento se calcula en el **día de negocio** (`diaCalendario`, `backend/src/common/zona-horaria.ts:22`, más el plazo). Desde las 18:00 de Tegucigalpa, la fecha UTC ya es el día siguiente, y la diferencia da 29 aunque el servidor calcule 30 días de negocio. Verificado: a las 19:48 locales (01:48 UTC del 11), la fecha UTC es 11 y la de negocio es 10.
- **Por qué pasó antes:** la prueba solo acertaba antes de las 18:00 locales; la ejecución del 10 de octubre pasó por la hora del día.
- **Corrección de la prueba:** comparar en la zona de negocio (`(created_at AT TIME ZONE 'UTC' AT TIME ZONE 'America/Tegucigalpa')::date`). Aplicada en la rama de validación: **6/6 PASS**. Es corrección de test, no de producción.

## 6. Condiciones obligatorias

### 6.1 Para MERGE de DEF-01
1. R-01 mitigado con código: invalidación de ventanas anteriores en el despliegue, y rechazo temprano de operaciones sin prueba de aprobación.
2. DEF-04 corregido con prueba PG (cajero B no puede usar la ventana de A).

### 6.2 Para integrar sin regresiones
3. Quitar el `test.fail` de DEF-03 en la suite QA y corregir DEF-03.
4. Aplicar la corrección de `balance-real` (§5) en la rama de BALANCE, o aceptarla desde esta rama.

## 7. Condiciones obligatorias para activar la contingencia en producción

1. Ninguna ventana emitida antes del despliegue sigue activa (invalidación o reemisión, comprobada en la base).
2. Procedimiento de cierre manual con registro en caja (R-02) y firma del responsable de caja.
3. DEF-04 cerrado: una ventana solo puede usarla el cajero que la pidió.
4. Decisión del propietario sobre R-03 (aprobación revocada offline) y sobre la semántica de entrega de venta offline (riesgo R4).
5. Prueba de humo en una copia de los datos reales, incluida la migración de precios y la ventana de contingencia.
6. Confirmación de la protección de despliegue de Vercel y Render (no verificada desde el repositorio).

## 8. Archivos y ramas

| Elemento | Ubicación |
|---|---|
| Suite de validación: 15 pruebas (13 PASS, 2 FAIL: DEF-04 y DEF-03) | `frontend/e2e-real/faro-validacion-def01.spec.ts` (**nuevo**) |
| Corrección de `balance-real` (test) | `frontend/e2e-real/balance-real.spec.ts` (**1 línea**) |
| Este informe | `docs/FARO_VALIDACION_DEF01_20261011.md` (**nuevo**) |
| Código auditado (sin cambios por FARO) | `backend/src/contingencia/contingencia.service.ts`, `backend/test/contingencia.postgres.integration.ts` |

**Cómo reproducir**

```bash
cd frontend
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome \
  bash e2e-real/run.sh e2e-real/faro-validacion-def01.spec.ts
bash e2e-real/run.sh e2e-real/balance-real.spec.ts
# Pre-fix: el mismo archivo contra el commit e8b75ae6 (worktree) reproduce los 8 FAIL de la base.
```

Requisito: `npx prisma generate` en `backend` para la rama que se pruebe (el cliente debe reflejar `precioAprobado`).

## 9. Lo que no se verificó

- Que las ventanas en producción correspondan a instantáneas de formato anterior: depende del estado real de la base de producción, no consultado.
- Comportamiento con varios dispositivos por empresa: el sistema usa `dispositivosMax=1`.
- Latencia y reconexión reales: cubiertas por la suite de contingencia existente, no en esta validación.

_Firmado: FARO (validación independiente). Ningún cambio de código de producción; sin merge, despliegue ni migración._
