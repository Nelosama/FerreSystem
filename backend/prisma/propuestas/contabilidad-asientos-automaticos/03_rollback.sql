-- Reversión de la propuesta. Falla (a propósito) si ya existen asientos automáticos: no destruye contabilidad.
BEGIN;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM "contable_asientos" WHERE "origen" = 'AUTOMATICO') THEN
    RAISE EXCEPTION 'Existen asientos automáticos; no se revierte la propuesta. Respalde y revierta con NEXUS.';
  END IF;
END $$;
DROP TABLE "contable_mapeos";
DROP FUNCTION "contable_mapeo_solo_cierre"();
DROP FUNCTION "contable_mapeo_sin_solape"();
DROP INDEX "contable_asientos_origen_idx";
DROP INDEX "contable_asientos_origen_key";
ALTER TABLE "contable_asientos" DROP CONSTRAINT "contable_asientos_lote_fkey";
ALTER TABLE "contable_asientos" DROP CONSTRAINT "contable_asientos_automatico_chk";
ALTER TABLE "contable_asientos" DROP CONSTRAINT "contable_asientos_origen_chk";
ALTER TABLE "contable_asientos" ADD CONSTRAINT "contable_asientos_origen_chk"
  CHECK ("origen" IN ('MANUAL', 'REVERSION') AND (("origen" = 'REVERSION') = ("revierte_id" IS NOT NULL)));
ALTER TABLE "contable_asientos"
  DROP COLUMN "huella_origen", DROP COLUMN "regla_version", DROP COLUMN "lote_id",
  DROP COLUMN "evento", DROP COLUMN "origen_id", DROP COLUMN "origen_tipo";
DROP TABLE "contable_lotes";
COMMIT;
