-- BALANCE: plazo de crédito del cliente en días. Aditiva: columna nullable con rango válido.
-- Las facturas nuevas usan este plazo para su vencimiento; las facturas existentes no cambian.
ALTER TABLE "clientes" ADD COLUMN "plazo_credito_dias" INTEGER;
ALTER TABLE "clientes" ADD CONSTRAINT "clientes_plazo_credito_check"
  CHECK ("plazo_credito_dias" IS NULL OR "plazo_credito_dias" BETWEEN 1 AND 365);
