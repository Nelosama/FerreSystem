# Correcciones finales de la integración #148 (ATLAS, 2026-10-11)

Rama `claude/atlas-correcciones-finales-148`, sobre `claude/atlas-integracion-144-145` (#148). Incorpora, sin modificarlas, la validación de CENTINELA (#149), el fix de GUARDIAN (#146) y la validación de FARO (#147). Las reglas de entregas aprobadas (ADMIN/BODEGUERO entregan; CAJERO solo lo suyo; VENDEDOR sin acceso; entrega inmediata del POS solo con rol que entrega) **no se tocaron**. Sin merge, despliegue ni migración productiva.

## D-01 (P1) — migración histórica: devoluciones sobre reserva no entregada
**Causa:** el paso 6 contaba como «reingreso» toda devolución `INVENTARIO`, también sobre ventas con reserva pendiente y sin entrega (la lógica anterior solo reducía la reserva). La línea quedaba con pendiente fantasma y el `CHECK` / verificación abortaba el despliegue.
**Corrección (aditiva, sin tocar la migración):** `20261012000000_entrega_eventos_y_cantidades` **no se modifica** (el control de CI `verificar-migraciones` la trata como publicada: ya existe en ramas de PR y su contenido es inmutable; no hay acceso de solo lectura a ninguna base persistente desde este entorno para demostrar lo contrario). La migración sigue abortando de forma atómica ante datos inconsistentes. La normalización de datos históricos se hace **antes** de desplegar con `backend/prisma/propuestas/entregas-148/00_normalizar_historico_previo.sql`: exige `ferre.autoriza_normalizacion=SI`, se niega si la migración ya está aplicada, respalda lo que cambia en el esquema `respaldo_entregas_148_previo` y es atómica. Normaliza (a) devoluciones físicas sobre reservas no entregadas → destino `NO_ENTREGADO` y (b) ventas sin reserva ni fecha de entrega con devoluciones físicas → `entregado_at = created_at`. Pruebas en `centinela-migracion-148.postgres.integration.ts` (SHA-256 de la migración fijado, aborto sin normalizar, rechazo sin autorización, migración tras normalizar, datos sanos intactos, rollback).
**Verificación previa, solo lectura (CENTINELA):**
```sql
SELECT d.id AS detalle, v.id AS venta FROM detalles_venta d JOIN ventas v ON v.id = d.venta_id
JOIN detalles_devolucion dd ON dd.detalle_venta_id = d.id
WHERE dd.destino = 'INVENTARIO' AND d.sin_inventario = false AND v.reserva_pendiente = true AND v.entregado_at IS NULL;
```
Conciliación de reservas tras migrar (debe devolver 0 filas):
```sql
SELECT p.id, p.stock_reservado, COALESCE(SUM(d.cantidad - d.cantidad_entregada - d.cantidad_cancelada),0) AS pendiente
FROM productos p LEFT JOIN detalles_venta d ON d.producto_id = p.id AND d.modo_entrega = 'BODEGA'
  AND EXISTS (SELECT 1 FROM ventas v WHERE v.id = d.venta_id AND v.estado = 'COMPLETADA' AND v.reserva_pendiente)
GROUP BY p.id HAVING p.stock_reservado <> COALESCE(SUM(d.cantidad - d.cantidad_entregada - d.cantidad_cancelada),0);
```
**Pruebas** (`backend/test/centinela-migracion-148.postgres.integration.ts`, `prisma migrate deploy` real): datos sanos; caso riesgoso migra sin duplicar existencias ni tocar el historial de devoluciones; venta antigua sin reserva con devolución; mezcla DAÑADO/PROVEEDOR sobre reserva (quedan 2 pendientes); datos realmente inconsistentes abortan **toda** la migración sin tablas, columnas ni restricciones residuales y sin registrar la migración como aplicada; tras migrar, el flujo vigente (entregar el pendiente, reintento idempotente, línea cancelada no entregable) funciona. La migración corre en una sola transacción de Prisma.

## D-02 (P2) — reversión sin pérdida silenciosa
El rollback anterior (`02_…`) borraba eventos y contadores. Se agregó `prisma/propuestas/entregas-148/03_rollback_con_respaldo.sql`:
- se **niega** a ejecutar si ya hay eventos distintos de COBRO (entregas parciales, preparaciones, liberaciones, devoluciones) salvo `PGOPTIONS="-c ferre.autoriza_perdida=SI"`;
- antes de borrar, copia eventos, líneas, contadores por línea y vínculos de movimientos al esquema `respaldo_entregas_148_<fecha>` (misma transacción: si el respaldo falla no se borra nada);
- no modifica existencias, ventas ni devoluciones, y deja el esquema `public` idéntico al anterior (comparado con `pg_dump`).
**Procedimiento recomendado: recuperación hacia adelante.** Una vez que el código nuevo registró entregas parciales, el esquema anterior no puede representarlas; revertir solo es aceptable antes del primer evento real o con respaldo y autorización explícita. Si hay incidente: detener el despliegue, conservar el esquema nuevo, corregir código o datos con una migración aditiva y, si hace falta volver, ejecutar `03_…` con autorización y archivar el esquema de respaldo.

## DEF-04 (P1) — propiedad de la ventana offline
`procesarOperacion` valida empresa (ventana buscada por empresa y dispositivo), dispositivo, `ventana.usuarioId === cajeroId` y que la caja de la ventana sea del mismo cajero y empresa. Si no: **rechazo definitivo** (`VENTANA_DE_OTRO_CAJERO` / `CAJA_DE_VENTANA_NO_VALIDA`) con evidencia en el diario (estado `RECHAZADA`) y sin venta, movimiento de caja, stock, numeración ni acceso a la caja ajena. El reintento responde lo mismo; ACEPTAR/REINTENTAR sobre una rechazada responde 409. Un administrador sí puede enviar la operación de un cajero con la ventana de ese cajero.

## DEF-01 / R-01 / R-02
- **DEF-01 integrado:** catálogo y sincronización de GUARDIAN (#146) sin reintroducir productos sin precio aprobado (el catálogo de #148 solo pedía `precioVenta > 0`; ahora exige `precioAprobado` y precio positivo).
- **R-01 (ventanas anteriores):** migración `20261015000000_contingencia_revocar_ventanas_anteriores` (solo datos, sin `DROP`/`ADD CONSTRAINT`): **revoca** las ventanas cuya instantánea no guarda la prueba de aprobación. En código: al emitir una ventana nueva se revocan las anteriores incompatibles del equipo; una operación que llegue con una ventana incompatible recibe `RECHAZADA_TECNICA` con `VENTANA_OBSOLETA` (el equipo conserva la venta local en revisión), se guarda completa en el diario en estado `REVISION` con un conflicto DURO no superable (evidencia para conciliar; no se añade un estado nuevo al `CHECK`) y **no queda atrapada**: tiene salida con conciliación de efectivo. Los reintentos de operaciones ya recibidas no se ven afectados.
- **R-02 (cierre manual):** `CERRAR_MANUAL` registra un `INGRESO_MANUAL` de conciliación (total cobrado, sin el cambio) en la caja abierta del cajero, o la indicada (`cajaId`), o la del administrador; sin caja abierta responde 409 y no cierra. Es idempotente por operación, referencia la operación y queda auditado (`CONTINGENCIA_CONCILIAR_EFECTIVO`). **No crea ventas ni mueve inventario** (el inventario físico se concilia aparte, p. ej. con levantamiento).

## DEF-03 (P2) — `solicitudId` obligatorio en ventas nuevas
Consumidores revisados: `POST /ventas` lo usa solo el POS web (siempre envía `solicitudId`), no la app móvil (`feat/ferresystem-mobile` solo lee el dashboard), no las cotizaciones (`convertir` tiene su propia ruta) ni la contingencia (ruta propia con `operacionId`); las integraciones de pruebas se actualizaron. Se exige en el DTO (400 con UUID v4 ausente o inválido) y en `VentasService.create` (defensa). Pruebas: ausente/vacío/no v4 → 400 sin efectos; 5 envíos simultáneos → una venta; misma solicitud en otra empresa → venta propia; ventas anteriores siguen consultables.

## D-03 (P3) — `DetalleVenta.tenantId`
Evaluado, **sin cambiar**: en Prisma queda opcional y en PostgreSQL es obligatorio por `CHECK (tenant_id IS NOT NULL)` más un disparador que lo completa desde la venta. Si fuera obligatorio en Prisma, todo `create` anidado (`cotizaciones.convertir`, garantías, pruebas) exigiría enviarlo y, si fuera `NOT NULL` en la base con el campo opcional en Prisma, `migrate diff` reportaría deriva. Verificado: creación anidada sin tenant (el disparador lo completa), tenant cruzado rechazado por la clave compuesta, `NULL` explícito rechazado por el `CHECK` (`centinela-fk-148`). Riesgo residual: el tipo permite `null` en compilación, no en ejecución. Cambiarlo requiere enviar `tenantId` en cada `create` anidado y es decisión de NEXUS.

## Riesgos residuales
1. Un administrador cierra una operación con efectivo pero el inventario físico queda por conciliar (no se inventa venta ni ajuste).
2. Equipos con ventanas anteriores recibirán `VENTANA_OBSOLETA` hasta pedir una ventana nueva; las ventas hechas offline quedan en el equipo y en el diario en `REVISION` hasta que un administrador las cierre.
3. La migración `20261015…revocar_ventanas_anteriores` revoca ventanas en el despliegue; no alcanza a equipos sin conexión (se resuelve al sincronizar).
4. La activación de contingencia sigue apagada por defecto; no se probaron dispositivos físicos, Windows ni Safari.
5. Pendiente la nueva validación independiente de FARO y CENTINELA.

## Control de migraciones del PR #150 (causa raíz)
1. **Migración modificada:** en el commit anterior se editaron los pasos 5, 6 y 9 de `20261012…` suponiéndola sin publicar. El control compara con la base del PR y la trata como inmutable. Se restauró byte a byte y D-01 pasó a un script de normalización previa.
2. **`DROP` sin aprobación:** la `20261015…` recreaba un `CHECK` (`DROP CONSTRAINT`) solo para añadir `RECHAZADA`. Se eliminó: el rechazo es `REVISION` + conflicto DURO y la migración queda solo de datos. No se agregó ninguna marca `APROBACION-DESTRUCTIVA`. No se tocaron `verificar-migraciones.mjs` ni el workflow. Insertar una migración con orden anterior queda descartado por `HISTORIAL_CON_HUECOS`.
3. **Playwright:** `contingencia-simulado.spec.ts` usaba `/Tornillo 2 pulgadas/`, que también coincide con «Quitar/Agregar una unidad de Tornillo 2 pulgadas» de la línea del carrito (tres botones, violación de modo estricto). El selector ahora se limita a la región «Buscar productos» y al botón cuyo nombre empieza por el producto; las aserciones de existencia local (20 → 19 → 18) no cambiaron.
