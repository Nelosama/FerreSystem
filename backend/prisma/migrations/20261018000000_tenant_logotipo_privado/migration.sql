-- Logotipo corporativo por negocio en almacenamiento privado.
-- Cambio aditivo (NEXUS): solo columnas nuevas y nulas; no modifica datos existentes.
-- PostgreSQL guarda referencia y metadatos; los bytes viven en el almacenamiento privado.

ALTER TABLE "tenants"
  ADD COLUMN "logo_storage_key" TEXT,
  ADD COLUMN "logo_mime" TEXT,
  ADD COLUMN "logo_bytes" INTEGER,
  ADD COLUMN "logo_actualizado_at" TIMESTAMP(3);

ALTER TABLE "tenants" ADD CONSTRAINT "tenants_logo_mime_check"
  CHECK ("logo_mime" IS NULL OR "logo_mime" IN ('image/png', 'image/jpeg', 'image/webp'));

ALTER TABLE "tenants" ADD CONSTRAINT "tenants_logo_bytes_check"
  CHECK ("logo_bytes" IS NULL OR ("logo_bytes" > 0 AND "logo_bytes" <= 2097152));

ALTER TABLE "tenants" ADD CONSTRAINT "tenants_logo_coherencia_check"
  CHECK (("logo_storage_key" IS NULL AND "logo_mime" IS NULL AND "logo_bytes" IS NULL AND "logo_actualizado_at" IS NULL)
    OR ("logo_storage_key" IS NOT NULL AND "logo_mime" IS NOT NULL AND "logo_bytes" IS NOT NULL AND "logo_actualizado_at" IS NOT NULL));
