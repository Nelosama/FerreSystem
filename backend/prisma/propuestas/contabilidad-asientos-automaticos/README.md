# Propuesta NEXUS — asientos automáticos de Contabilidad

**Estado:** propuesta validada en PostgreSQL efímero. **No es una migración** y no está en `prisma/migrations/` ni en `schema.prisma`: falta la **autorización del dueño** y la **firma de NEXUS** (`docs/agentes/NEXUS.md`: los cambios de esquema pasan por NEXUS). Depende de las migraciones del PR #180 (`20261020000000_rol_contador`, `20261020000100_contabilidad_honduras`).

## Qué resuelve
Contabilizar ventas, cobros, compras, pagos y devoluciones **sin duplicar** y con trazabilidad al documento original, sin tocar las tablas operativas:

| Pieza | Propósito |
|---|---|
| `contable_asientos` + `origen_tipo`, `origen_id`, `evento`, `lote_id`, `regla_version`, `huella_origen` | Origen del asiento automático (`origen='AUTOMATICO'`). Índice único parcial `(tenant_id, origen_tipo, origen_id, evento)`: una operación se contabiliza una sola vez por evento, aunque su asiento se revierta |
| `contable_lotes` | Una ejecución de «contabilizar» de un período. Único `(tenant_id, solicitud_id)`: reintentar la misma solicitud no crea otro lote. Solo inserción |
| `contable_mapeos` | Concepto → cuenta, con vigencia sin solape. Sin datos precargados: lo define el contador. Solo se cierra su vigencia |

Todo es aditivo: columnas nulas, dos tablas nuevas y la ampliación del CHECK `contable_asientos_origen_chk` (agrega `AUTOMATICO`). No cambia ninguna fila existente ni las reglas de cuadre, inmutabilidad o reversión del PR #180.

## Archivos
- `01_up.sql` — transaccional; repetirlo falla sin dejar cambios parciales.
- `02_validate.sql` — comprobación de solo lectura (`OK`/`FALTA`).
- `03_rollback.sql` — se niega a ejecutarse si ya existen asientos automáticos (no destruye contabilidad).
- Prueba: `backend/test/contabilidad-asientos-automaticos-propuesta.postgres.integration.ts` (14 casos: cero filas modificadas, duplicados por evento, otra empresa, datos de origen incompletos, lote ajeno, idempotencia, inmutabilidad, vigencias, cuentas/usuarios de otra empresa, cuadre diferido, rollback).

## Defecto encontrado durante la validación
En un `CHECK`, un resultado `NULL` cuenta como «cumple». La primera versión permitía un asiento automático sin `huella_origen`. Corregido con `IS NOT NULL` explícito por columna; la prueba «sin huella» lo cubre.

## Para convertirla en migración (cuando se autorice)
1. Copiar `01_up.sql` a `prisma/migrations/<marca>_contabilidad_asientos_automaticos/migration.sql` (sin `BEGIN/COMMIT`: Prisma ya envuelve la migración).
2. Declarar en `schema.prisma` las columnas nuevas de `ContableAsiento`, los modelos `ContableLote` y `ContableMapeo` y las relaciones con `Tenant`/`Usuario`; comprobar `prisma migrate diff` vacío y el guard `esquema-deriva`.
3. Añadir la migración y su checksum a `scripts/estado-base-solo-lectura.sql`.
4. Respaldo verificado antes de `migrate:deploy`; nunca contra producción desde un agente.

## Lo que ya existe sin esquema (en `src/contabilidad/motor/`)
Reglas puras, adaptadores fila→entrada, resolución concepto→cuenta con vigencia, clave/huella de origen y `proponer()`. Solo falta el servicio con base de datos, que necesita este esquema:

- `GET /contabilidad/pendientes?anio&mes`: lee ventas/pagos/compras/devoluciones del período que **no** tienen asiento con su `(origen_tipo, origen_id, evento)` (anti-join) y devuelve su `Propuesta` (LISTA / FALTA_MAPEO / SIN_ASIENTO / ERROR).
- `POST /contabilidad/lotes` `{ solicitudId, anio, mes, claves[] }`: una transacción con `lockTenant` y `authorizedActor`; revalida período abierto, recalcula cada propuesta con los datos actuales, inserta lote y asientos y audita. Si una clave ya existe, se omite (idempotente).
- Políticas pendientes del contador (`descuento` BRUTO/NETO, `momentoInventario` FACTURA/RECEPCION): se guardarán en la configuración fiscal de la empresa; sin ellas el endpoint responde que faltan, no usa un valor por defecto.
