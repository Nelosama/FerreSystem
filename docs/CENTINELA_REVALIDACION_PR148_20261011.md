# CENTINELA — revalidación independiente del PR #148 (2026-10-11)

**Firma:** CENTINELA.
**PR revisado:** #148, rama `claude/atlas-integracion-144-145`, commit `321fdee0`, base `nexus/integracion-temp` (`e8b75ae6`). Integra #144 y #145.
**Rama de verificación:** `claude/centinela-verificacion-148` (pruebas y documentación sobre `321fdee0`). No se modificó #144, #145 ni #148. Sin merge, despliegue ni migraciones productivas.

## 1. Veredicto

**NO MERGE** a `main` ni a liberación. Puede mantenerse como rama de integración, con los bloqueos de §6.

- Seguridad de entregas (prioridad 1): **PASS**. Roles, permisos personalizados, entrega inmediata del POS y rechazos sin efectos, verificados con PostgreSQL real y HTTP.
- Entregas parciales (prioridad 2): **PASS**, con dos observaciones.
- Base de datos (prioridad 3): **FAIL parcial**. El esquema y las claves compuestas funcionan, pero la migración sobre datos históricos bloquea el despliegue en un caso real del flujo legado.
- balance-real (prioridad 4): **PASS** tras la corrección de prueba. La causa es la zona horaria, exactamente como indica FARO.
- Regresiones (prioridad 5): **PASS** en las suites. **FAIL** heredado: DEF-01, DEF-03 y DEF-04 siguen abiertos en esta integración.

## 2. Resultados por requisito

| Requisito | Veredicto | Evidencia |
|---|---|---|
| ADMIN y BODEGUERO entregan | PASS | `centinela-entregas-148`, «ADMIN y BODEGUERO entregan» (ambas rutas) |
| CAJERO no puede entregar | PASS | HTTP 403 en ambas rutas, sin cambios de estado; capa de servicio también (prueba «ambas capas») |
| VENDEDOR no consulta pendientes | PASS | 403 en `/entregas/pendientes`, `/entregas/ventas/:id` y `/operaciones/entregas`, incluso con permisos personalizados |
| CAJERO solo consulta sus ventas | PASS | `pendientes` filtra por `cajeroId`; detalle de venta ajena = 404 |
| Solo ADMIN libera reservas | PASS | BODEGUERO y CAJERO = 403; ADMIN = 2xx, stock reservado correcto |
| Permisos personalizados no saltan restricciones | PASS | CAJERO y VENDEDOR con todos los permisos = 403 en entregar, preparar y liberar |
| Entrega inmediata del POS (MOSTRADOR) | PASS | CAJERO = 403 sin cambio de stock; ADMIN = descuento único y línea entregada |
| Rechazos sin efectos | PASS | Comparación de estado completo (stock, reservas, contadores, eventos, movimientos, auditoría, cajas) antes y después |
| Entregas parciales consecutivas | PASS | 5 uds en 1,5 + 2,25 + 1,25: pendiente exacto, cierre al completar |
| Cantidades decimales | PASS | 0,01 exacto; 0,001 = 400 sin cambios; 2,01 sobre 2 = 409 |
| Concurrencia | PASS | Dos entregas simultáneas de 3 sobre 4: solo una; reserva y stock consistentes |
| Idempotencia y reintentos | PASS | Misma solicitud = mismo evento, sin doble descuento; mismo id con otro contenido = 409; reintento tras completar = sin cambios |
| Inventario insuficiente | PASS | Reserva inconsistente = 409 sin cambios (la base impide reservado mayor que existencias) |
| Devoluciones relacionadas | PASS | Reingreso de entregado y cancelación de pendiente sin doble descuento; entrega posterior = 409 |
| Aislamiento entre empresas | PASS | Otra empresa: 404 en detalle, entrega y devolución; lista vacía |
| Compatibilidad de restricciones | PASS | FK compuestas, disparadores e inmutabilidad verificados con nombre de restricción (10 pruebas) |
| Integridad referencial | PASS | Línea o evento de otra empresa rechazado por su FK compuesta |
| Create anidados de Prisma | PASS | La línea recibe el tenant de la venta; un tenant cruzado se rechaza |
| Deriva de esquema | PASS | `prisma migrate diff --exit-code` sobre la base migrada = 0 |
| Riesgos sobre registros históricos | **FAIL** | Ver §4 (D-01) |
| Migración y rollback | PASS con condiciones | Migración sana: aplica y cuadra. Rollback: restaura el esquema exacto. Ver §4 |
| balance-real | PASS | Causa demostrada y corrección de prueba aplicada; 6/6 en la segunda ejecución del E2E |
| E2E real completo | PASS | Dos ejecuciones completas; la segunda: 70 aprobadas, 0 fallos, 5 omitidas |
| Regresiones | PASS en suites / FAIL heredado | Ver §5 |

