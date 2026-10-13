# Propuesta: integridad referencial con tenant (FK compuestas) — NEXUS (2026-10-10)

**Firma:** NEXUS. **Estado:** propuesta con piloto validado en PostgreSQL 16 temporal. **No** hay migración en `prisma/migrations/`, no se tocó producción y no se ejecuta nada sin autorización. Responde a la lista de CENTINELA (`CENTINELA_FK_COMPUESTAS_PARA_NEXUS_20261010.md`) y al requisito del dueño.

## 1. Problema medido

En el esquema combinado (20 migraciones) **no existe ninguna FK compuesta con `tenant_id`** y ningún padre tiene `UNIQUE (tenant_id, id)`. Las 42 FK de una columna entre tablas con `tenant_id` solo garantizan que el padre existe, no que sea de la misma empresa. Reproducido: una fila de `productos_proveedores` de la empresa A que apunta a un producto de la empresa B fue aceptada por la base (prueba `tenant-fk-propuesta`, caso "riesgo actual").

Alcance de la medición: `backend/scripts/auditoria-tenant-cruzado-lectura.sql` (48 comprobaciones de solo lectura; 42 FK, 5 comparaciones padre-padre para líneas sin `tenant_id` y 1 de dos saltos). Solo detecta, nunca modifica.

## 2. Evaluación de lo que ya existe

| Aspecto | Hallazgo (base combinada) |
|---|---|
| FK de una columna entre tablas con tenant | 42 |
| Padres con `UNIQUE (tenant_id, id)` | 0 (requisito previo de cualquier FK compuesta) |
| Tablas hijas **sin** `tenant_id` | 11: `abonos_apartado`, `detalles_compra_proveedor`, `detalles_cotizacion`, `detalles_devolucion`, `detalles_orden_compra`, `detalles_transferencia`, `detalles_venta`, `historial_garantias`, `levantamiento_items`, `movimientos_caja`, `pagos_proveedor` |
| FK con índice que empieza en la columna FK | 5 de 42 |
| FK con índice `(tenant_id, columna)` | 12 de 42 |
| FK **sin** índice de apoyo en la tabla hija | **26 de 42** |
| Trigger de coherencia de tenant | solo `coberturas_garantia` |

Consecuencias: (a) la FK compuesta de inserción no necesita índice, pero borrar o actualizar un padre recorrería la tabla hija en 26 casos: conviene crear el índice `(tenant_id, columna)` junto con cada FK; (b) las 11 tablas sin `tenant_id` necesitan la columna y un *backfill* desde el padre antes de poder tener FK compuesta.

## 3. Diseño (aditivo y reversible)

Tres pasos separados, cada uno en su propia migración y con su reversión:

1. **Unicidad auxiliar** `UNIQUE (tenant_id, id)` en los padres. Es redundante con la PK; solo habilita la FK compuesta.
2. **FK compuesta `NOT VALID`**. Se aplica a escrituras nuevas, no revisa filas existentes (no falla por datos heredados), con bloqueo breve. `MATCH SIMPLE`: una columna FK nula no se exige.
3. **`VALIDATE CONSTRAINT`**, solo cuando la auditoría de solo lectura no devuelve filas. No bloquea lecturas ni escrituras y falla sin cambiar nada si aún hay datos incoherentes.

Las FK de una columna **no se eliminan** en este diseño. Retirarlas es un paso posterior, aparte, con aprobación explícita independiente (es el único paso con carácter destructivo, aunque solo de metadatos).

Orden recomendado (el de CENTINELA §4, con una adición):
1. Auditoría de solo lectura en producción; sin resultado vacío no se avanza.
2. Piloto en tablas **nuevas** de FORJA, ATLAS y BALANCE: `productos_proveedores`, `operaciones_contingencia`, `aprobaciones_bancarias`, `conciliaciones_bancarias`. No tienen historial: la validación es inmediata.
3. P1 de CENTINELA en tablas existentes (dinero, existencias, ventas, caja), una migración por tabla padre.
4. P2.
5. Para las 11 tablas sin `tenant_id`: columna nullable, *backfill* desde el padre, auditoría, `NOT NULL`, FK compuesta.
6. Índices `(tenant_id, columna)` de las 26 FK sin apoyo.

