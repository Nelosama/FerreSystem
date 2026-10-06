-- Registro de facturas de compra y abonos sin alterar el historial de órdenes existente.
ALTER TABLE "productos" ADD COLUMN "costo_vigente" DECIMAL(12,2);
UPDATE "productos" SET "costo_vigente" = "precio_costo" WHERE "costo_vigente" IS NULL;
ALTER TABLE "proveedores" ADD COLUMN "activo" BOOLEAN NOT NULL DEFAULT true;

DO $$ BEGIN
  CREATE TYPE "EstadoCompra" AS ENUM ('PENDIENTE', 'PAGADA', 'PARCIAL');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE "compras_proveedor" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "tenant_id" TEXT NOT NULL,
  "proveedor_id" TEXT NOT NULL,
  "numero_factura" TEXT,
  "monto" DECIMAL(12,2) NOT NULL,
  "fecha" TIMESTAMP(3) NOT NULL,
  "vencimiento" TIMESTAMP(3),
  "estado" "EstadoCompra" NOT NULL DEFAULT 'PENDIENTE',
  "notas" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "compras_proveedor_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "compras_proveedor_proveedor_id_fkey" FOREIGN KEY ("proveedor_id") REFERENCES "proveedores"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "compras_proveedor_tenant_id_idx" ON "compras_proveedor"("tenant_id");
CREATE INDEX "compras_proveedor_tenant_id_estado_idx" ON "compras_proveedor"("tenant_id", "estado");

CREATE TABLE "detalles_compra_proveedor" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "compra_id" TEXT NOT NULL,
  "producto_id" TEXT NOT NULL,
  "cantidad" DECIMAL(12,2) NOT NULL,
  "costo_unitario" DECIMAL(12,2) NOT NULL,
  "subtotal" DECIMAL(12,2) NOT NULL,
  CONSTRAINT "detalles_compra_proveedor_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "detalles_compra_proveedor_compra_id_fkey" FOREIGN KEY ("compra_id") REFERENCES "compras_proveedor"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "detalles_compra_proveedor_producto_id_fkey" FOREIGN KEY ("producto_id") REFERENCES "productos"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "detalles_compra_proveedor_compra_id_idx" ON "detalles_compra_proveedor"("compra_id");
CREATE INDEX "detalles_compra_proveedor_producto_id_idx" ON "detalles_compra_proveedor"("producto_id");

CREATE TABLE "pagos_proveedor" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "compra_id" TEXT NOT NULL,
  "monto" DECIMAL(12,2) NOT NULL,
  "fecha" TIMESTAMP(3) NOT NULL,
  "metodo" TEXT,
  "notas" TEXT,
  CONSTRAINT "pagos_proveedor_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "pagos_proveedor_compra_id_fkey" FOREIGN KEY ("compra_id") REFERENCES "compras_proveedor"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "pagos_proveedor_compra_id_idx" ON "pagos_proveedor"("compra_id");
