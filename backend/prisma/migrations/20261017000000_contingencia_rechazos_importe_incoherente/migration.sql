-- APROBACION-DESTRUCTIVA: CONT-1017 @Nelosama
-- F5 (decisión del propietario, opción B): el diario registra los rechazos por importes incoherentes (total cero o cobro menor
-- al total) como operaciones RECHAZADA, sin venta ni movimiento de caja. Hasta ahora quedaban solo como evidencia de auditoría
-- porque operaciones_contingencia_montos_check exigía total > 0 y efectivo >= total para toda fila.
--
-- Cambio: se reemplaza (DROP CONSTRAINT + ADD CONSTRAINT) esa restricción por una que mantiene la regla exacta para toda fila
-- que no sea un cierre sin venta y, para RECHAZADA y RESUELTA_MANUAL (estados terminales sin venta), solo exige importes no
-- negativos. RESUELTA_MANUAL hace falta porque «cerrar sin venta» un rechazo por importe incoherente cambia su estado a
-- RESUELTA_MANUAL (una prueba contra PostgreSQL real lo detectó). Es el único DROP: no se borran filas ni columnas
-- y no se modifica ninguna migración publicada. La marca de arriba es la aprobación que exige el guard de CI (requiere CODEOWNERS).
--
-- Invariantes que se conservan:
--   * operaciones_contingencia_rechazada_sin_venta_check: una fila RECHAZADA nunca tiene venta (venta_id NULL).
--   * Toda fila RECIBIDA, APLICADA o REVISION sigue cumpliendo total > 0 y efectivo >= total.
-- Reversión manual (fuera de las migraciones, no automática): backend/prisma/rollback-manual/20261017000000_contingencia_rechazos_importe_incoherente.sql

ALTER TABLE "operaciones_contingencia" DROP CONSTRAINT IF EXISTS "operaciones_contingencia_montos_check";
ALTER TABLE "operaciones_contingencia" ADD CONSTRAINT "operaciones_contingencia_montos_check"
  CHECK (
    ("estado" IN ('RECHAZADA', 'RESUELTA_MANUAL') AND "total_centavos" >= 0 AND "efectivo_recibido_centavos" >= 0)
    OR ("total_centavos" > 0 AND "efectivo_recibido_centavos" >= "total_centavos")
  );
