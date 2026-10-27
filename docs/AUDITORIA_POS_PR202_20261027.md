# Auditoría de precios POS — PR #202 — 2026-10-27 UTC

Base verificada: `main` `2f6168dc`, PR #202 `59e739da`. Rama propia: `codex/pr202-auditoria-precios`. No se modifican las ramas `claude/pos-sincronizacion-precios` ni `feat/contabilidad-honduras` (#180). Sin merge, despliegue, cambios de esquema/migraciones ni acceso a producción.

## Defectos corregidos

| Hallazgo | Causa y corrección | Regresión |
|---|---|---|
| P202-01: el cobro consume una respuesta antigua aunque el catálogo ya recibió otra más reciente | La secuencia solo protegía `setProductos`; `consultarCatalogo` devolvía igualmente la respuesta descartada y `handleCobrar` podía usarla. Ahora también devuelve al consumidor el último catálogo aplicado, asociado a empresa/usuario. | `frontend/e2e/pos-precios-automaticos-simulado.spec.ts`, «una lectura de cobro retrasada…». Se retiene el GET del cobro y se resuelve primero la lectura periódica posterior. Sin POST obsoleto; total actualizado en silencio y segundo clic. |
| P202-02: otra pestaña cambia el borrador durante el GET del cobro | El nuevo tiempo de espera permitía sustituir el borrador compartido y cobrar el carrito de la clausura anterior. Se compara la versión serializada antes/después de la lectura, se restaura la recuperación y se detiene el cobro si cambió. | Mismo archivo, «un borrador cambiado…». El borrador externo se conserva y no hay POST. |
| P202-03: excepción de precio con motivo de espacios o sin validación interna | `MinLength` contaba espacios y los consumidores internos no pasan por el DTO. El DTO normaliza y el servicio exige 10–300 caracteres después de `trim`, también para llamadas internas. | `backend/src/ventas/create-venta-excepcion-precio.spec.ts` (7 casos) y `auditoria-piloto-ferreteria.postgres.integration.ts`, «la excepción rechaza motivos…», con huella de BD idéntica tras cada rechazo. |
| P202-04: mismo identificador acepta otro motivo de excepción | La huella v2 omitía `excepcionPrecio`. Se coteja el motivo con la auditoría durable de la venta, conservando la compatibilidad con huellas anteriores; cambiar u omitir un motivo auditado da 409. | PostgreSQL, «el motivo de excepción pertenece a la identidad…»: replay idéntico devuelve la misma venta; cambio/omisión se rechazan sin efectos. |

Endurecimiento adicional: las lecturas compartidas se asocian a la identidad activa y un `finally` antiguo no borra una lectura nueva. El pendiente nuevo se construye con el carrito validado. Se conserva el carrito inmutable de las ventas enviadas y la corrección explícita de pendientes.

Las dos regresiones de frontend y las dos de validación/idempotencia fallaron antes de sus correcciones. Los errores propios del arnés durante la preparación (nombre de método, envoltura del borrador y adaptador de la barrera) se corrigieron sin rebajar aserciones.

## Contratos y compatibilidad

