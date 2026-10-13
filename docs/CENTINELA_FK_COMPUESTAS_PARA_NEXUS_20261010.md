# CENTINELA → NEXUS: relaciones que requieren claves foráneas compuestas (2026-10-10)

**Firma:** CENTINELA. **Propósito:** lista para que NEXUS decida el diseño y el orden de las migraciones. CENTINELA **no crea migraciones** en modelos que NEXUS está modificando (#141).

## 1. Problema

Las FK actuales son de una sola columna: `FOREIGN KEY (producto_id) REFERENCES productos(id)`. La base garantiza que el registro existe, pero **no** que pertenezca al mismo `tenant_id` que la fila que lo referencia. Un identificador de otra empresa es aceptado sin error. Lo verifiqué en las migraciones de `main` y de #141: los nombres de restricción coinciden (`*_fkey` de una columna).

ATLAS ya propone la solución en `docs/POS_ENTREGA_CONTRATOS.md` §2.3: FK compuestas `(tenant_id, …)`, con `UNIQUE (tenant_id, id)` en las tablas referenciadas.

## 2. Requisito previo común

Para cada tabla **referenciada** que necesite FK compuesta: `UNIQUE (tenant_id, id)`.
Para cada tabla **referenciadora** que no tenga `tenant_id` (según el modelo en `main`): añadir la columna con *backfill* y `SET NOT NULL` antes de la FK compuesta. Riesgo: si ya hay filas con `tenant_id` incoherente, la migración falla. Hay que detectarlas antes (consulta de solo lectura, ver §5).

## 3. Lista priorizada

Prioridad **P1**: dinero, existencias, ventas o caja. **P2**: relaciones operativas sin movimiento de dinero o stock. Campo `tenant_id` según el modelo en `main`.

| Prioridad | Tabla referenciadora | Columna | Referencia | ¿Tiene `tenant_id`? | Riesgo |
|---|---|---|---|---|---|
| P1 | `ventas` | `cliente_id` | `clientes` | Sí | Venta de una empresa asociada a cliente de otra |
| P1 | `ventas` | `usuario_id` | `usuarios` | Sí | Atribución de venta a usuario ajeno |
| P1 | `detalles_venta` | `producto_id` | `productos` | **No** (añadir) | Línea de venta con producto ajeno; afecta stock y costo |
| P1 | `devoluciones` | `venta_id` | `ventas` | Sí | Devolución de dinero sobre venta ajena |
| P1 | `detalles_devolucion` | `detalle_venta_id` | `detalles_venta` | No (hereda) | Reingreso de stock sobre línea ajena |
| P1 | `cuentas_operativas` | `cliente_id` | `clientes` | Sí | Cuenta por cobrar de un cliente ajeno |
| P1 | `cuentas_operativas` | `proveedor_id` | `proveedores` | Sí | Cuenta por pagar de un proveedor ajeno |
| P1 | `pagos_cuenta` | `cuenta_id` | `cuentas_operativas` | Sí | Pago aplicado a cuenta de otra empresa (dinero) |
| P1 | `abonos_cliente` | `cliente_id`, `venta_id` | `clientes`, `ventas` | Sí (verificar) | Abono sobre saldo ajeno |
| P1 | `movimientos_inventario` | `producto_id` | `productos` | Sí | Movimiento de stock en producto ajeno |
| P1 | `costos_compra` | `producto_id`, `proveedor_id` | `productos`, `proveedores` | Sí | Costo vigente contaminado por otra empresa (margen) |
| P1 | `cajas` | `usuario_id` | `usuarios` | Sí | Caja abierta a nombre de usuario ajeno |
| P1 | `operaciones_contingencia` | `venta_id` | `ventas` | Sí | Sincronización offline sobre venta ajena |
| P1 | `ordenes_compra` | `proveedor_id`, `usuario_id` | `proveedores`, `usuarios` | Sí | Orden de compra con proveedor ajeno |
| P1 | `coberturas_garantia` | `venta_id`, `producto_id` | `ventas`, `productos` | Sí | Cobertura de garantía sobre venta ajena |
| P2 | `movimientos_caja` | `caja_id` | `cajas` | No (hereda de `cajas`) | Egreso registrado en caja ajena |
| P2 | `detalles_orden_compra` | `producto_id` | `productos` | No | Línea de compra con producto ajeno |
| P2 | `detalles_compra_proveedor` | `producto_id` | `productos` | No | Línea de compra con producto ajeno |
| P2 | `compras_proveedor` | `proveedor_id` | `proveedores` | Sí | Compra con proveedor ajeno |
| P2 | `cotizaciones` | `cliente_id`, `usuario_id`, `venta_id` | `clientes`, `usuarios`, `ventas` | Sí | Cotización con referencias ajenas |
| P2 | `detalles_cotizacion` | `producto_id` | `productos` | No | Línea con producto ajeno |
| P2 | `productos_proveedores` | `producto_id`, `proveedor_id`, `creado_por`, `actualizado_por` | varias | Sí | Vínculo con producto/proveedor ajeno |
| P2 | `apartados` (#141) | `cliente_id`, `producto_id` | `clientes`, `productos` | Sí | Apartado con referencias ajenas. Pendiente de #141 |
| P2 | `garantias` (#141) | `venta_id`, `producto_id` | `ventas`, `productos` | Sí | Reclamo de garantía con referencias ajenas. Pendiente de #141 |
| P2 | `transferencias` (#141) | `usuario_id` | `usuarios` | Sí | Pendiente de #141 |
| P2 | `detalles_transferencia` (#141) | `producto_id` | `productos` | No | Pendiente de #141 |
| P2 | `cierres_comisiones` (#141) | `vendedor_id` | `usuarios` | Sí | Comisión de vendedor ajeno. Pendiente de #141 |
| P2 | `clientes` (#141) | `lista_precio_id` | `listas_precio` | Sí | Precio de otra empresa aplicado. Pendiente de #141 |

Las tablas de ATLAS del diseño de entrega (`entregas_eventos`, `entregas_eventos_lineas`) **no existen aún**: deben nacer con FK compuestas desde su primera migración. Así lo pide el contrato.

## 4. Orden sugerido (para NEXUS)

1. Auditoría de datos incoherentes (solo lectura, §5). Sin resultado vacío no se avanza.
2. `UNIQUE (tenant_id, id)` en `clientes`, `productos`, `usuarios`, `ventas`, `proveedores`, `cuentas_operativas`, `cajas`, y `detalles_venta` (tras añadir `tenant_id`).
3. `tenant_id` en `detalles_venta`, `detalles_compra_proveedor`, `detalles_orden_compra`, `detalles_cotizacion`, `movimientos_caja` (con *backfill* desde la tabla padre).
4. FK compuestas P1, después P2, en migraciones separadas y aditivas. Cada una con `NOT VALID` seguido de `VALIDATE CONSTRAINT`, para no bloquear tablas grandes.
5. Pruebas de integración que intenten referenciar un registro de otra empresa y esperen fallo de FK.

**Sin aprobación explícita, ninguna de estas migraciones debe contener DROP ni cambio de tipo.** Las FK nuevas son aditivas, pero añadir `NOT NULL` o `UNIQUE` puede fallar con datos reales: por eso el paso 1.

## 5. Consulta de detección (solo lectura, ejemplo)

Detecta referencias cruzadas existentes en `ventas`→`clientes`. Ejecutar sobre una **copia**, nunca sobre producción sin autorización:

```sql
SELECT v.id, v.tenant_id, c.tenant_id AS tenant_cliente
FROM ventas v JOIN clientes c ON c.id = v.cliente_id
WHERE v.tenant_id <> c.tenant_id;
```

Resultado esperado: 0 filas. Cada tabla de §3 necesita su consulta equivalente. NEXUS las construye.

## 6. Límites de CENTINELA

- No crea estas migraciones. Son de NEXUS, por el riesgo sobre modelos en revisión (#141).
- Esta lista no cubre la lógica de aplicación: las consultas del backend deben filtrar por `tenant_id` aunque exista la FK compuesta. CENTINELA lo verifica por separado en endpoints.
- Sin pruebas de integración contra datos reales. Lo indicado es requisito, no verificación.

*Firmado: CENTINELA, para NEXUS.*
