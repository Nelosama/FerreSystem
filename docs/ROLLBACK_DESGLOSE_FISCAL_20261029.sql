-- ROLLBACK de 20261029000000_desglose_fiscal_linea — NO es una migración de Prisma: no se ejecuta sola.
-- Ensayado en PostgreSQL 16 aislado con datos sintéticos (ventas anteriores intactas). No ejecutar contra
-- bases reales sin autorización explícita: los DROP son destructivos y exigen APROBACION-DESTRUCTIVA.
-- Antes de ejecutar: respaldo verificado. Si ya hay filas con desglose, esas columnas se pierden.
BEGIN;
ALTER TABLE "detalles_devolucion" DROP CONSTRAINT "detalles_devolucion_desglose_chk";
ALTER TABLE "detalles_devolucion" DROP COLUMN "base_gravada", DROP COLUMN "base_exenta", DROP COLUMN "isv";
ALTER TABLE "detalles_venta" DROP CONSTRAINT "detalles_venta_desglose_valores_chk";
ALTER TABLE "detalles_venta" DROP CONSTRAINT "detalles_venta_desglose_completo_chk";
ALTER TABLE "detalles_venta" DROP COLUMN "exento", DROP COLUMN "base_gravada", DROP COLUMN "base_exenta", DROP COLUMN "isv", DROP COLUMN "tasa_isv";
COMMIT;
