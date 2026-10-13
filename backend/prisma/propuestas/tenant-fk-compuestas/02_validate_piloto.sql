-- PROPUESTA NEXUS. Ejecutar SOLO cuando la auditoría de solo lectura no devuelva filas para estas relaciones.
-- Falla (sin cambiar nada) si aún existen filas con tenant distinto. SHARE UPDATE EXCLUSIVE: no bloquea lecturas ni escrituras.
ALTER TABLE "productos_proveedores" VALIDATE CONSTRAINT "productos_proveedores_tenant_producto_fkey";
ALTER TABLE "productos_proveedores" VALIDATE CONSTRAINT "productos_proveedores_tenant_proveedor_fkey";
ALTER TABLE "ventas" VALIDATE CONSTRAINT "ventas_tenant_cliente_fkey";
