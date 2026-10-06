BEGIN;

ALTER TABLE "clientes"
  ADD COLUMN "codigo" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "credito_habilitado" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "limite_credito" DECIMAL(12,2),
  ADD COLUMN "saldo_pendiente" DECIMAL(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN "activo" BOOLEAN NOT NULL DEFAULT true;
UPDATE "clientes" SET "codigo" = 'CLI-' || LPAD("numero_cliente"::text, 6, '0');
CREATE UNIQUE INDEX "clientes_tenant_id_codigo_key" ON "clientes"("tenant_id", "codigo");
CREATE INDEX "clientes_tenant_id_activo_idx" ON "clientes"("tenant_id", "activo");

-- Keep the existing tenant-scoped number trigger and derive a stable, searchable code from it.
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
  NEW."codigo" := 'CLI-' || LPAD(NEW."numero_cliente"::text, 6, '0');
  RETURN NEW;
END;
$$;

DO $$ BEGIN
  CREATE TYPE "TipoPago" AS ENUM ('CONTADO', 'CREDITO');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
ALTER TABLE "ventas"
  ADD COLUMN "tipo_pago" "TipoPago" NOT NULL DEFAULT 'CONTADO',
  ADD COLUMN "saldo_credito" DECIMAL(12,2);

-- Reconcile the existing CXC ledger into the new customer and per-sale balances.
UPDATE "ventas" v SET "tipo_pago" = 'CREDITO', "saldo_credito" = COALESCE(c.saldo, 0)
FROM "cuentas_operativas" c
WHERE c.tenant_id = v.tenant_id AND c.tipo = 'CXC' AND c.documento_id = v.id;
UPDATE "clientes" cl SET "saldo_pendiente" = totals.saldo
FROM (
  SELECT "tenant_id", "cliente_id", SUM("saldo") AS saldo
  FROM "cuentas_operativas" WHERE "tipo" = 'CXC' AND "cliente_id" IS NOT NULL
  GROUP BY "tenant_id", "cliente_id"
) totals
WHERE totals."tenant_id" = cl."tenant_id" AND totals."cliente_id" = cl.id;

CREATE TABLE "abonos_cliente" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "tenant_id" TEXT NOT NULL,
  "cliente_id" TEXT NOT NULL,
  "venta_id" TEXT,
  "monto" DECIMAL(12,2) NOT NULL,
  "fecha" TIMESTAMP(3) NOT NULL,
  "metodo" TEXT,
  "notas" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "abonos_cliente_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "abonos_cliente_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "abonos_cliente_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "abonos_cliente_venta_id_fkey" FOREIGN KEY ("venta_id") REFERENCES "ventas"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "abonos_cliente_tenant_id_idx" ON "abonos_cliente"("tenant_id");
CREATE INDEX "abonos_cliente_cliente_id_idx" ON "abonos_cliente"("cliente_id");

COMMIT;
