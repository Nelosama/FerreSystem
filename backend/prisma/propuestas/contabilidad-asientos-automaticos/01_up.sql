-- PROPUESTA NEXUS — asientos automáticos de Contabilidad (NO es una migración; no se aplica con `migrate deploy`).
-- Aditiva: columnas nulas nuevas, dos tablas nuevas y la ampliación de un CHECK. No modifica filas existentes.
-- Requiere: migraciones 20261027000100_rol_contador y 20261027000200_contabilidad_honduras (PR #180).
-- Autorización pendiente del dueño y firma de NEXUS antes de convertirla en migración (ver README.md).
BEGIN;

-- 1. Cabecera de ejecución: una contabilización de operaciones de un período, idempotente por solicitud.
CREATE TABLE "contable_lotes" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "solicitud_id" TEXT NOT NULL,
  "anio" INTEGER NOT NULL,
  "mes" INTEGER NOT NULL,
  "cantidad_asientos" INTEGER NOT NULL,
  "total_centavos" BIGINT NOT NULL,
  "creado_por" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "contable_lotes_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "contable_lotes_tenant_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "contable_lotes_usuario_fkey" FOREIGN KEY ("creado_por") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "contable_lotes_periodo_chk" CHECK ("anio" BETWEEN 2000 AND 2100 AND "mes" BETWEEN 1 AND 12),
  CONSTRAINT "contable_lotes_cantidad_chk" CHECK ("cantidad_asientos" >= 1 AND "total_centavos" >= 0)
);
CREATE UNIQUE INDEX "contable_lotes_tenant_id_id_key" ON "contable_lotes"("tenant_id", "id");
CREATE UNIQUE INDEX "contable_lotes_tenant_solicitud_key" ON "contable_lotes"("tenant_id", "solicitud_id");
CREATE INDEX "contable_lotes_tenant_periodo_idx" ON "contable_lotes"("tenant_id", "anio", "mes");
CREATE TRIGGER "contable_lotes_inmutables_tg" BEFORE UPDATE OR DELETE ON "contable_lotes" FOR EACH ROW EXECUTE FUNCTION "fiscal_solo_insercion"();
CREATE TRIGGER "contable_lotes_empresa_tg" BEFORE INSERT ON "contable_lotes" FOR EACH ROW EXECUTE FUNCTION "fiscal_misma_empresa"('creado_por', 'usuarios');
ALTER TABLE "contable_lotes" ENABLE ROW LEVEL SECURITY;

-- 2. Origen del asiento automático: operación, evento, versión de la regla y huella de lo que se leyó.
ALTER TABLE "contable_asientos"
  ADD COLUMN "origen_tipo" TEXT,
  ADD COLUMN "origen_id" TEXT,
  ADD COLUMN "evento" TEXT,
  ADD COLUMN "lote_id" TEXT,
  ADD COLUMN "regla_version" INTEGER,
  ADD COLUMN "huella_origen" TEXT;

ALTER TABLE "contable_asientos" DROP CONSTRAINT "contable_asientos_origen_chk";
ALTER TABLE "contable_asientos" ADD CONSTRAINT "contable_asientos_origen_chk"
  CHECK ("origen" IN ('MANUAL', 'REVERSION', 'AUTOMATICO') AND (("origen" = 'REVERSION') = ("revierte_id" IS NOT NULL)));
-- Todo o nada: un asiento automático lleva los seis datos de origen; los demás, ninguno.
-- Cada columna lleva IS NOT NULL explícito: en un CHECK un resultado NULL cuenta como «cumple».
ALTER TABLE "contable_asientos" ADD CONSTRAINT "contable_asientos_automatico_chk" CHECK (
  ("origen" = 'AUTOMATICO'
     AND "origen_tipo" IS NOT NULL AND "origen_tipo" IN ('VENTA', 'COBRO_CXC', 'COMPRA', 'RECEPCION', 'PAGO_CXP', 'DEVOLUCION')
     AND "origen_id" IS NOT NULL AND length("origen_id") BETWEEN 1 AND 64
     AND "evento" IS NOT NULL AND "evento" ~ '^[A-Z_]{3,30}$'
     AND "lote_id" IS NOT NULL
     AND "regla_version" IS NOT NULL AND "regla_version" >= 1
     AND "huella_origen" IS NOT NULL AND "huella_origen" ~ '^[0-9a-f]{64}$')
  OR ("origen" <> 'AUTOMATICO'
     AND "origen_tipo" IS NULL AND "origen_id" IS NULL AND "evento" IS NULL AND "lote_id" IS NULL AND "regla_version" IS NULL AND "huella_origen" IS NULL));