## 3. Evidencia reproducible

Todas las pruebas se ejecutan con PostgreSQL 16 temporal y el usuario `nobody`.

| Comando / prueba | Resultado |
|---|---|
| `vitest run --config vitest.config.integration.ts` (suite completa, incluye los archivos nuevos) | 40 archivos, **663 pasan, 2 `it.fails` esperados, 1 omitida**, código 0 |
| `centinela-entregas-148` | 23 pasan, 2 `it.fails` documentados (DEF-01 y DEF-04) |
| `centinela-migracion-148` | 4 pasan: migración sana, aborto seguro, propuesta corregida, rollback exacto |
| `centinela-fk-148` | 10 pasan: FK compuestas, triggers, restricciones con nombre, create anidado, deriva vacía |
| `ciclo-ventas` con `REAL_SETTINGS_BROWSER=1` (Chromium real) | 1 pasa |
| Backend unitarias (Vitest) | 40 archivos, 377/377 |
| Scripts (`node --test`) | 33/33 |
| Frontend (`npm test`) | 245/245 |
| `tsc` backend y frontend | 0 errores |
| Mutación M1: `ROLES_ENTREGA` incluye CAJERO | 2 pruebas fallan; código restaurado |

Los logs y `SHA256SUMS` están en `docs/evidencias/revalidacion-148-20261011/`.

## 4. Riesgos de esquema y migraciones

**D-01 (P1, despliegue bloqueado con datos legados):** la migración `20261012000000_entrega_eventos_y_cantidades`, en su paso 6, asigna `cantidad_devuelta_reingresada` a toda devolución con destino `INVENTARIO`. En la lógica anterior, una devolución sobre una venta con reserva y sin entrega **solo reducía la reserva**: esas unidades nunca salieron. Con los datos legados, el paso 9 o el `CHECK detalles_venta_i3_chk` hacen que la migración **aborte**. La transacción de Prisma revierte todo, así que no hay datos a medias. Pero el despliegue queda bloqueado hasta limpiar esos datos.

- Demostrado con `prisma migrate deploy` real sobre datos legados: aborta con «Backfill de entregas inconsistente», sin tablas ni columnas residuales.
- Si la migración se aplicara con `psql` sin transacción, quedaría una tabla `entregas_eventos` creada: el camino de producción siempre es `migrate deploy`.
- Lectura de solo lectura para el responsable, antes de cualquier despliegue:

```sql
SELECT d.id AS detalle, v.id AS venta
FROM detalles_venta d
JOIN ventas v ON v.id = d.venta_id
JOIN detalles_devolucion dd ON dd.detalle_venta_id = d.id
WHERE dd.destino = 'INVENTARIO' AND d.sin_inventario = false
  AND v.reserva_pendiente = true AND v.entregado_at IS NULL;
```

**Corrección propuesta (no aplicada en la migración publicada):** `backend/prisma/propuestas/entregas-148/01_entrega_eventos_backfill_corregido.sql`. Cambia solo el paso 6: en ventas con reserva sin entrega, las devoluciones `INVENTARIO` cuentan como `cantidad_cancelada`, no como reingreso. Con ella, la línea no queda pendiente, la reserva cuadra con las líneas pendientes y la migración se aplica. Probado en `centinela-migracion-148`. Como la migración todavía no está en `main`, el cambio puede hacerse en la rama antes de la integración; no debe alterarse después de publicarse.

**D-02 (P2, rollback destructivo):** `backend/prisma/propuestas/entregas-148/02_rollback_entregas_eventos.sql` restaura el esquema exacto (verificado con `pg_dump`), pero elimina eventos de entrega, contadores y `evento_id` de movimientos. Solo es seguro antes de que el código nuevo registre el primer evento, o con respaldo y autorización explícita.

**D-03 (P3, tipado):** en `schema.prisma`, `DetalleVenta.tenantId` es opcional (`String?`), mientras la base lo exige con `CHECK tenant_id IS NOT NULL` y un disparador lo completa desde la venta. Funciona, pero el cliente Prisma acepta valores nulos que la base rechaza. Recomendación: `String` obligatorio, con `tenantId` explícito en los `create` anidados que ya lo generan.

**Verificado sin hallazgos:** claves compuestas `(tenant_id, …)` con restricciones referenciables; FK rechazadas por nombre de restricción; disparador de tenant; inmutabilidad de eventos (`UPDATE` y `DELETE`); modo de entrega inmutable; `CHECK` de cantidades; deriva vacía; `create` anidado de Prisma correcto.

