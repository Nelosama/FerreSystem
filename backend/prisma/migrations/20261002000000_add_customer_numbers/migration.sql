-- Numeración por empresa. Conserva IDs y datos de los clientes existentes.
-- Las escrituras esperan durante la transacción; ALTER TABLE puede bloquear lecturas.
BEGIN;
LOCK TABLE "clientes" IN SHARE ROW EXCLUSIVE MODE;
ALTER TABLE "clientes" ADD COLUMN "numero_cliente" INTEGER;

WITH numbered AS (
  SELECT "id", ROW_NUMBER() OVER (
    PARTITION BY "tenant_id" ORDER BY "created_at", "id"
  )::INTEGER AS number FROM "clientes"
)
UPDATE "clientes" AS client SET "numero_cliente" = numbered.number
FROM numbered WHERE client."id" = numbered."id";

CREATE TABLE "secuencias_cliente" (
  "tenant_id" TEXT NOT NULL PRIMARY KEY,
  "ultimo_numero" INTEGER NOT NULL,
  CONSTRAINT "secuencias_cliente_tenant_id_fkey" FOREIGN KEY ("tenant_id")
    REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "secuencias_cliente" ("tenant_id", "ultimo_numero")
SELECT "tenant_id", MAX("numero_cliente") FROM "clientes" GROUP BY "tenant_id";

ALTER TABLE "clientes" ALTER COLUMN "numero_cliente" SET DEFAULT 0;
ALTER TABLE "clientes" ALTER COLUMN "numero_cliente" SET NOT NULL;
ALTER TABLE "clientes" ADD CONSTRAINT "clientes_numero_cliente_positive" CHECK ("numero_cliente" > 0);
CREATE UNIQUE INDEX "clientes_tenant_id_numero_cliente_key" ON "clientes"("tenant_id", "numero_cliente");

-- Contador independiente: eliminar un cliente no reutiliza su número.
-- Compatible con la API anterior durante el despliegue.
CREATE FUNCTION "assign_customer_number"() RETURNS trigger LANGUAGE plpgsql AS $$
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
  RETURN NEW;
END;
$$;
CREATE TRIGGER "clientes_assign_number"
BEFORE INSERT OR UPDATE OF "numero_cliente", "tenant_id" ON "clientes"
FOR EACH ROW EXECUTE FUNCTION "assign_customer_number"();
COMMIT;
