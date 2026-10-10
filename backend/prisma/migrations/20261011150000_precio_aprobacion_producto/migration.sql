-- Aprobación de precio para venta (levantamiento inicial y administración de precios).
-- Solo agrega columnas e índice. Productos existentes con precio positivo quedan aprobados con marca LEGADO_MIGRACION:
-- ya se vendían con su precio y no deben dejar de venderse. Los de precio cero quedan pendientes. No modifica existencias, costos ni precios.
-- Reversión manual: DROP INDEX productos_tenant_id_precio_aprobado_idx; y DROP COLUMN de las cinco columnas nuevas.

ALTER TABLE "productos"
  ADD COLUMN "precio_aprobado" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "precio_aprobado_por" TEXT,
  ADD COLUMN "precio_aprobado_at" TIMESTAMP(3),
  ADD COLUMN "precio_modificado_por" TEXT,
  ADD COLUMN "precio_modificado_at" TIMESTAMP(3);

-- KARDEX (consolidación #134/#140): solo se marcan como legado los productos con precio de venta positivo.
-- Un producto histórico sin precio válido queda pendiente de aprobación; la migración no lo vuelve vendible.
UPDATE "productos"
SET "precio_aprobado" = true,
    "precio_aprobado_por" = 'LEGADO_MIGRACION',
    "precio_aprobado_at" = CURRENT_TIMESTAMP
WHERE "precio_venta" > 0;

CREATE INDEX "productos_tenant_id_precio_aprobado_idx" ON "productos"("tenant_id", "precio_aprobado");
