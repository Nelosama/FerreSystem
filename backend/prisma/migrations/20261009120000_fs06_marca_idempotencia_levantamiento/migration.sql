-- FS-06 fase 2: marca del producto en catálogo y clave de solicitud para crear levantamientos.
-- Solo agrega columnas nullables: no modifica filas existentes ni inventarios.

ALTER TABLE "productos" ADD COLUMN "marca" TEXT;

ALTER TABLE "levantamientos" ADD COLUMN "solicitud_id" TEXT,
ADD COLUMN "solicitud_hash" TEXT;

-- Unicidad por empresa. Los levantamientos históricos tienen solicitud_id NULL, que PostgreSQL no compara como igual.
CREATE UNIQUE INDEX "levantamientos_tenant_id_solicitud_id_key" ON "levantamientos"("tenant_id", "solicitud_id");
