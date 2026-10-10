-- Relación producto–proveedor (Compras y proveedores, fase P1).
-- Aditiva: crea una tabla nueva. No modifica productos, proveedores, compras, recepciones ni costos.
-- ultimo_costo y ultima_compra_at se actualizan al recibir mercancía; el historial completo sigue en costos_compra.

CREATE TABLE "productos_proveedores" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "producto_id" TEXT NOT NULL,
    "proveedor_id" TEXT NOT NULL,
    "codigo_proveedor" TEXT,
    "es_preferido" BOOLEAN NOT NULL DEFAULT false,
    "ultimo_costo" DECIMAL(12,2),
    "ultima_compra_at" TIMESTAMP(3),
    "creado_por" TEXT,
    "actualizado_por" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "productos_proveedores_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "productos_proveedores_costo_check" CHECK ("ultimo_costo" IS NULL OR "ultimo_costo" >= 0),
    CONSTRAINT "productos_proveedores_codigo_check" CHECK ("codigo_proveedor" IS NULL OR char_length("codigo_proveedor") BETWEEN 1 AND 100),
    CONSTRAINT "productos_proveedores_tenant_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "productos_proveedores_producto_fkey" FOREIGN KEY ("producto_id") REFERENCES "productos"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "productos_proveedores_proveedor_fkey" FOREIGN KEY ("proveedor_id") REFERENCES "proveedores"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "productos_proveedores_creado_fkey" FOREIGN KEY ("creado_por") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "productos_proveedores_actualizado_fkey" FOREIGN KEY ("actualizado_por") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- Un producto se asocia una sola vez a cada proveedor de la misma empresa.
CREATE UNIQUE INDEX "productos_proveedores_tenant_producto_proveedor_key" ON "productos_proveedores"("tenant_id", "producto_id", "proveedor_id");
-- Como máximo un proveedor preferido por producto.
CREATE UNIQUE INDEX "productos_proveedores_preferido_key" ON "productos_proveedores"("tenant_id", "producto_id") WHERE "es_preferido";
CREATE INDEX "productos_proveedores_tenant_proveedor_idx" ON "productos_proveedores"("tenant_id", "proveedor_id");
