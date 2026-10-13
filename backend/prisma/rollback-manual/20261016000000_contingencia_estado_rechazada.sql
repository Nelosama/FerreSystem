-- Reversión manual (NO automática, no incluida en migrate deploy). Ejecutar solo con respaldo y autorización.
-- Vuelve las RECHAZADA a REVISION (su forma anterior) y restaura la restricción original.
UPDATE "operaciones_contingencia" SET "estado" = 'REVISION' WHERE "estado" = 'RECHAZADA';
ALTER TABLE "operaciones_contingencia" DROP CONSTRAINT IF EXISTS "operaciones_contingencia_rechazada_sin_venta_check";
ALTER TABLE "operaciones_contingencia" DROP CONSTRAINT IF EXISTS "operaciones_contingencia_estado_check";
ALTER TABLE "operaciones_contingencia" ADD CONSTRAINT "operaciones_contingencia_estado_check"
  CHECK ("estado" IN ('RECIBIDA', 'APLICADA', 'REVISION', 'RESUELTA_MANUAL'));
