BEGIN;

LOCK TABLE "clientes" IN SHARE ROW EXCLUSIVE MODE;
ALTER TABLE "clientes"
  ADD COLUMN "codigo" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "credito_habilitado" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "limite_credito" DECIMAL(12,2),
  ADD COLUMN "saldo_pendiente" DECIMAL(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN "activo" BOOLEAN NOT NULL DEFAULT true;

UPDATE "clientes"
SET "codigo" = 'CLI-' || LPAD("numero_cliente"::TEXT, 6, '0');

CREATE UNIQUE INDEX "clientes_tenant_id_codigo_key" ON "clientes"("tenant_id", "codigo");
CREATE INDEX "clientes_tenant_id_activo_idx" ON "clientes"("tenant_id", "activo");

-- Mantiene la numeración existente y asigna un código legible a clientes nuevos.
CREATE OR REPLACE FUNCTION "assign_customer_number"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW."numero_cliente" IS DISTINCT FROM OLD."numero_cliente"
       OR NEW."tenant_id" IS DISTINCT FROM OLD."tenant_id" THEN
      RAISE EXCEPTION 'El número de cliente y su empresa no se pueden cambiar';
    END IF;
    RETURN NEW;
  END IF;
  IF COALESCE(NEW."numero_cliente", 0) <> 0 THEN
    RAISE EXCEPTION 'El número de cliente se asigna automáticamente';
  END IF;
  INSERT INTO "secuencias_cliente" ("tenant_id", "ultimo_numero") VALUES (NEW."tenant_id", 1)
  ON CONFLICT ("tenant_id") DO UPDATE
    SET "ultimo_numero" = "secuencias_cliente"."ultimo_numero" + 1
  RETURNING "ultimo_numero" INTO NEW."numero_cliente";
  IF COALESCE(NEW."codigo", '') = '' THEN
    NEW."codigo" := 'CLI-' || LPAD(NEW."numero_cliente"::TEXT, 6, '0');
  END IF;
  RETURN NEW;
END;
$$;

CREATE TYPE "TipoPago" AS ENUM ('CONTADO', 'CREDITO');
ALTER TABLE "ventas"
  ADD COLUMN "tipo_pago" "TipoPago" NOT NULL DEFAULT 'CONTADO',
  ADD COLUMN "saldo_credito" DECIMAL(12,2);

-- Conserva en los nuevos campos el saldo de las ventas a crédito ya registradas.
UPDATE "ventas" AS venta
SET "tipo_pago" = 'CREDITO',
    "saldo_credito" = COALESCE((
      SELECT SUM(cuenta."saldo")
      FROM "cuentas_operativas" AS cuenta
      WHERE cuenta."tenant_id" = venta."tenant_id"
        AND cuenta."tipo" = 'CXC'
        AND cuenta."documento_id" = venta."id"
    ), venta."total")
WHERE venta."metodo_pago" = 'CREDITO';

UPDATE "clientes" AS cliente
SET "saldo_pendiente" = COALESCE((
  SELECT SUM(cuenta."saldo")
  FROM "cuentas_operativas" AS cuenta
  WHERE cuenta."tenant_id" = cliente."tenant_id"
    AND cuenta."tipo" = 'CXC'
    AND cuenta."cliente_id" = cliente."id"
), 0);

CREATE TABLE "abonos_cliente" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "cliente_id" TEXT NOT NULL,
  "venta_id" TEXT,
  "monto" DECIMAL(12,2) NOT NULL,
  "fecha" TIMESTAMP(3) NOT NULL,
  "metodo" TEXT,
  "notas" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "abonos_cliente_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "abonos_cliente_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "abonos_cliente_venta_id_fkey" FOREIGN KEY ("venta_id") REFERENCES "ventas"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "abonos_cliente_tenant_id_idx" ON "abonos_cliente"("tenant_id");
CREATE INDEX "abonos_cliente_cliente_id_idx" ON "abonos_cliente"("cliente_id");

COMMIT;
