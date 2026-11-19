-- NEXUS — etapa 3, caja (decisión del dueño del 2026-11-12): configuración por tienda, cierre ciego con conteos, saldo trasladable,
-- revisión de diferencias por ADMIN y autorizaciones de apertura/cierre.
-- Solo aditiva: valores nuevos de un enum, columnas nulas, dos tablas, una clave única y verificaciones de empresa.
-- No rellena ni modifica filas existentes.
-- Sin fila en configuracion_caja rigen los valores por defecto (apertura y cierre autónomos, umbral 0): comportamiento anterior.

ALTER TYPE "TipoSolicitudAutorizacion" ADD VALUE IF NOT EXISTS 'APERTURA_CAJA';
ALTER TYPE "TipoSolicitudAutorizacion" ADD VALUE IF NOT EXISTS 'CIERRE_CAJA';

ALTER TABLE "cajas"
  ADD COLUMN "monto_trasladado" DECIMAL(12,2),
  ADD COLUMN "caja_anterior_id" TEXT,
  ADD COLUMN "diferencia_revisada_por" TEXT,
  ADD COLUMN "diferencia_revisada_at" TIMESTAMPTZ;

-- El saldo trasladado nunca es negativo ni supera lo contado; una revisión siempre dice quién y cuándo.
ALTER TABLE "cajas" ADD CONSTRAINT "cajas_traslado_chk" CHECK (
  "monto_trasladado" IS NULL OR ("monto_trasladado" >= 0 AND "monto_cierre_fisico" IS NOT NULL AND "monto_trasladado" <= "monto_cierre_fisico")
) NOT VALID;
ALTER TABLE "cajas" VALIDATE CONSTRAINT "cajas_traslado_chk";
ALTER TABLE "cajas" ADD CONSTRAINT "cajas_revision_chk" CHECK (
  ("diferencia_revisada_por" IS NULL) = ("diferencia_revisada_at" IS NULL)
) NOT VALID;
ALTER TABLE "cajas" VALIDATE CONSTRAINT "cajas_revision_chk";

-- Una caja traslada su saldo a una sola caja siguiente.
CREATE UNIQUE INDEX "cajas_caja_anterior_id_key" ON "cajas"("caja_anterior_id");
ALTER TABLE "cajas" ADD CONSTRAINT "cajas_caja_anterior_id_fkey" FOREIGN KEY ("caja_anterior_id") REFERENCES "cajas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- FK simple a usuarios(id) (ver 20261113000000); la misma empresa la impone el trigger de abajo.
ALTER TABLE "cajas" ADD CONSTRAINT "cajas_diferencia_revisada_por_fkey" FOREIGN KEY ("diferencia_revisada_por") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "conteos_caja" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "caja_id" TEXT NOT NULL,
    "usuario_id" TEXT NOT NULL,
    "monto" DECIMAL(12,2) NOT NULL,
    "esperado" DECIMAL(12,2) NOT NULL,
    "diferencia" DECIMAL(12,2) NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conteos_caja_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "conteos_caja_monto_chk" CHECK ("monto" >= 0),
    CONSTRAINT "conteos_caja_diferencia_chk" CHECK ("diferencia" = "monto" - "esperado")
);
CREATE INDEX "conteos_caja_caja_idx" ON "conteos_caja"("caja_id", "created_at");
ALTER TABLE "conteos_caja" ADD CONSTRAINT "conteos_caja_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- Integridad multiempresa (revisión de #248): la caja del conteo es de la misma empresa que el conteo.
-- id ya es la clave primaria de cajas, así que la clave única compuesta no puede fallar sobre filas existentes.
ALTER TABLE "cajas" ADD CONSTRAINT "cajas_tenant_id_id_key" UNIQUE ("tenant_id", "id");
ALTER TABLE "conteos_caja" ADD CONSTRAINT "conteos_caja_caja_id_fkey" FOREIGN KEY ("tenant_id", "caja_id") REFERENCES "cajas"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "conteos_caja" ADD CONSTRAINT "conteos_caja_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "configuracion_caja" (
    "tenant_id" TEXT NOT NULL,
    "apertura_autonoma" BOOLEAN NOT NULL DEFAULT true,
    "cierre_autonomo" BOOLEAN NOT NULL DEFAULT true,
    "umbral_aviso_diferencia" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "actualizado_por" TEXT,
    "actualizado_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "configuracion_caja_pkey" PRIMARY KEY ("tenant_id"),
    CONSTRAINT "configuracion_caja_umbral_chk" CHECK ("umbral_aviso_diferencia" >= 0)
);
ALTER TABLE "configuracion_caja" ADD CONSTRAINT "configuracion_caja_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "configuracion_caja" ADD CONSTRAINT "configuracion_caja_actualizado_por_fkey" FOREIGN KEY ("actualizado_por") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Integridad multiempresa de las demás referencias nuevas (revisión de #248). Para usuarios no se usa una FK compuesta a
-- usuarios(tenant_id, id): dependería de usuarios_tenant_id_id_key, que la reversión manual de #148 elimina (ver
-- 20261113000000). Se conserva la FK simple (existencia) y este trigger exige que la fila referida sea de la misma empresa.
-- Argumentos: columna de la fila nueva y tabla referida (ambas con tenant_id e id).
CREATE FUNCTION "caja_verificar_misma_empresa"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  referido TEXT := to_jsonb(NEW) ->> TG_ARGV[0];
  empresa TEXT;
BEGIN
  IF referido IS NULL THEN RETURN NEW; END IF;
  EXECUTE format('SELECT tenant_id FROM %I WHERE id = $1', TG_ARGV[1]) INTO empresa USING referido;
  IF empresa IS DISTINCT FROM NEW.tenant_id THEN
    RAISE EXCEPTION '%.% (%) no pertenece a la empresa %', TG_TABLE_NAME, TG_ARGV[0], referido, NEW.tenant_id
      USING ERRCODE = '23503';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "conteos_caja_usuario_misma_empresa" BEFORE INSERT OR UPDATE OF "tenant_id", "usuario_id" ON "conteos_caja"
  FOR EACH ROW EXECUTE FUNCTION "caja_verificar_misma_empresa"('usuario_id', 'usuarios');
CREATE TRIGGER "cajas_revisor_misma_empresa" BEFORE INSERT OR UPDATE OF "tenant_id", "diferencia_revisada_por" ON "cajas"
  FOR EACH ROW EXECUTE FUNCTION "caja_verificar_misma_empresa"('diferencia_revisada_por', 'usuarios');
CREATE TRIGGER "cajas_anterior_misma_empresa" BEFORE INSERT OR UPDATE OF "tenant_id", "caja_anterior_id" ON "cajas"
  FOR EACH ROW EXECUTE FUNCTION "caja_verificar_misma_empresa"('caja_anterior_id', 'cajas');
CREATE TRIGGER "configuracion_caja_usuario_misma_empresa" BEFORE INSERT OR UPDATE OF "tenant_id", "actualizado_por" ON "configuracion_caja"
  FOR EACH ROW EXECUTE FUNCTION "caja_verificar_misma_empresa"('actualizado_por', 'usuarios');
