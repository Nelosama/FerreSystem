-- PROPUESTA NEXUS. Reversión del piloto. Solo elimina restricciones nuevas; no toca filas ni las FK existentes.
ALTER TABLE "ventas"                DROP CONSTRAINT IF EXISTS "ventas_tenant_cliente_fkey";
ALTER TABLE "productos_proveedores" DROP CONSTRAINT IF EXISTS "productos_proveedores_tenant_proveedor_fkey";
ALTER TABLE "productos_proveedores" DROP CONSTRAINT IF EXISTS "productos_proveedores_tenant_producto_fkey";
ALTER TABLE "clientes"    DROP CONSTRAINT IF EXISTS "clientes_tenant_id_id_key";
ALTER TABLE "proveedores" DROP CONSTRAINT IF EXISTS "proveedores_tenant_id_id_key";
ALTER TABLE "productos"   DROP CONSTRAINT IF EXISTS "productos_tenant_id_id_key";
