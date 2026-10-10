-- PROPUESTA NEXUS (NO es una migración; no está en prisma/migrations y no se aplica con `migrate deploy`).
-- Piloto de integridad referencial con tenant: FK compuestas (tenant_id, id). Aditivo y reversible.
-- Requisito previo: auditoría de solo lectura (scripts/auditoria-tenant-cruzado-lectura.sql) sin filas, o con casos explicados.
-- Esta secuencia NO elimina las FK de una columna existentes ni modifica filas.

-- Paso 1. Unicidad auxiliar que exige PostgreSQL para referenciar (tenant_id, id). Es redundante con la PK (id ya es único).
ALTER TABLE "productos"   ADD CONSTRAINT "productos_tenant_id_id_key"   UNIQUE ("tenant_id", "id");
ALTER TABLE "proveedores" ADD CONSTRAINT "proveedores_tenant_id_id_key" UNIQUE ("tenant_id", "id");
ALTER TABLE "clientes"    ADD CONSTRAINT "clientes_tenant_id_id_key"    UNIQUE ("tenant_id", "id");

-- Paso 2. FK compuestas NOT VALID: se aplican a inserciones y cambios NUEVOS; no revisan las filas existentes,
-- así que no fallan por datos heredados y el bloqueo es breve. MATCH SIMPLE: con cliente_id NULL no se exige nada.
ALTER TABLE "productos_proveedores" ADD CONSTRAINT "productos_proveedores_tenant_producto_fkey"
  FOREIGN KEY ("tenant_id", "producto_id")  REFERENCES "productos"("tenant_id", "id")   NOT VALID;
ALTER TABLE "productos_proveedores" ADD CONSTRAINT "productos_proveedores_tenant_proveedor_fkey"
  FOREIGN KEY ("tenant_id", "proveedor_id") REFERENCES "proveedores"("tenant_id", "id") NOT VALID;
ALTER TABLE "ventas" ADD CONSTRAINT "ventas_tenant_cliente_fkey"
  FOREIGN KEY ("tenant_id", "cliente_id")   REFERENCES "clientes"("tenant_id", "id")    NOT VALID;