- **POS online:** sincronización silenciosa cada 60 s, al recuperar visibilidad/red y en la interacción (mínimo 3 s). Sin botón de actualización. Cada cobro inicia su lectura. Cambio detectado al cobrar: actualiza línea/total en silencio y exige segundo clic, sin aviso ni modal. Un fallo de validación conserva la venta y no envía un POST nuevo.
- **Backend:** `VentasService.create` y `ProductosService.cambiarPrecios` usan el mismo bloqueo transaccional por empresa. La venta bloquea además la fila del producto, comprueba actividad/aprobación/precio, y realiza numeración, inventario, caja, cuentas y auditoría en una transacción. Ningún rol obtiene la excepción de precio solo por ser ADMIN: exige permiso explícito y motivo auditado.
- **Concurrencia:** la regresión PostgreSQL retiene una transacción real de cambio de precio antes del commit; observa ambas cajas esperando `pg_stat_activity.wait_event = advisory`; al liberarla ambas rechazan el precio anterior con 409. Los reintentos simultáneos de una solicitud válida devuelven una sola venta.
- **Multi-tenant y sesiones:** catálogo comercial filtrado por empresa, producto y aprobación; lecturas/recuperación del POS ligadas a empresa/usuario; validación de actor y permisos dentro de la transacción. La suite existente comprueba JWT expirado/revocado, cambio de empleado, soporte, API y aislamiento. No se cambian autenticación ni permisos de otros módulos.
- **Inventario:** cantidades y atributos de entrega del carrito se conservan; MOSTRADOR descuenta físico y BODEGA reserva bajo los controles existentes. El caso nuevo de dos cajas reconcilia ambos efectos y un replay.
- **Cotizaciones:** siguen siendo documentos históricos; no se recalculan por un refresco del POS. La conversión comprueba aprobación/actividad, existencias y permisos; una diferencia con el precio del catálogo requiere ADMIN según el contrato existente de cotizaciones. No se extiende automáticamente `pos.excepcion_precio` a ese módulo.
- **Cancelaciones y devoluciones:** mantienen la identidad durable de descarte y la devolución autorizada por otra cuenta. La regresión nueva en `devoluciones-cxc.postgres.integration.ts` cambia el catálogo después de vender: dos devoluciones de L 115 completan exactamente los L 230 originales; el precio guardado de la venta sigue siendo L 100.
- **Dinero:** se conservan los cálculos en centavos/centésimas y mitad hacia arriba. El E2E nuevo con API real prueba 2.75 × 12.55 → subtotal 34.51, ISV 5.18, total 39.69; y 1.25 × 12.55 → 15.69 + 2.35 = 18.04. Los vectores compartidos y la jornada aleatoria PostgreSQL siguen siendo parte de las suites.
- **Offline:** `/pos` no registra una venta nueva si no puede confirmar el catálogo. El POS de contingencia usa una ventana autorizada y su instantánea aprobada: un cambio posterior de precio conserva el importe cobrado; una revocación posterior de aprobación genera `APROBACION_REVOCADA_POSTERIOR` y revisión. Un producto sin aprobación al emitir la ventana produce conflicto duro y no se fuerza. Esta política preexistente difiere deliberadamente de la venta online: no es una garantía de conocer precios nuevos mientras no hay red. No se alteró ese contrato.

## Validación

Entorno: Node 24.19, PostgreSQL 17.11 extraído en un directorio propio sin instalar servicios del sistema y Chromium 151 local (distinto del navegador oficial de Playwright). Todos los datos son sintéticos en clústeres efímeros. Las suites excluyen las bases externas.

| Verificación local | Evidencia terminada |
|---|---|
| Backend build y lint | Correctos; avisos heredados |
| Backend unitarias / scripts / E2E / Python | 602/602 · 51/51 · 6/6 · 10/10 |
| Frontend tipos, build, lint y unitarias | Correctos; 545/545 |
| POS simulado dirigido | 11/11, incluidas las dos carreras nuevas |
| Dos cajas, navegador + API + PostgreSQL reales, sin mocks | 1/1 |
| Devolución histórica después del cambio de catálogo | PostgreSQL: 1/1 dirigido |
| Guard de migraciones | Correcto, cero migraciones propias |
| Compatibilidad temporal con #180 `3c84a7a` | Árbol `ddb0244b727424b9274c2bc8098569b448846a43`: 105/105 PostgreSQL (5 archivos), 70/70 unitarias contables y builds backend/frontend correctos |

