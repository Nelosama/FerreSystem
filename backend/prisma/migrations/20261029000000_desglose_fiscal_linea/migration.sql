-- NEXUS — desglose fiscal histórico por línea de venta y de devolución (docs/AUDITORIA_DEVOLUCIONES_EXENCIONES_20261029.md).
-- Solo aditiva: columnas nulas sin valor por defecto (cambio de catálogo, sin reescribir la tabla) y restricciones CHECK.
-- No rellena ventas existentes: NULL significa «sin desglose» y conserva la regla de devolución vigente para esas ventas.
-- Restricciones NOT VALID + VALIDATE: el recorrido de validación es trivial porque las columnas nuevas son NULL en todas las filas.

ALTER TABLE "detalles_venta"
  ADD COLUMN "exento" BOOLEAN,
  ADD COLUMN "base_gravada" DECIMAL(12,2),
  ADD COLUMN "base_exenta" DECIMAL(12,2),
  ADD COLUMN "isv" DECIMAL(12,2),
  ADD COLUMN "tasa_isv" DECIMAL(5,2);

ALTER TABLE "detalles_venta" ADD CONSTRAINT "detalles_venta_desglose_completo_chk" CHECK (
  ("exento" IS NULL AND "base_gravada" IS NULL AND "base_exenta" IS NULL AND "isv" IS NULL AND "tasa_isv" IS NULL)
  OR ("exento" IS NOT NULL AND "base_gravada" IS NOT NULL AND "base_exenta" IS NOT NULL AND "isv" IS NOT NULL AND "tasa_isv" IS NOT NULL)
) NOT VALID;
ALTER TABLE "detalles_venta" ADD CONSTRAINT "detalles_venta_desglose_valores_chk" CHECK (
  "exento" IS NULL OR (
    "base_gravada" >= 0 AND "base_exenta" >= 0 AND "isv" >= 0 AND "tasa_isv" >= 0 AND "tasa_isv" < 100
    AND "base_gravada" + "base_exenta" <= "subtotal"
    AND (("exento" AND "base_gravada" = 0 AND "isv" = 0) OR (NOT "exento" AND "base_exenta" = 0))
  )
) NOT VALID;
ALTER TABLE "detalles_venta" VALIDATE CONSTRAINT "detalles_venta_desglose_completo_chk";
ALTER TABLE "detalles_venta" VALIDATE CONSTRAINT "detalles_venta_desglose_valores_chk";

ALTER TABLE "detalles_devolucion"
  ADD COLUMN "base_gravada" DECIMAL(12,2),
  ADD COLUMN "base_exenta" DECIMAL(12,2),
  ADD COLUMN "isv" DECIMAL(12,2);

ALTER TABLE "detalles_devolucion" ADD CONSTRAINT "detalles_devolucion_desglose_chk" CHECK (
  ("base_gravada" IS NULL AND "base_exenta" IS NULL AND "isv" IS NULL)
  OR ("base_gravada" >= 0 AND "base_exenta" >= 0 AND "isv" >= 0)
) NOT VALID;
ALTER TABLE "detalles_devolucion" VALIDATE CONSTRAINT "detalles_devolucion_desglose_chk";