## 4. Piloto validado

Archivos en `backend/prisma/propuestas/tenant-fk-compuestas/` (fuera de `prisma/migrations/`, `migrate deploy` no los aplica):

| Archivo | Contenido |
|---|---|
| `01_up_piloto.sql` | 3 `UNIQUE (tenant_id,id)` y 3 FK compuestas `NOT VALID`: `productos_proveedores`→`productos`, →`proveedores`, `ventas`→`clientes` (opcional) |
| `02_validate_piloto.sql` | `VALIDATE CONSTRAINT` de las tres |
| `03_rollback_piloto.sql` | Elimina solo lo añadido |
| `04_schema_piloto.diff` | Parche de `schema.prisma` que modela las FK compuestas |

Prueba automática `backend/test/tenant-fk-propuesta.postgres.integration.ts` (12/12 con la prueba de deriva, 15/15 en conjunto), clúster temporal con dos empresas y un dato heredado incorrecto:

- La auditoría detecta el dato heredado.
- `UP` no falla con el dato heredado y **no modifica ninguna fila**.
- Rechaza una inserción nueva con producto de otra empresa y otra con proveedor de otra empresa; acepta las válidas.
- `ventas`: rechaza cliente de otra empresa; acepta cliente propio y venta sin cliente.
- `VALIDATE` falla mientras exista el dato heredado y pasa tras corregirlo con decisión explícita.
- `ROLLBACK` conserva filas y FK originales. Repetible: `UP`, `ROLLBACK`, `UP`.

**Compatibilidad con Prisma (probada en copia de esquema):**
- Prisma acepta relaciones compuestas `fields: [tenantId, productoId], references: [tenantId, id]`, incluida la opcional de `ventas.cliente`, con `@@unique([tenantId, id])` en los padres.
- Con el piloto aplicado y el parche modelado, `prisma migrate diff` da **0 líneas**. Sin el SQL, Prisma propone exactamente `CREATE UNIQUE INDEX` y `ADD CONSTRAINT` equivalentes.
- **Hay que modelar las FK en `schema.prisma`**: si solo existen en la base, `migrate diff` propondría eliminarlas y volvería la deriva. Mientras coexistan con la FK de una columna se necesitan dos campos de relación con nombre (`@relation("PPProductoTenant", …)`).
- `onDelete: SetNull` no sirve en FK compuesta (Prisma anularía también `tenant_id`, que es `NOT NULL`). El piloto usa `NoAction`. Cambia el comportamiento solo si se retira la FK original de `ventas.cliente_id` (hoy `SET NULL`); decisión del dueño.

## 5. Riesgos y límites

- Los datos de prueba son sintéticos. No se sabe cuántas filas incoherentes hay en producción: depende de la auditoría de solo lectura.
- `ADD CONSTRAINT … UNIQUE` toma un bloqueo breve de la tabla; en tablas grandes conviene una ventana de baja actividad y medir.
- El piloto no cubre las 11 tablas sin `tenant_id`, que requieren *backfill* (sí cambia datos nuevos, solo añade valores derivados) y por eso exigen respaldo y aprobación.
- Las consultas de aplicación deben seguir filtrando por `tenant_id`: la FK es una segunda línea de defensa (CENTINELA lo verifica por endpoint).
- Antes de retirar cualquier FK de una columna, repetir la auditoría y obtener aprobación independiente.

## 6. Decisiones del dueño

1. Aprobar el piloto en las 4 tablas nuevas como primer paso real (recomendado).
2. Autorizar la auditoría de solo lectura en producción (procedimiento en `VERIFICACION_PRODUCCION_SOLO_LECTURA_NEXUS.md`).
3. Decidir si se retiran después las FK de una columna (recomendado: no hasta tener una semana de operación estable con la compuesta validada).

*Firmado: NEXUS.*
