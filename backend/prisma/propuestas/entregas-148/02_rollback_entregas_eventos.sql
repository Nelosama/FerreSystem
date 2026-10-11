-- PROPUESTA CENTINELA. NO es una migración: no está en prisma/migrations y no se aplica con `migrate deploy`.
-- Reversión de 20261012000000_entrega_eventos_y_cantidades. Deshace exactamente los objetos que la migración crea.
--
-- ADVERTENCIA: es DESTRUCTIVA para los datos de entrega. Borra entregas_eventos, entregas_eventos_lineas, los
-- contadores de cantidades y las columnas evento_id/detalle_venta_id de movimientos_inventario. Solo es segura
-- antes de que el código nuevo registre el primer evento de entrega, o con respaldo y autorización explícita.
-- Ejecutar en una sola transacción. No modifica filas de ventas, productos ni devoluciones existentes.

BEGIN;

-- Disparadores y funciones (orden inverso a la creación)
DROP TRIGGER IF EXISTS "detalles_venta_modo_inmutable_tg" ON "detalles_venta";
DROP FUNCTION IF EXISTS "detalles_venta_modo_inmutable"();
DROP TRIGGER IF EXISTS "entregas_eventos_lineas_inmutables_tg" ON "entregas_eventos_lineas";
DROP TRIGGER IF EXISTS "entregas_eventos_inmutables_tg" ON "entregas_eventos";
DROP FUNCTION IF EXISTS "entregas_eventos_inmutables"();
DROP TRIGGER IF EXISTS "detalles_venta_tenant_bi" ON "detalles_venta";
DROP FUNCTION IF EXISTS "detalles_venta_tenant_desde_venta"();

-- Restricciones de cantidades y de existencias
ALTER TABLE "productos" DROP CONSTRAINT IF EXISTS "productos_stock_reservado_no_negativo_chk";
ALTER TABLE "detalles_venta"
  DROP CONSTRAINT IF EXISTS "detalles_venta_sin_inv_contadores_chk",
  DROP CONSTRAINT IF EXISTS "detalles_venta_i5_chk",
  DROP CONSTRAINT IF EXISTS "detalles_venta_i4_chk",
  DROP CONSTRAINT IF EXISTS "detalles_venta_i3_chk",
  DROP CONSTRAINT IF EXISTS "detalles_venta_i2_chk",
  DROP CONSTRAINT IF EXISTS "detalles_venta_no_negativos_chk",
  DROP CONSTRAINT IF EXISTS "detalles_venta_sin_inventario_chk",
  DROP CONSTRAINT IF EXISTS "detalles_venta_modo_chk";

-- Movimientos de inventario con evento y línea
DROP INDEX IF EXISTS "movimientos_evento_linea_key";
ALTER TABLE "movimientos_inventario"
  DROP CONSTRAINT IF EXISTS "movimientos_producto_tenant_fkey",
  DROP CONSTRAINT IF EXISTS "movimientos_detalle_fkey",
  DROP CONSTRAINT IF EXISTS "movimientos_evento_fkey";
ALTER TABLE "movimientos_inventario" DROP COLUMN IF EXISTS "detalle_venta_id", DROP COLUMN IF EXISTS "evento_id";
-- La FK original de producto (sin tenant) vuelve a existir como la creó la migración anterior.

-- Eventos de entrega (primero la línea, que referencia al evento)
DROP TABLE IF EXISTS "entregas_eventos_lineas";
DROP TABLE IF EXISTS "entregas_eventos";

-- Claves compuestas por tenant y relaciones de detalles_venta
ALTER TABLE "detalles_venta"
  DROP CONSTRAINT IF EXISTS "detalles_venta_tenant_producto_fkey",
  DROP CONSTRAINT IF EXISTS "detalles_venta_tenant_venta_fkey",
  DROP CONSTRAINT IF EXISTS "detalles_venta_tenant_id_id_key";
ALTER TABLE "usuarios" DROP CONSTRAINT IF EXISTS "usuarios_tenant_id_id_key";
ALTER TABLE "productos" DROP CONSTRAINT IF EXISTS "productos_tenant_id_id_key";
ALTER TABLE "ventas" DROP CONSTRAINT IF EXISTS "ventas_tenant_id_id_key";

-- Columnas añadidas a detalles_venta (elimina también su CHECK y su FK a tenants)
ALTER TABLE "detalles_venta"
  DROP COLUMN IF EXISTS "cantidad_cancelada",
  DROP COLUMN IF EXISTS "cantidad_devuelta_sin_reingreso",
  DROP COLUMN IF EXISTS "cantidad_devuelta_reingresada",
  DROP COLUMN IF EXISTS "cantidad_entregada",
  DROP COLUMN IF EXISTS "cantidad_preparada",
  DROP COLUMN IF EXISTS "modo_entrega",
  DROP COLUMN IF EXISTS "tenant_id";

COMMIT;
