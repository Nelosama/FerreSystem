-- ATLAS — NORMALIZACIÓN PREVIA (D-01) de datos históricos para la migración 20261012000000_entrega_eventos_y_cantidades.
-- NO es una migración: no está en prisma/migrations y no se aplica con `migrate deploy`. La migración de entregas NO se modifica
-- (es inmutable); este script prepara los datos de una base que AÚN NO la ha aplicado y la migración corre sin cambios.
--
-- Cuándo usarlo: solo si la consulta de verificación (docs/ATLAS_CORRECCIONES_FINALES_148.md §D-01) devuelve filas, o si
-- `migrate deploy` abortó con «Backfill de entregas inconsistente» (la transacción de Prisma ya revirtió todo).
-- Ejecutar con respaldo de la base y autorización del responsable:
--   PGOPTIONS="-c ferre.autoriza_normalizacion=SI" psql -v ON_ERROR_STOP=1 -f 00_normalizar_historico_previo.sql
--
-- Qué hace (en una sola transacción; si algo falla no cambia nada):
--  1. Se niega a ejecutar si la migración de entregas ya está aplicada o falta la autorización.
--  2. Guarda el valor original de cada fila que cambiará en el esquema `respaldo_entregas_148_previo` (evidencia, sin borrar nada).
--  3. Devoluciones registradas con destino físico (INVENTARIO, DAÑADO, PROVEEDOR) sobre ventas con reserva pendiente y SIN entrega:
--     la lógica anterior solo reducía la reserva y no tocaba existencias, así que esas unidades nunca salieron. Su destino pasa a
--     NO_ENTREGADO (el destino que la regla vigente exige para mercancía reservada).
--  4. Ventas sin reserva pendiente y sin fecha de entrega (la mercancía salió del inventario al vender) que tienen devoluciones
--     físicas: se les asigna `entregado_at = created_at`, para que la migración las cuente como entregadas.
-- No modifica importes, reembolsos, caja, existencias ni reservas.

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.entregas_eventos') IS NOT NULL THEN
    RAISE EXCEPTION 'La migración de entregas ya está aplicada: este script solo prepara bases que aún no la tienen';
  END IF;
  IF COALESCE(current_setting('ferre.autoriza_normalizacion', true), '') <> 'SI' THEN
    RAISE EXCEPTION 'Falta la autorización: ejecute con PGOPTIONS="-c ferre.autoriza_normalizacion=SI" después de respaldar la base';
  END IF;
  IF to_regclass('respaldo_entregas_148_previo.detalles_devolucion_destino') IS NOT NULL THEN
    RAISE EXCEPTION 'Ya existe un respaldo de una normalización anterior (esquema respaldo_entregas_148_previo): revíselo antes de repetir';
  END IF;
END $$;

CREATE SCHEMA respaldo_entregas_148_previo;

-- (3) devoluciones físicas sobre reserva no entregada
CREATE TABLE respaldo_entregas_148_previo.detalles_devolucion_destino AS
  SELECT dd.id, dd.devolucion_id, dd.detalle_venta_id, dd.cantidad, dd.destino AS destino_original, NOW() AS respaldado_at
    FROM detalles_devolucion dd
    JOIN detalles_venta d ON d.id = dd.detalle_venta_id AND d.sin_inventario = false
    JOIN ventas v ON v.id = d.venta_id
   WHERE v.reserva_pendiente = true AND v.entregado_at IS NULL AND dd.destino IN ('INVENTARIO', 'DAÑADO', 'PROVEEDOR');

UPDATE detalles_devolucion dd SET destino = 'NO_ENTREGADO'
 WHERE dd.id IN (SELECT id FROM respaldo_entregas_148_previo.detalles_devolucion_destino);

-- (4) ventas sin reserva y sin fecha de entrega con devoluciones físicas
CREATE TABLE respaldo_entregas_148_previo.ventas_entregado_at AS
  SELECT v.id, v.tenant_id, v.entregado_at AS entregado_at_original, v.created_at, NOW() AS respaldado_at
    FROM ventas v
   WHERE v.reserva_pendiente = false AND v.entregado_at IS NULL AND v.origen <> 'CONTINGENCIA'
     AND EXISTS (SELECT 1 FROM detalles_venta d JOIN detalles_devolucion dd ON dd.detalle_venta_id = d.id
                  WHERE d.venta_id = v.id AND d.sin_inventario = false AND dd.destino IN ('INVENTARIO', 'DAÑADO', 'PROVEEDOR'));

UPDATE ventas v SET entregado_at = v.created_at
 WHERE v.id IN (SELECT id FROM respaldo_entregas_148_previo.ventas_entregado_at);

DO $$
DECLARE a INTEGER; b INTEGER;
BEGIN
  SELECT COUNT(*) INTO a FROM respaldo_entregas_148_previo.detalles_devolucion_destino;
  SELECT COUNT(*) INTO b FROM respaldo_entregas_148_previo.ventas_entregado_at;
  RAISE NOTICE 'Normalización previa: % devoluciones con destino corregido, % ventas con fecha de entrega asignada (respaldo en respaldo_entregas_148_previo)', a, b;
END $$;

COMMIT;