## 5. Regresiones y dependencias FARO

| Área | Resultado | Nota |
|---|---|---|
| Inventario | PASS | Suite de integración; entregas y ajustes sin cambios de stock inesperados |
| Caja | PASS | Entregar no altera `efectivoEsperado` (prueba dedicada) |
| Numeración de ventas | PASS | Secuencia sin huecos con entregas intermedias |
| Reservas | PASS | Cuadre `stock_reservado` = pendiente en la migración sana y la corregida |
| Auditoría | PASS | `VENTA_ENTREGAR` registrado una vez por entrega; reintento no duplica |
| Contingencia offline | PASS con deuda | E2E `contingencia-real` 14/14; DEF-01 y DEF-04 siguen abiertos (ver abajo) |
| Multiempresa | PASS | Pruebas de aislamiento de entregas, contingencia y caja |

**DEF-01 (P1, abierto, heredado):** el catálogo offline incluye productos sin precio aprobado (`contingencia.service.ts`, `construirCatalogo`). Demostrado con `it.fails`, que se confirma como fallo real: el catálogo contiene el producto pendiente.

**DEF-04 (P1, abierto, heredado):** un cajero puede cobrar en la caja de otro con la ventana del primero. Demostrado: el servidor responde 201 con `APLICADA`. Está documentado con `it.fails`.

**DEF-03 (P2, abierto, heredado):** `POST /ventas` sin `solicitudId` responde 201 con caja abierta. Reproducido. En el E2E, el caso `11.3` es un `test.fail` que aparece como ✘ (fallo esperado, no contado en el resumen); su mensaje no está registrado porque la sonda usaba `require`, inexistente en ESM.

Las correcciones de DEF-01 y DEF-04 pueden existir en otras ramas (FARO, guardián), pero no están en `321fdee0` y no las he verificado aquí.

## 6. Bloqueos y condiciones

Antes de liberación:
1. **D-01:** ejecutar la consulta de solo lectura en producción y, si hay filas, aplicar la corrección del paso 6 antes de integrar.
2. **DEF-01 y DEF-04** (P1, contingencia, ATLAS): cerrar con prueba y verificar en FARO.
3. **DEF-03** (P2, ATLAS): decidir `solicitudId` obligatorio.
4. Decidir sobre la clave compartida entre COBRO y ENTREGA (observación de la prueba «reutiliza el identificador de la venta»): una entrega con el identificador de la venta responde 409. No es fuga, pero es un contrato a documentar.

Sobre el E2E: la cobertura de entregas es **una sola prueba** de flujo (cobro, pendiente, entrega parcial y final). Las entregas por rol y las entregas parciales concurrentes están cubiertas por HTTP en integración, no por E2E.

## 7. balance-real: causa y corrección

**Síntoma:** `balance-real.spec.ts:62`, `Expected "30", Received "29"`, solo en la primera ejecución del E2E (20:44 locales).

**Causa demostrada:** la aserción calcula `vencimiento::date - created_at::date`. El vencimiento se calcula en día de negocio (`diaCalendario` más el plazo) y se guarda a las 00:00 UTC. `created_at` se guarda en UTC. Desde las 18:00 de Tegucigalpa, la fecha UTC ya es el día siguiente. Reproducido con la misma aritmética: la diferencia es **29** para ventas entre las 18:00 y las 23:59 locales, y **30** en el resto del día. El cálculo del servidor es correcto; el fallo era de la aserción.

**Corrección (solo prueba, una línea):** comparar ambas fechas en la misma zona, `(created_at AT TIME ZONE 'UTC' AT TIME ZONE 'America/Tegucigalpa')::date`. No se toca la lógica financiera de producción.

**Verificación:** segunda ejecución completa del E2E, realizada también después de las 18:00 locales: `balance-real` 6/6.

## 8. E2E real completo

| Ejecución | Resultado |
|---|---|
| 1 (sin corrección de prueba) | 64 aprobadas, 1 fallo (`balance-real`), 5 omitidas |
| 2 (con corrección de `balance-real`) | **70 aprobadas, 0 fallos, 5 omitidas**, código de salida 0 |

La sonda temporal en `qa-ciclo-venta.spec.ts` se retiró después de la segunda ejecución; el archivo quedó igual que en la base.

## 9. Límites

- Sin datos de producción. La consulta de D-01 debe ejecutarla el responsable con un usuario de solo lectura.
- DEF-01, DEF-03 y DEF-04 no se corrigieron aquí: son de ATLAS y KARDEX.
- Las correcciones de DEF-01 y DEF-04 de otras ramas no están verificadas.
- No se probó Windows, iPhone/Safari ni la cuota real de IndexedDB.

*Firmado: CENTINELA.*
