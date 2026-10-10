# Traspaso a NEXUS — migración `20261012000000_entrega_eventos_y_cantidades`

Rama `claude/atlas-cobro-entrega` (PR #144, borrador). Contrato funcional completo: `docs/POS_ENTREGA_CONTRATOS.md` §4. **No se ejecutó ninguna migración productiva.**

## Qué cambia (solo aditivo)
| Objeto | Cambio |
|---|---|
| `detalles_venta` | `tenant_id` (NOT NULL tras backfill, trigger lo copia de la venta), `modo_entrega` (`MOSTRADOR|BODEGA|SIN_INVENTARIO`, `DEFAULT 'BODEGA'`), `cantidad_preparada/entregada/devuelta_reingresada/devuelta_sin_reingreso/cancelada NUMERIC(12,2)` |
| `entregas_eventos` | nueva, solo inserción (triggers), `UNIQUE(tenant_id, solicitud_id)`, `huella CHAR(64)` SHA-256 |
| `entregas_eventos_lineas` | nueva, PK `(tenant_id, evento_id, detalle_venta_id)`, `cantidad > 0` |
| `movimientos_inventario` | `evento_id`, `detalle_venta_id`; índice único `(tenant_id, evento_id, detalle_venta_id)` |
| `productos` | `CHECK (stock_reservado >= 0)` |
| `ventas/productos/usuarios` | `UNIQUE(tenant_id, id)` para las FK compuestas |

Restricciones: invariantes por línea I2–I5 como `CHECK`; modo de línea inmutable (trigger); FK compuestas `(tenant_id, …)` hacia ventas, productos, usuarios, eventos y líneas.

## Backfill (probado con datos legados en `test/migrations.postgres.integration.ts`)
Ventas con `entregado_at` → `cantidad_entregada = cantidad`; origen `CONTINGENCIA` → `MOSTRADOR` entregada; `sin_inventario` → `SIN_INVENTARIO`; devoluciones previas por destino (INVENTARIO → reingresada; DAÑADO/PROVEEDOR → sin reingreso; NO_ENTREGADO → cancelada). Conserva el número de ventas.

## Pruebas de la migración
`psql` aplica las 40+ migraciones en PG16 limpio; `prisma migrate deploy` (e2e real) y la suite `migrations.postgres.integration.ts` pasan; 53/53 en `cobro-entrega.postgres.integration.ts`.

## Deriva Prisma ↔ SQL (hallazgo para NEXUS)
`prisma migrate diff` contra una base con todas las migraciones reporta deriva **preexistente** (FK y CHECK del repositorio gestionados en SQL, p. ej. `apartados`, `cajas`, `costos_compra`). De esta migración aparecen:
1. Las FK compuestas y `UNIQUE(tenant_id, id)` no están en `schema.prisma` (Prisma las modela como escalares). Seguro mientras nadie ejecute `prisma migrate dev`/`db push`; **no regenerar migraciones desde el esquema**.
2. Nombres de índices distintos a los que Prisma espera (`entregas_eventos_tenant_fecha_idx` vs `…_tenant_id_created_at_idx`, etc.): solo renombres.
3. `detalles_venta.tenant_id`: Prisma lo declara opcional; la base lo exige NOT NULL (no es riesgo de datos).
Decisión pedida: ¿alinear nombres y nulabilidad en este PR o en uno de NEXUS? Recomendación: PR de NEXUS, para no tocar una migración revisada.

## Compatibilidad
- **KARDEX:** el mismo movimiento `ENTREGA/DEVOLUCION` ahora lleva `evento_id` y `detalle_venta_id`; contrato `precioAprobado` = producto activo con `precioVenta > 0` (catálogo offline y validación al sincronizar).
- **BALANCE:** el dinero se mueve solo al cobrar y en devoluciones (sin cambios); entregar, preparar y liberar no tocan caja ni cuentas.
- **FORJA:** la API nueva `/entregas/*` y `POST /operaciones/ventas/:id/entregar` exigen `solicitudId` (UUID v4) y `receptorNombre`; el cliente debe generar la solicitud al abrir el formulario y conservarla en reintentos.
- **CENTINELA:** entrega solo ADMIN/BODEGUERO; CAJERO consulta solo sus ventas; liberación solo ADMIN; aislamiento por `tenant_id` verificado por pruebas y claves foráneas.
