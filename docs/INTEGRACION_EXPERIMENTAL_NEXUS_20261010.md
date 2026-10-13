# Rama experimental de integración — NEXUS (actualización 2, 2026-10-10)

**Rama:** `nexus/integracion-temp`. **Firma:** NEXUS. Base **experimental y verificable** para entregar una versión candidata a FARO. **No** se fusiona con `main`, **no** se despliega, **no** ejecuta migraciones contra Supabase y **no** tiene PR (un PR hacia `claude/**` activa CI y vistas previas). Actualización 1: ver historial de Git.

## 1. Seguridad de la publicación

| Riesgo | Estado | Cómo se comprobó |
|---|---|---|
| GitHub Actions | Sin disparo por push | `operacion-ferreteria.yml` corre en PR hacia `main` y `claude/**` y en push a `main`; `playwright.yml` en push/PR de `main`/`master`. 0 ejecuciones para la rama. Abrir un PR hacia `claude/**` sí activaría CI |
| Vercel | **Protegido en el repo, no verificable desde aquí** | `frontend/vercel.json`: `git.deploymentEnabled {"nexus/*": false}` y `ignoreCommand` que omite el build en ramas `nexus/*`. Lógica probada; el propietario debe confirmar en Vercel que no aparece un despliegue |
| Render | **No verificable desde el repositorio** | No hay configuración de Render en el repo; confirmar que despliega solo `main` y que las vistas previas de PR están apagadas |
| Migraciones contra Supabase | Sin disparo | Ningún servicio apunta a esta rama |
| Secretos | Sin hallazgos | Barrido de las líneas añadidas respecto a `main`; solo `.env.example` versionados |

**Antes de abrir cualquier PR de esta rama, el propietario debe confirmar la configuración de Vercel y Render.**

## 2. Commits exactos por agente

Las ramas de los agentes **no se modificaron**; cada una entra por merge o cherry-pick propio.

