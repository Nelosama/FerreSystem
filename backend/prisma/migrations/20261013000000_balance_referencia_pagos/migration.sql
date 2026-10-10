-- BALANCE: referencia de pago (comprobante, transferencia o cheque) en los pagos de cuentas por cobrar y por pagar.
-- Aditiva: añade una columna nullable y un índice único parcial. No modifica filas existentes.
-- Una misma referencia no se registra dos veces en la misma cuenta (evita pagos duplicados a proveedores).

ALTER TABLE "pagos_cuenta" ADD COLUMN "referencia" TEXT;
ALTER TABLE "pagos_cuenta" ADD CONSTRAINT "pagos_cuenta_referencia_check"
  CHECK ("referencia" IS NULL OR char_length("referencia") BETWEEN 1 AND 60);
CREATE UNIQUE INDEX "pagos_cuenta_tenant_cuenta_referencia_key"
  ON "pagos_cuenta"("tenant_id", "cuenta_id", "referencia") WHERE "referencia" IS NOT NULL;
