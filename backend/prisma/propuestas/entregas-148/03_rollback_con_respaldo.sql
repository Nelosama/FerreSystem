-- ATLAS — REVERSIÓN CON RESPALDO de 20261012000000_entrega_eventos_y_cantidades (procedimiento D-02).
-- NO es una migración: no está en prisma/migrations y no se aplica con `migrate deploy`.
--
-- Diferencia con 02_rollback_entregas_eventos.sql: ESTE SCRIPT NUNCA ELIMINA EVENTOS EN SILENCIO.
--   1. Si ya existen eventos distintos de COBRO (entregas, preparaciones, liberaciones o devoluciones registradas con el
--      código nuevo), se NIEGA a ejecutarse, salvo autorización explícita de la sesión:
--        PGOPTIONS="-c ferre.autoriza_perdida=SI" psql -v ON_ERROR_STOP=1 -f 03_rollback_con_respaldo.sql
--   2. Antes de borrar nada, copia eventos, líneas, contadores por línea y vínculos de movimientos al esquema
--      `respaldo_entregas_148_<fecha>` (misma transacción). Si el respaldo falla, no se borra nada.
--   3. Las existencias, ventas, devoluciones y el estado de entrega de la venta (entregado_at, reserva_pendiente) NO se
--      modifican: el flujo anterior sigue funcionando, pero ya no distingue entregas parciales (eso queda en el respaldo).
--
-- Si no es posible volver sin perder información (hay entregas parciales o eventos), el camino recomendado es la RECUPERACIÓN
-- HACIA ADELANTE: corregir el código o los datos y mantener el esquema nuevo (ver docs/ATLAS_CORRECCIONES_FINALES_148.md §D-02).
-- Ejecutar en una sola transacción.

BEGIN;

DO $$
DECLARE
  hay_eventos INTEGER;
  hay_no_cobro INTEGER;
  esquema TEXT := 'respaldo_entregas_148_' || to_char(clock_timestamp(), 'YYYYMMDD_HH24MISS');
BEGIN
  IF to_regclass('public.entregas_eventos') IS NULL THEN
    RAISE EXCEPTION 'La migración de entregas no está aplicada: no hay nada que revertir';
  END IF;
  SELECT COUNT(*) INTO hay_eventos FROM public.entregas_eventos;
  SELECT COUNT(*) INTO hay_no_cobro FROM public.entregas_eventos WHERE tipo <> 'COBRO';
  IF hay_no_cobro > 0 AND COALESCE(current_setting('ferre.autoriza_perdida', true), '') <> 'SI' THEN
    RAISE EXCEPTION 'Hay % eventos de entrega/devolución registrados; revertir pierde el detalle de entregas parciales. Use la recuperación hacia adelante o autorice con ferre.autoriza_perdida=SI (se hará respaldo)', hay_no_cobro;
  END IF;
  EXECUTE format('CREATE SCHEMA %I', esquema);
  EXECUTE format('CREATE TABLE %I.entregas_eventos AS SELECT * FROM public.entregas_eventos', esquema);
  EXECUTE format('CREATE TABLE %I.entregas_eventos_lineas AS SELECT * FROM public.entregas_eventos_lineas', esquema);
  EXECUTE format('CREATE TABLE %I.detalles_venta_contadores AS SELECT id, tenant_id, venta_id, modo_entrega, cantidad, cantidad_preparada, cantidad_entregada, cantidad_devuelta_reingresada, cantidad_devuelta_sin_reingreso, cantidad_cancelada FROM public.detalles_venta', esquema);
  EXECUTE format('CREATE TABLE %I.movimientos_evento AS SELECT id, tenant_id, evento_id, detalle_venta_id FROM public.movimientos_inventario WHERE evento_id IS NOT NULL OR detalle_venta_id IS NOT NULL', esquema);
  RAISE NOTICE 'Respaldo creado en el esquema % (% eventos, % no de cobro)', esquema, hay_eventos, hay_no_cobro;
END $$;

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