**Pasadas completas, omisiones, reintentos y CI por SHA:** [PR complementario #204](https://github.com/Nelosama/FerreSystem/pull/204). Los resultados extensivos se registran allí junto con sus enlaces de Actions; esta tabla solo acredita las comprobaciones ya finalizadas al preparar el informe. Los checks verdes de `59e739da` al iniciar no acreditan los nuevos commits. La combinación con #180 fue temporal y con un cliente Prisma propio, sin escribir en ninguna de las dos ramas. El test histórico adicional se validó por separado en la rama propia; no está incluido en aquellos 105 casos.

Incidencias de validación conservadas:

- Las regresiones nuevas se ejecutaron primero contra el código recibido: dos fallos backend y dos fallos de navegador por las causas descritas. La primera pasada extensa se interrumpió para relanzarla con el código corregido; también tuvo un timeout de 15 s en administración bajo carga concurrente. No se presenta esa pasada como verde ni se cambiaron sus aserciones o timeout.
- El primer E2E backend no encontró PostgreSQL en la ruta por defecto. Se extrajeron los binarios en el workspace y se repitió con `PG_BIN`; 6/6.
- El piloto local falla en la recarga offline de `contingencia-real.spec.ts` con Chromium 151. Una página mínima, sin código de Jowa, con service worker y caché de navegación reproduce lo mismo:

```json
{"browser":"151.0.7922.173","offlineBeforeReload":false,"afterReload":{"online":true,"fetch":"network-error"}}
```

  La emulación dice «en línea» después de recargar aun cuando el transporte falla. El service worker y el POS de contingencia no tienen cambios en esta auditoría. No se elimina la prueba ni se fuerza `navigator.onLine`; el piloto del CI usa el navegador oficial de Playwright. Este resultado local no certifica PWA física ni se transforma en un resultado aprobado.


## Dictamen y publicación

Correcciones publicadas en [#204](https://github.com/Nelosama/FerreSystem/pull/204), rama propia dirigida a la rama de #202; [#202 actualizado con el enlace y la evidencia](https://github.com/Nelosama/FerreSystem/pull/202#issuecomment-6445129453). Así no se escribe en una rama ajena ni se hace merge. Hasta incorporar las correcciones y verificar el SHA resultante, #202 permanece **NO MERGE**.

Pendientes de aceptación física: protocolo de caja con catálogo grande, dispositivos/impresora reales y decisión del propietario sobre la concesión de `pos.excepcion_precio`. #180 conserva sus propios límites contables/fiscales y su dictamen; esta auditoría no certifica contabilidad fiscal ni activa asientos automáticos.

Bitácora: lectura de AGENTS/contexto/NEXUS; comparación remota main/#202/#180 y CI; rama propia; regresiones rojas; corrección de las cuatro causas; pruebas con barreras y PostgreSQL real; E2E real de dos cajas y reembolsos; combinación temporal #180; diagnóstico independiente del navegador; compilaciones/lint y suites; publicación de commits y #204; actualización de #202 y del contexto maestro. La rama propia queda excluida de previews. El workflow de piloto admite expresamente PR hacia la rama de #202 para ejecutar CI real sin fusionar.

NEXUS: cero cambios propios de esquema o migraciones; todas las escrituras de validación se hicieron en clústeres locales efímeros.

## Cambio concurrente de base durante la auditoría

#202 avanzó de `59e739da` a `cf194ee7` (retirar aviso visible, actualización silenciosa). Se sincronizó únicamente la rama propia mediante rebase sobre `cf194ee7`, con respaldo local y publicación protegida por `--force-with-lease`. `cf194ee7` queda como ancestro real; no hubo merge ni escritura en la rama ajena. Una comparación de árboles antes/después del rebase confirmó contenido idéntico. Las regresiones conservan el total silencioso y el segundo clic.

Tras esa sincronización: build/lint frontend correctos, **545/545** unitarias y **11/11** regresiones de precios. Las comprobaciones de backend no cambian con el retiro de un aviso del frontend.

Pasadas extensivas locales antes de esa sincronización (no acreditan por sí solas el nuevo HEAD):

- Piloto API/PG/navegador completo: **158 aprobadas, 1 fallida, 13 no ejecutadas por dependencia serial y 4 omitidas**. Falla la prueba 2 de recarga offline, reproducida por la sonda independiente. Incluye las dos cajas, los cinco vectores monetarios, cancelación, recuperación y aislamiento. La falla serial impide los casos posteriores de ese archivo; no se cuentan como aprobados.
- Navegador simulado general: **292 aprobadas, 1 fallida (sonda de emulación offline existente), 2 interrumpidas, 11 omitidas y 106 no ejecutadas**. Se interrumpió al cambiar #202 para no validar un bundle anterior contra pruebas nuevas. Las once regresiones del POS se repitieron después y pasaron íntegramente.
- El CI de los SHA anteriores se distingue del CI definitivo. #204 enlaza los workflows del último SHA sincronizado y sus resultados completos.

## Cierre de la validación extensa y estabilidad de sesiones

- PostgreSQL local completo: **65 archivos, 1117/1117**, con navegador real de configuración. El timeout de administración de la primera pasada no reapareció; no se aumentó su presupuesto.
- Navegador local sincronizado completo: **384 aprobadas, 2 fallidas, 26 omitidas**. Una falla es la emulación offline ya demostrada; la otra compara el orden de llamadas antes de que exista `/levantamientos` (`indexOf = -1`). El render visible no garantiza que haya empezado su efecto de consulta.
- Se corrige esa carrera **solo en la prueba** `e2e/session-lifecycle.spec.ts`: espera explícita de `/levantamientos`, conservando las aserciones del orden `/auth/me` → módulo y de una sola renovación. La regresión de escritorio pasó **3/3**; el recorrido móvil de sesiones previo pasó **16/16**. Sin cambios de autenticación del producto, eliminación de aserciones ni aumento de timeouts.
- CI de `d99dab0f` (anterior únicamente a esa espera de la prueba): ambos workflows aprobados. Operación: **386 navegador + 26 omisiones, 16 móvil, 602 unitarias backend, 545 frontend, 1117 PostgreSQL, 6 E2E backend, 51 scripts**. Piloto real: **172 aprobadas + 4 omisiones**, simulacros de recuperación y actualización/reversión `FALLOS=0`.
- El SHA publicado después de corregir la prueba vuelve a ejecutar ambos workflows. **El resultado definitivo de ese SHA está en #204**; no se atribuyen automáticamente los checks de `d99dab0f` a la revisión posterior.
