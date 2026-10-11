# Correcciones finales de la integración #148 (ATLAS, 2026-10-11)

Rama `claude/atlas-correcciones-finales-148`, sobre `claude/atlas-integracion-144-145` (#148). Incorpora, sin modificarlas, la validación de CENTINELA (#149), el fix de GUARDIAN (#146) y la validación de FARO (#147). Las reglas de entregas aprobadas (ADMIN/BODEGUERO entregan; CAJERO solo lo suyo; VENDEDOR sin acceso; entrega inmediata del POS solo con rol que entrega) **no se tocaron**. Sin merge, despliegue ni migración productiva.

## D-01 (P1) — migración histórica: devoluciones sobre reserva no entregada
**Causa:** el paso 6 contaba como «reingreso» toda devolución `INVENTARIO`, también sobre ventas con reserva pendiente y sin entrega (la lógica anterior solo reducía la reserva). La línea quedaba con pendiente fantasma y el `CHECK` / verificación abortaba el despliegue.
**Corrección (`20261012000000_entrega_eventos_y_cantidades`, paso 6, aún no publicada):** en ventas con `reserva_pendiente` y sin `entregado_at`, **cualquier** devolución (INVENTARIO, DAÑADO, PROVEEDOR, NO_ENTREGADO) se cuenta como `cantidad_cancelada`; en ventas entregadas se conserva la regla (INVENTARIO → reingreso; DAÑADO/PROVEEDOR → sin reingreso). Paso 5: las ventas sin reserva pendiente se consideran entregadas (el stock salió al vender). Paso 9: aviso informativo (no bloquea) si la reserva legada de algún producto no coincide con lo pendiente por líneas.
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
- **R-01 (ventanas anteriores):** migración `20261015000000_contingencia_rechazo_y_conciliacion` (aditiva): permite el estado `RECHAZADA` y **revoca** las ventanas cuya instantánea no guarda la prueba de aprobación. En código: al emitir una ventana nueva se revocan las anteriores incompatibles del equipo; una operación que llegue con una ventana incompatible recibe `RECHAZADA_TECNICA` con `VENTANA_OBSOLETA` (el equipo conserva la venta local en revisión), se guarda completa en el diario (`RECHAZADA`, evidencia para conciliar) y **no queda atrapada**: tiene salida con conciliación de efectivo. Los reintentos de operaciones ya recibidas no se ven afectados.
- **R-02 (cierre manual):** `CERRAR_MANUAL` registra un `INGRESO_MANUAL` de conciliación (total cobrado, sin el cambio) en la caja abierta del cajero, o la indicada (`cajaId`), o la del administrador; sin caja abierta responde 409 y no cierra. Es idempotente por operación, referencia la operación y queda auditado (`CONTINGENCIA_CONCILIAR_EFECTIVO`). **No crea ventas ni mueve inventario** (el inventario físico se concilia aparte, p. ej. con levantamiento).

## DEF-03 (P2) — `solicitudId` obligatorio en ventas nuevas
Consumidores revisados: `POST /ventas` lo usa solo el POS web (siempre envía `solicitudId`), no la app móvil (`feat/ferresystem-mobile` solo lee el dashboard), no las cotizaciones (`convertir` tiene su propia ruta) ni la contingencia (ruta propia con `operacionId`); las integraciones de pruebas se actualizaron. Se exige en el DTO (400 con UUID v4 ausente o inválido) y en `VentasService.create` (defensa). Pruebas: ausente/vacío/no v4 → 400 sin efectos; 5 envíos simultáneos → una venta; misma solicitud en otra empresa → venta propia; ventas anteriores siguen consultables.

## D-03 (P3) — `DetalleVenta.tenantId`
Evaluado, **sin cambiar**: en Prisma queda opcional y en PostgreSQL es obligatorio por `CHECK (tenant_id IS NOT NULL)` más un disparador que lo completa desde la venta. Si fuera obligatorio en Prisma, todo `create` anidado (`cotizaciones.convertir`, garantías, pruebas) exigiría enviarlo y, si fuera `NOT NULL` en la base con el campo opcional en Prisma, `migrate diff` reportaría deriva. Verificado: creación anidada sin tenant (el disparador lo completa), tenant cruzado rechazado por la clave compuesta, `NULL` explícito rechazado por el `CHECK` (`centinela-fk-148`). Riesgo residual: el tipo permite `null` en compilación, no en ejecución. Cambiarlo requiere enviar `tenantId` en cada `create` anidado y es decisión de NEXUS.

## Riesgos residuales
1. Un administrador cierra una operación con efectivo pero el inventario físico queda por conciliar (no se inventa venta ni ajuste).
2. Equipos con ventanas anteriores recibirán `VENTANA_OBSOLETA` hasta pedir una ventana nueva; las ventas hechas offline quedan en el equipo y en el diario como `RECHAZADA` hasta que un administrador las cierre.
3. La migración `20261015…` revoca ventanas en el despliegue; no alcanza a equipos sin conexión (se resuelve al sincronizar).
4. La activación de contingencia sigue apagada por defecto; no se probaron dispositivos físicos, Windows ni Safari.
5. Pendiente la nueva validación independiente de FARO y CENTINELA.