| Agente | PR / rama | Commit incorporado | Nota |
|---|---|---|---|
| CENTINELA | #139 `centinela-cierre-produccion` | `8a1ddc36810424282f2d17abe28afff4e3feb287` | |
| CENTINELA | #138 `centinela-validacion-produccion` (incluye #137) | `dd19439c77d54d815e03fd5f18c5e46796c991b9` | |
| ATLAS / FORJA | #129 `integracion-pos-offline-p1` (incluye #127, #128) | `c5fe49823e5f77b26c62b8c98f104f97758fa2e4` | |
| FORJA / FARO | `p1-modulos-administrativos` (#130+#131) | `069172623b580b31615863d26c697eaa2ab1b179` | |
| FARO | #136 `hopeful-franklin-hb3n48` | `2cfdf8b9cbe69901d14d65b6d5caefc0d123f23e` | |
| **KARDEX** | `kardex-consolidacion-134-140` (#134+#140) | `f44ec88693d174a3bedf66d864a9bbd59e995b94` | **Sustituye** la combinación parcial. El commit reportado `94675812` es ancestro de esta cabeza; la cabeza tiene un commit más («compras solo ADMIN, legados activos») |
| BALANCE | #135 `conciliacion-pagos-cxc` | `3ee65f5f4d5713baeb1542475793b3efcf65bf1b` | |
| BALANCE | #142 `balance-cxc-cxp` | `3ee6f4e4f267a85e13afa2ce8658acbf66f9b19e` | Incluye `5f974f76` (pruebas de pagos electrónicos con referencia) |
| FORJA | #143 `forja-compras-proveedores` | **solo** `db807c2d36c34e08f5dbe145cb6bfd1aeb195be8` (cherry-pick `1c074578`) | Se excluye el commit `7c0e73b0` de #140 que #143 arrastra y que KARDEX no consolidó |
| NEXUS | #141 `focused-franklin-avfmae` | `087c09f9e766465855e424d9ba3196c2bf412855` | |

**Commits de NEXUS en esta fase** (cada uno aislado y reversible con `git revert`):

| Commit | Qué hace | Dueño que debe confirmar |
|---|---|---|
| `7abf4e88` | Merge de KARDEX; resuelve controlador, locales JSON, listas de migraciones, docs | KARDEX, BALANCE |
| `8397c5b9` | Merge de BALANCE (sin conflictos) | BALANCE |
| `1c074578` | Cherry-pick de FORJA; resuelve `OperacionesPage.tsx` | FORJA |
| `a7b7d012` | Solo pruebas: fixtures con `precioAprobado:true`; expectativas de BODEGUERO | BALANCE, FORJA, CENTINELA |
| `55735b24` | Guarda de costo manual por `ultimaCompraAt` en vez de `costoVigente` | **FORJA y KARDEX** |
| `429ab117` | La búsqueda de ventas conserva `costo_unitario` solo para ADMIN | **KARDEX** |
| `6b88ee0b` | Solo E2E reales: `seed.cjs` crea productos aprobados; casos de `TARJETA` envían `pagoElectronico`. Más docs, matriz multi-tenant y parche de KARDEX | FARO, BALANCE |

## 3. Cadena de migraciones (20)

Las 13 de `main` y 7 nuevas. Ninguna contiene `DROP`, `DELETE` ni `TRUNCATE`.

| # | Migración | Propietario | Riesgo |
|---|---|---|---|
| 14 | `20261010140000_productos_proveedores` | FORJA | Bajo |
| 15 | `20261011000000_pos_contingencia_offline` | ATLAS | Bajo |
| 16 | `20261011150000_precio_aprobacion_producto` | KARDEX | **Medio**: `UPDATE` de `productos` con `activo = true AND precio_venta > 0` (versión de KARDEX; antes sin `activo`). Se aplica sobre datos reales: respaldo y aprobación independiente |
| 17 | `20261012000000_autenticacion_sesiones_intentos` | CENTINELA | Bajo |
| 18 | `20261012000000_conciliacion_pagos_bancarios` | BALANCE | Bajo |
| 19 | `20261013000000_balance_referencia_pagos` | BALANCE | Bajo: columna nullable, `CHECK`, índice único parcial sobre columna nueva |
| 20 | `20261014000000_cliente_plazo_credito` | BALANCE | Bajo |

El orden completo se aplica con `prisma migrate deploy` sin error. Las 17 y 18 comparten el prefijo `20261012000000`; Prisma las ordena por nombre completo.

## 4. Regla definitiva de costos

**ADMIN consulta costos. CAJERO, BODEGUERO y VENDEDOR no. El backend lo aplica.**

| Punto | Estado | Prueba |
|---|---|---|
| Búsqueda de ventas: ADMIN conserva, CAJERO y VENDEDOR no | Cumple (commit `429ab117`) | `seguridad-fase2` |
| Entregas: BODEGUERO (con o sin `inventario.ver`) no recibe costo | Cumple | `seguridad-fase2` (se actualizó la prueba que exigía lo contrario) |
| Compras con costos: BODEGUERO rechazado, ADMIN sí | Cumple | `compras*`, `sin-costos-bodeguero.http.spec` |
| Alta de producto con precio, costo o margen: BODEGUERO no | Cumple | `productos-security` |
| Ficha, listas, reportes, dashboard, cotizaciones por rol | **No auditado por NEXUS**: no encontré pruebas por rol para reportes, dashboard ni cotizaciones | **Brecha para FARO**: matriz rol × endpoint |

## 5. Regla financiera de pagos a proveedor (BALANCE)

Verificada leyendo `operaciones.service.ts` (`pagar`) y las pruebas; no se eliminó ninguna validación:

| Regla | Cómo se cumple |
|---|---|
| Pago electrónico a proveedor exige referencia | `BadRequestException` si `esMetodoElectronico` y no hay referencia |
| Referencia única por factura y empresa | Comprobación en servicio e índice único parcial `(tenant_id, cuenta_id, referencia)`; se normaliza (recorte y mayúsculas). Una misma referencia en **otra** factura sí se acepta |
| Reintentos no duplican | La comprobación de solicitud repetida va **antes** que la de referencia: el reintento devuelve el pago original. Prueba: «reintentar un pago con la misma solicitud no descuenta dos veces», con referencia |
| Efectivo sin referencia bancaria | `esMetodoElectronico` es falso; el pago se acepta |

La corrección de BALANCE (`5f974f76`) solo añadió referencias a los pagos de prueba (9 inserciones, 9 borrados, ninguna aserción eliminada).

## 6. Evaluación de FORJA (#143)

| Verificación | Resultado |
|---|---|
| Recepción parcial | Cubierta (`compras.postgres`, `compras-cierre`): suma solo lo recibido; el exceso se rechaza |
| Costo vigente | Último costo recibido, sube y baja; sin promedio ponderado |
| Auditoría de costos | `compras-cierre`: costo anterior, nuevo, compra, factura y responsable |
| Factura única por proveedor | Repetida con otras mayúsculas o espacios no genera otra deuda; la misma factura sí puede existir con otro proveedor y otra empresa |
| CXP sin duplicados | Una sola cuenta por pagar por el total, sin cambio al recibir parcialmente |
| Compatibilidad con migraciones de BALANCE | Las 20 migraciones se aplican en orden; `migrate diff` vacío |
| **Conflicto con KARDEX** | La guarda de FORJA «no se edita a mano el costo originado por compra» usaba `costoVigente != null`, pero el alta de producto de KARDEX rellena `costoVigente` con el costo inicial: la guarda bloqueaba productos sin compras y rompía 3 pruebas de KARDEX. Con `ultimaCompraAt` (solo la fija la recepción) pasan las de FORJA y las de KARDEX a la vez. **Pendiente de confirmación de ambos** |

## 7. Conflictos

**Resueltos (mecánicos):** controlador de operaciones (interceptor de KARDEX + rutas de BALANCE + `estado-cuenta` de BALANCE), locales `es.json`/`en.json` (fusión a nivel JSON, formato verificado), listas de migraciones, `OperacionesPage.tsx` (FORJA/BALANCE), `CONTEXTO_MAESTRO.md` (0 líneas perdidas).

**Pendientes:**

| # | Pendiente | Dueño |
|---|---|---|
| 1 | El commit `7c0e73b0` de #140 («no vender productos sin precio aprobado offline; ocultar costos al personal») **no está en la consolidación de KARDEX**; #143 lo arrastra. Puede afectar la contingencia offline | KARDEX + ATLAS |
| 2 | Confirmar los commits `55735b24` y `429ab117` (§2) | FORJA, KARDEX |
| 3 | Brecha de pruebas de costos por rol (§4) | FARO, KARDEX, CENTINELA |
| 4 | Parche de KARDEX equivalente a `429ab117`: `docs/parches/kardex-busqueda-venta-costo-solo-admin.patch` | KARDEX |

## 8. Verificación (PostgreSQL 16.15 temporal, base vacía)

| Comprobación | Resultado |
|---|---|
| `prisma migrate deploy` (20 migraciones) | Correcto |
| `prisma validate` / `generate` | Correcto |
| `prisma migrate diff` | **0 líneas**, 0 DROP |
| `tsc` backend (build) / `tsc -b` frontend | 0 errores / 0 errores |
| Backend unitarias | 39 archivos, **366 de 366** |
| Frontend unitarias | **245 de 245** |
| Integración PostgreSQL | 34 archivos, **517 pasan, 0 fallan, 1 omitida** (prueba de navegador condicionada por `REAL_SETTINGS_BROWSER`) |
| E2E reales (backend real + PostgreSQL efímero) | **69 pasan, 0 fallan, 5 omitidas** (`npm run test:e2e-real`, 1,4 min). Primera ejecución: 61/3/5; los 3 fallos eran de fixtures (seed sin `precioAprobado`; dos casos de `TARJETA` sin `pagoElectronico`) y se corrigieron en `frontend/e2e-real` sin tocar validaciones. Las 5 omitidas son `test.skip` «PENDIENTE» de FARO (1.2, 2.2, 12.2, 13.3, 14.4); **1.2 y 2.2 parecen obsoletas** (ya existen `efectivo_recibido` de ATLAS y `pagoElectronico` de BALANCE): FARO debe revisarlas |
| Playwright con backend simulado | No ejecutado |
| Producción | **No verificada** |

Historial de la reducción de fallos de integración: 24 tras integrar KARDEX, BALANCE y FORJA → 4 tras los ajustes de fixtures y expectativas → 0 tras los commits `55735b24` y `429ab117`.

## 9. Propuesta multi-tenant (trabajo separado)

Sigue como propuesta; no se incorpora a `prisma/migrations/` ni a producción. Documentos: `PROPUESTA_FK_COMPUESTAS_TENANT_NEXUS_20261010.md` y `MATRIZ_TENANT_TABLAS_CRITICAS_NEXUS_20261010.md` (para revisión de CENTINELA), con piloto en `backend/prisma/propuestas/tenant-fk-compuestas/` y auditoría de solo lectura de 48 comprobaciones.

*Firmado: NEXUS.*