ALTER TABLE "contable_asientos" ADD CONSTRAINT "contable_asientos_lote_fkey"
  FOREIGN KEY ("tenant_id", "lote_id") REFERENCES "contable_lotes"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- Clave anti-duplicado: una operación se contabiliza una sola vez por evento (aunque su asiento se revierta).
CREATE UNIQUE INDEX "contable_asientos_origen_key" ON "contable_asientos"("tenant_id", "origen_tipo", "origen_id", "evento") WHERE "origen" = 'AUTOMATICO';
CREATE INDEX "contable_asientos_origen_idx" ON "contable_asientos"("tenant_id", "origen_tipo", "origen_id") WHERE "origen" = 'AUTOMATICO';

-- 3. Mapeo de conceptos a cuentas, con vigencia. Sin datos precargados: lo define el contador.
CREATE TABLE "contable_mapeos" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "concepto" TEXT NOT NULL,
  "cuenta_id" TEXT NOT NULL,
  "vigente_desde" DATE NOT NULL,
  "vigente_hasta" DATE,
  "creado_por" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "contable_mapeos_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "contable_mapeos_tenant_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "contable_mapeos_usuario_fkey" FOREIGN KEY ("creado_por") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "contable_mapeos_cuenta_fkey" FOREIGN KEY ("tenant_id", "cuenta_id") REFERENCES "contable_cuentas"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "contable_mapeos_concepto_chk" CHECK ("concepto" IN ('CAJA_EFECTIVO', 'TARJETA_POR_LIQUIDAR', 'BANCO_TRANSFERENCIA', 'CXC_CLIENTES', 'CXP_PROVEEDORES', 'VENTAS', 'DESCUENTO_VENTAS', 'DEVOLUCIONES_VENTAS', 'ISV_POR_PAGAR', 'ISV_CREDITO_FISCAL', 'INVENTARIO', 'COSTO_VENTA', 'MERCADERIA_EN_TRANSITO')),
  CONSTRAINT "contable_mapeos_vigencia_chk" CHECK ("vigente_hasta" IS NULL OR "vigente_hasta" >= "vigente_desde")
);
CREATE UNIQUE INDEX "contable_mapeos_tenant_id_id_key" ON "contable_mapeos"("tenant_id", "id");
CREATE INDEX "contable_mapeos_tenant_concepto_idx" ON "contable_mapeos"("tenant_id", "concepto", "vigente_desde");

CREATE OR REPLACE FUNCTION "contable_mapeo_sin_solape"() RETURNS trigger AS $$
BEGIN
  -- Antes de calcular rangos: una vigencia invertida es un error de dato, no un solape.
  IF NEW."vigente_hasta" IS NOT NULL AND NEW."vigente_hasta" < NEW."vigente_desde" THEN
    RAISE EXCEPTION 'contable_mapeos_vigencia_chk: la vigencia termina antes de comenzar' USING ERRCODE = '23514';
  END IF;
  IF EXISTS (SELECT 1 FROM "contable_mapeos" m
              WHERE m."tenant_id" = NEW."tenant_id" AND m."concepto" = NEW."concepto" AND m."id" <> NEW."id"
                AND daterange(m."vigente_desde", m."vigente_hasta", '[]') && daterange(NEW."vigente_desde", NEW."vigente_hasta", '[]')) THEN
    RAISE EXCEPTION 'La vigencia del mapeo se solapa con otra del mismo concepto' USING ERRCODE = '23P01';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "contable_mapeos_vigencia_tg" BEFORE INSERT OR UPDATE ON "contable_mapeos" FOR EACH ROW EXECUTE FUNCTION "contable_mapeo_sin_solape"();

-- Un mapeo no se edita ni se borra: solo se cierra su vigencia (hasta) una vez.
CREATE OR REPLACE FUNCTION "contable_mapeo_solo_cierre"() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Los mapeos contables no se eliminan; cierre su vigencia'; END IF;
  IF OLD."vigente_hasta" IS NOT NULL OR NEW."vigente_hasta" IS NULL
     OR (to_jsonb(NEW) - 'vigente_hasta') <> (to_jsonb(OLD) - 'vigente_hasta') THEN
    RAISE EXCEPTION 'Un mapeo contable solo admite el cierre de su vigencia';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "contable_mapeos_cierre_tg" BEFORE UPDATE OR DELETE ON "contable_mapeos" FOR EACH ROW EXECUTE FUNCTION "contable_mapeo_solo_cierre"();
CREATE TRIGGER "contable_mapeos_empresa_tg" BEFORE INSERT ON "contable_mapeos" FOR EACH ROW EXECUTE FUNCTION "fiscal_misma_empresa"('creado_por', 'usuarios');
ALTER TABLE "contable_mapeos" ENABLE ROW LEVEL SECURITY;

COMMIT;
