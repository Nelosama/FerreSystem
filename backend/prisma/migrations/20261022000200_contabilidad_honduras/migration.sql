-- NEXUS: Contabilidad y Control Tributario (Honduras), fase 1. Cambio aditivo.
-- No modifica ni copia ventas, cobros, compras, CXC/CXP, inventario ni caja: los libros se leen de esas tablas.
-- Las tablas nuevas solo guardan lo que no existe en la operación: datos del documento fiscal (CAI, numeración,
-- desglose), configuración fiscal con vigencia, retenciones, períodos, ajustes trazables y partida doble.
-- Ninguna tasa, regla ni formulario se precarga: cada empresa los registra con su base legal.

-- 0. Clave compuesta para referenciar compras sin cruzar empresas (índice aditivo, sin cambiar datos).
CREATE UNIQUE INDEX "ordenes_compra_tenant_id_id_key" ON "ordenes_compra"("tenant_id", "id");

-- 1. Configuración fiscal por empresa
CREATE TABLE "fiscal_configuraciones" (
  "tenant_id" TEXT NOT NULL,
  "pais" TEXT NOT NULL DEFAULT 'HN',
  "rtn" TEXT,
  "razon_social" TEXT NOT NULL DEFAULT '',
  "nombre_comercial" TEXT NOT NULL DEFAULT '',
  "agente_retencion" BOOLEAN NOT NULL DEFAULT false,
  "moneda" TEXT NOT NULL DEFAULT 'HNL',
  "zona_horaria" TEXT NOT NULL DEFAULT 'America/Tegucigalpa',
  "notas" TEXT,
  "actualizado_por" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "fiscal_configuraciones_pkey" PRIMARY KEY ("tenant_id"),
  CONSTRAINT "fiscal_configuraciones_tenant_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "fiscal_configuraciones_usuario_fkey" FOREIGN KEY ("actualizado_por") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "fiscal_configuraciones_pais_chk" CHECK ("pais" = 'HN'),
  CONSTRAINT "fiscal_configuraciones_moneda_chk" CHECK ("moneda" = 'HNL'),
  CONSTRAINT "fiscal_configuraciones_rtn_chk" CHECK ("rtn" IS NULL OR "rtn" ~ '^[0-9]{14}$')
);

-- 2. Tasas de impuesto con vigencia (sin solapes por categoría)
CREATE TABLE "fiscal_tasas" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "impuesto" TEXT NOT NULL,
  "categoria" TEXT NOT NULL,
  "porcentaje" DECIMAL(5,2) NOT NULL,
  "vigente_desde" DATE NOT NULL,
  "vigente_hasta" DATE,
  "base_legal" TEXT NOT NULL,
  "creado_por" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "fiscal_tasas_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "fiscal_tasas_tenant_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "fiscal_tasas_usuario_fkey" FOREIGN KEY ("creado_por") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "fiscal_tasas_impuesto_chk" CHECK ("impuesto" = 'ISV'),
  CONSTRAINT "fiscal_tasas_categoria_chk" CHECK ("categoria" IN ('GENERAL', 'ESPECIAL')),
  CONSTRAINT "fiscal_tasas_porcentaje_chk" CHECK ("porcentaje" > 0 AND "porcentaje" < 100),
  CONSTRAINT "fiscal_tasas_vigencia_chk" CHECK ("vigente_hasta" IS NULL OR "vigente_hasta" >= "vigente_desde"),
  CONSTRAINT "fiscal_tasas_base_legal_chk" CHECK (length(trim("base_legal")) BETWEEN 3 AND 500)
);
CREATE INDEX "fiscal_tasas_tenant_idx" ON "fiscal_tasas"("tenant_id", "impuesto", "categoria", "vigente_desde");

-- 3. Reglas de retención con vigencia
CREATE TABLE "fiscal_reglas_retencion" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "codigo" TEXT NOT NULL,
  "impuesto" TEXT NOT NULL,
  "descripcion" TEXT NOT NULL,
  "porcentaje" DECIMAL(5,2) NOT NULL,
  "base_calculo" TEXT NOT NULL,
  "vigente_desde" DATE NOT NULL,
  "vigente_hasta" DATE,
  "base_legal" TEXT NOT NULL,
  "creado_por" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "fiscal_reglas_retencion_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "fiscal_reglas_retencion_tenant_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "fiscal_reglas_retencion_usuario_fkey" FOREIGN KEY ("creado_por") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "fiscal_reglas_retencion_codigo_chk" CHECK ("codigo" ~ '^[A-Z0-9_-]{2,30}$'),
  CONSTRAINT "fiscal_reglas_retencion_impuesto_chk" CHECK ("impuesto" IN ('ISV', 'ISR')),
  CONSTRAINT "fiscal_reglas_retencion_base_chk" CHECK ("base_calculo" IN ('IMPUESTO', 'BASE_GRAVABLE', 'TOTAL')),
  CONSTRAINT "fiscal_reglas_retencion_porcentaje_chk" CHECK ("porcentaje" > 0 AND "porcentaje" <= 100),
  CONSTRAINT "fiscal_reglas_retencion_vigencia_chk" CHECK ("vigente_hasta" IS NULL OR "vigente_hasta" >= "vigente_desde"),
  CONSTRAINT "fiscal_reglas_retencion_base_legal_chk" CHECK (length(trim("base_legal")) BETWEEN 3 AND 500),
  CONSTRAINT "fiscal_reglas_retencion_descripcion_chk" CHECK (length(trim("descripcion")) BETWEEN 3 AND 300)
);
CREATE UNIQUE INDEX "fiscal_reglas_retencion_tenant_id_id_key" ON "fiscal_reglas_retencion"("tenant_id", "id");
CREATE INDEX "fiscal_reglas_retencion_tenant_idx" ON "fiscal_reglas_retencion"("tenant_id", "codigo", "vigente_desde");

-- Una vigencia no se solapa con otra de la misma tasa o regla.
CREATE OR REPLACE FUNCTION "fiscal_vigencia_sin_solape"() RETURNS trigger AS $$
DECLARE solape INTEGER;
BEGIN
  IF TG_TABLE_NAME = 'fiscal_tasas' THEN
    SELECT count(*) INTO solape FROM "fiscal_tasas" t
     WHERE t."tenant_id" = NEW."tenant_id" AND t."impuesto" = NEW."impuesto" AND t."categoria" = NEW."categoria" AND t."id" <> NEW."id"
       AND daterange(t."vigente_desde", t."vigente_hasta", '[]') && daterange(NEW."vigente_desde", NEW."vigente_hasta", '[]');
  ELSE
    SELECT count(*) INTO solape FROM "fiscal_reglas_retencion" r
     WHERE r."tenant_id" = NEW."tenant_id" AND r."codigo" = NEW."codigo" AND r."id" <> NEW."id"
       AND daterange(r."vigente_desde", r."vigente_hasta", '[]') && daterange(NEW."vigente_desde", NEW."vigente_hasta", '[]');
  END IF;
  IF solape > 0 THEN RAISE EXCEPTION 'La vigencia se solapa con otra ya registrada' USING ERRCODE = '23P01'; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "fiscal_tasas_vigencia_tg" BEFORE INSERT OR UPDATE ON "fiscal_tasas" FOR EACH ROW EXECUTE FUNCTION "fiscal_vigencia_sin_solape"();
CREATE TRIGGER "fiscal_reglas_retencion_vigencia_tg" BEFORE INSERT OR UPDATE ON "fiscal_reglas_retencion" FOR EACH ROW EXECUTE FUNCTION "fiscal_vigencia_sin_solape"();

-- 4. Autorizaciones de impresión/emisión (CAI) por establecimiento, punto de emisión y tipo de documento
CREATE TABLE "fiscal_cai" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "cai" TEXT NOT NULL,
  "tipo_documento" TEXT NOT NULL,
  "establecimiento" TEXT NOT NULL,
  "punto_emision" TEXT NOT NULL,
  "rango_inicial" INTEGER NOT NULL,
  "rango_final" INTEGER NOT NULL,
  "fecha_limite_emision" DATE NOT NULL,
  "activo" BOOLEAN NOT NULL DEFAULT true,
  "creado_por" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "fiscal_cai_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "fiscal_cai_tenant_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "fiscal_cai_usuario_fkey" FOREIGN KEY ("creado_por") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "fiscal_cai_cai_chk" CHECK ("cai" ~ '^[A-Z0-9-]{6,60}$'),
  CONSTRAINT "fiscal_cai_tipo_chk" CHECK ("tipo_documento" ~ '^[0-9]{2}$'),
  CONSTRAINT "fiscal_cai_establecimiento_chk" CHECK ("establecimiento" ~ '^[0-9]{3}$'),
  CONSTRAINT "fiscal_cai_punto_chk" CHECK ("punto_emision" ~ '^[0-9]{3}$'),
  CONSTRAINT "fiscal_cai_rango_chk" CHECK ("rango_inicial" >= 1 AND "rango_inicial" <= "rango_final" AND "rango_final" <= 99999999)
);
CREATE UNIQUE INDEX "fiscal_cai_tenant_id_id_key" ON "fiscal_cai"("tenant_id", "id");
CREATE UNIQUE INDEX "fiscal_cai_tenant_cai_key" ON "fiscal_cai"("tenant_id", "cai", "tipo_documento", "establecimiento", "punto_emision");

-- 5. Documentos fiscales emitidos y recibidos (referencian la operación real; no la sustituyen)
CREATE TABLE "fiscal_documentos" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "direccion" TEXT NOT NULL,
  "tipo_documento" TEXT NOT NULL,
  "numero" TEXT NOT NULL,
  "cai" TEXT,
  "cai_id" TEXT,
  "fecha_emision" DATE NOT NULL,
  "rtn_contraparte" TEXT,
  "nombre_contraparte" TEXT NOT NULL,
  "venta_id" TEXT,
  "orden_compra_id" TEXT,
  "documento_referencia_id" TEXT,
  "importe_exento" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "importe_exonerado" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "importe_gravado_general" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "importe_gravado_especial" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "isv_general" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "isv_especial" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "total" DECIMAL(14,2) NOT NULL,
  "estado" TEXT NOT NULL DEFAULT 'VIGENTE',
  "motivo_anulacion" TEXT,
  "creado_por" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "fiscal_documentos_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "fiscal_documentos_tenant_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "fiscal_documentos_usuario_fkey" FOREIGN KEY ("creado_por") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "fiscal_documentos_cai_fkey" FOREIGN KEY ("tenant_id", "cai_id") REFERENCES "fiscal_cai"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "fiscal_documentos_venta_fkey" FOREIGN KEY ("venta_id") REFERENCES "ventas"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "fiscal_documentos_orden_fkey" FOREIGN KEY ("tenant_id", "orden_compra_id") REFERENCES "ordenes_compra"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "fiscal_documentos_direccion_chk" CHECK ("direccion" IN ('EMITIDO', 'RECIBIDO')),
  CONSTRAINT "fiscal_documentos_tipo_chk" CHECK ("tipo_documento" ~ '^[0-9]{2}$'),
  CONSTRAINT "fiscal_documentos_numero_chk" CHECK ("numero" ~ '^[0-9]{3}-[0-9]{3}-[0-9]{2}-[0-9]{8}$' AND substr("numero", 9, 2) = "tipo_documento"),
  CONSTRAINT "fiscal_documentos_rtn_chk" CHECK ("rtn_contraparte" IS NULL OR "rtn_contraparte" ~ '^[0-9]{14}$'),
  CONSTRAINT "fiscal_documentos_estado_chk" CHECK ("estado" IN ('VIGENTE', 'ANULADO')),
  CONSTRAINT "fiscal_documentos_anulacion_chk" CHECK (("estado" = 'ANULADO') = ("motivo_anulacion" IS NOT NULL)),
  CONSTRAINT "fiscal_documentos_operacion_chk" CHECK (("venta_id" IS NULL OR "direccion" = 'EMITIDO') AND ("orden_compra_id" IS NULL OR "direccion" = 'RECIBIDO')),
  CONSTRAINT "fiscal_documentos_importes_chk" CHECK ("importe_exento" >= 0 AND "importe_exonerado" >= 0 AND "importe_gravado_general" >= 0 AND "importe_gravado_especial" >= 0 AND "isv_general" >= 0 AND "isv_especial" >= 0),
  CONSTRAINT "fiscal_documentos_total_chk" CHECK ("total" = "importe_exento" + "importe_exonerado" + "importe_gravado_general" + "importe_gravado_especial" + "isv_general" + "isv_especial")
);
CREATE UNIQUE INDEX "fiscal_documentos_tenant_id_id_key" ON "fiscal_documentos"("tenant_id", "id");
ALTER TABLE "fiscal_documentos" ADD CONSTRAINT "fiscal_documentos_referencia_fkey" FOREIGN KEY ("tenant_id", "documento_referencia_id") REFERENCES "fiscal_documentos"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "fiscal_documentos_tenant_fecha_idx" ON "fiscal_documentos"("tenant_id", "direccion", "fecha_emision");
-- Numeración propia irrepetible; la recibida es única por emisor (RTN) y tipo.
CREATE UNIQUE INDEX "fiscal_documentos_emitido_numero_key" ON "fiscal_documentos"("tenant_id", "numero") WHERE "direccion" = 'EMITIDO';
CREATE UNIQUE INDEX "fiscal_documentos_recibido_numero_key" ON "fiscal_documentos"("tenant_id", "rtn_contraparte", "numero") WHERE "direccion" = 'RECIBIDO';
-- Una venta o compra tiene a lo sumo una factura vigente.
CREATE UNIQUE INDEX "fiscal_documentos_venta_factura_key" ON "fiscal_documentos"("tenant_id", "venta_id") WHERE "estado" = 'VIGENTE' AND "tipo_documento" = '01' AND "venta_id" IS NOT NULL;
CREATE UNIQUE INDEX "fiscal_documentos_orden_factura_key" ON "fiscal_documentos"("tenant_id", "orden_compra_id") WHERE "estado" = 'VIGENTE' AND "tipo_documento" = '01' AND "orden_compra_id" IS NOT NULL;

-- 6. Retenciones efectuadas o sufridas sobre un documento
CREATE TABLE "fiscal_retenciones" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "documento_id" TEXT NOT NULL,
  "regla_id" TEXT NOT NULL,
  "tipo" TEXT NOT NULL,
  "fecha" DATE NOT NULL,
  "base" DECIMAL(14,2) NOT NULL,
  "porcentaje" DECIMAL(5,2) NOT NULL,
  "monto" DECIMAL(14,2) NOT NULL,
  "comprobante_numero" TEXT,
  "estado" TEXT NOT NULL DEFAULT 'VIGENTE',
  "creado_por" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "fiscal_retenciones_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "fiscal_retenciones_tenant_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "fiscal_retenciones_usuario_fkey" FOREIGN KEY ("creado_por") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "fiscal_retenciones_documento_fkey" FOREIGN KEY ("tenant_id", "documento_id") REFERENCES "fiscal_documentos"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "fiscal_retenciones_regla_fkey" FOREIGN KEY ("tenant_id", "regla_id") REFERENCES "fiscal_reglas_retencion"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "fiscal_retenciones_tipo_chk" CHECK ("tipo" IN ('EFECTUADA', 'SUFRIDA')),
  CONSTRAINT "fiscal_retenciones_estado_chk" CHECK ("estado" IN ('VIGENTE', 'ANULADA')),
  CONSTRAINT "fiscal_retenciones_importes_chk" CHECK ("base" > 0 AND "monto" > 0 AND "monto" <= "base" AND "porcentaje" > 0 AND "porcentaje" <= 100),
  CONSTRAINT "fiscal_retenciones_comprobante_chk" CHECK ("comprobante_numero" IS NULL OR "comprobante_numero" ~ '^[0-9]{3}-[0-9]{3}-[0-9]{2}-[0-9]{8}$')
);
CREATE INDEX "fiscal_retenciones_tenant_fecha_idx" ON "fiscal_retenciones"("tenant_id", "fecha");
CREATE INDEX "fiscal_retenciones_documento_idx" ON "fiscal_retenciones"("tenant_id", "documento_id");

-- 7. Períodos fiscales mensuales (sin fila = abierto). El cierre guarda los totales y su huella.
CREATE TABLE "fiscal_periodos" (
  "tenant_id" TEXT NOT NULL,
  "anio" INTEGER NOT NULL,
  "mes" INTEGER NOT NULL,
  "estado" TEXT NOT NULL,
  "resumen" JSONB,
  "huella" CHAR(64),
  "cerrado_por" TEXT,
  "cerrado_at" TIMESTAMP(3),
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "fiscal_periodos_pkey" PRIMARY KEY ("tenant_id", "anio", "mes"),
  CONSTRAINT "fiscal_periodos_tenant_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "fiscal_periodos_usuario_fkey" FOREIGN KEY ("cerrado_por") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "fiscal_periodos_mes_chk" CHECK ("mes" BETWEEN 1 AND 12 AND "anio" BETWEEN 2000 AND 2100),
  CONSTRAINT "fiscal_periodos_estado_chk" CHECK ("estado" IN ('ABIERTO', 'CERRADO')),
  CONSTRAINT "fiscal_periodos_cierre_chk" CHECK ("estado" = 'ABIERTO' OR ("huella" IS NOT NULL AND "resumen" IS NOT NULL AND "cerrado_por" IS NOT NULL AND "cerrado_at" IS NOT NULL))
);

-- 8. Bitácora de ajustes: solo inserción
CREATE TABLE "fiscal_ajustes" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "anio" INTEGER NOT NULL,
  "mes" INTEGER NOT NULL,
  "entidad" TEXT NOT NULL,
  "entidad_id" TEXT NOT NULL,
  "accion" TEXT NOT NULL,
  "motivo" TEXT NOT NULL,
  "anterior" JSONB,
  "nuevo" JSONB,
  "usuario_id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "fiscal_ajustes_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "fiscal_ajustes_tenant_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "fiscal_ajustes_usuario_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "fiscal_ajustes_entidad_chk" CHECK ("entidad" IN ('CONFIGURACION', 'TASA', 'REGLA_RETENCION', 'CAI', 'DOCUMENTO', 'RETENCION', 'PERIODO', 'CUENTA', 'ASIENTO')),
  CONSTRAINT "fiscal_ajustes_motivo_chk" CHECK (length(trim("motivo")) BETWEEN 3 AND 500),
  CONSTRAINT "fiscal_ajustes_periodo_chk" CHECK ("mes" BETWEEN 1 AND 12 AND "anio" BETWEEN 2000 AND 2100)
);
CREATE INDEX "fiscal_ajustes_tenant_periodo_idx" ON "fiscal_ajustes"("tenant_id", "anio", "mes", "created_at");

-- 9. Partida doble: catálogo de cuentas, asientos y líneas
CREATE TABLE "contable_cuentas" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "codigo" TEXT NOT NULL,
  "nombre" TEXT NOT NULL,
  "tipo" TEXT NOT NULL,
  "naturaleza" TEXT NOT NULL,
  "padre_id" TEXT,
  "acepta_movimientos" BOOLEAN NOT NULL DEFAULT true,
  "activa" BOOLEAN NOT NULL DEFAULT true,
  "creado_por" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "contable_cuentas_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "contable_cuentas_tenant_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "contable_cuentas_usuario_fkey" FOREIGN KEY ("creado_por") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "contable_cuentas_codigo_chk" CHECK ("codigo" ~ '^[0-9]{1,6}(\.[0-9]{1,6}){0,6}$'),
  CONSTRAINT "contable_cuentas_nombre_chk" CHECK (length(trim("nombre")) BETWEEN 2 AND 150),
  CONSTRAINT "contable_cuentas_tipo_chk" CHECK ("tipo" IN ('ACTIVO', 'PASIVO', 'PATRIMONIO', 'INGRESO', 'COSTO', 'GASTO')),
  CONSTRAINT "contable_cuentas_naturaleza_chk" CHECK ("naturaleza" IN ('DEUDORA', 'ACREEDORA'))
);
CREATE UNIQUE INDEX "contable_cuentas_tenant_id_id_key" ON "contable_cuentas"("tenant_id", "id");
ALTER TABLE "contable_cuentas" ADD CONSTRAINT "contable_cuentas_padre_fkey" FOREIGN KEY ("tenant_id", "padre_id") REFERENCES "contable_cuentas"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE UNIQUE INDEX "contable_cuentas_tenant_codigo_key" ON "contable_cuentas"("tenant_id", "codigo");

CREATE TABLE "contable_asientos" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "numero" INTEGER NOT NULL,
  "fecha" DATE NOT NULL,
  "concepto" TEXT NOT NULL,
  "origen" TEXT NOT NULL DEFAULT 'MANUAL',
  "revierte_id" TEXT,
  "estado" TEXT NOT NULL DEFAULT 'CONTABILIZADO',
  "creado_por" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "contable_asientos_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "contable_asientos_tenant_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "contable_asientos_usuario_fkey" FOREIGN KEY ("creado_por") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "contable_asientos_numero_chk" CHECK ("numero" >= 1),
  CONSTRAINT "contable_asientos_concepto_chk" CHECK (length(trim("concepto")) BETWEEN 3 AND 300),
  CONSTRAINT "contable_asientos_origen_chk" CHECK ("origen" IN ('MANUAL', 'REVERSION') AND (("origen" = 'REVERSION') = ("revierte_id" IS NOT NULL))),
  CONSTRAINT "contable_asientos_estado_chk" CHECK ("estado" IN ('CONTABILIZADO', 'REVERTIDO'))
);
CREATE UNIQUE INDEX "contable_asientos_tenant_id_id_key" ON "contable_asientos"("tenant_id", "id");
ALTER TABLE "contable_asientos" ADD CONSTRAINT "contable_asientos_revierte_fkey" FOREIGN KEY ("tenant_id", "revierte_id") REFERENCES "contable_asientos"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE UNIQUE INDEX "contable_asientos_tenant_numero_key" ON "contable_asientos"("tenant_id", "numero");
CREATE UNIQUE INDEX "contable_asientos_revierte_key" ON "contable_asientos"("tenant_id", "revierte_id");
CREATE INDEX "contable_asientos_tenant_fecha_idx" ON "contable_asientos"("tenant_id", "fecha");

CREATE TABLE "contable_asiento_lineas" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "asiento_id" TEXT NOT NULL,
  "cuenta_id" TEXT NOT NULL,
  "debe" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "haber" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "descripcion" TEXT,
  CONSTRAINT "contable_asiento_lineas_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "contable_asiento_lineas_asiento_fkey" FOREIGN KEY ("tenant_id", "asiento_id") REFERENCES "contable_asientos"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "contable_asiento_lineas_cuenta_fkey" FOREIGN KEY ("tenant_id", "cuenta_id") REFERENCES "contable_cuentas"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "contable_asiento_lineas_importe_chk" CHECK ("debe" >= 0 AND "haber" >= 0 AND (("debe" > 0) <> ("haber" > 0)))
);
CREATE INDEX "contable_asiento_lineas_asiento_idx" ON "contable_asiento_lineas"("tenant_id", "asiento_id");
CREATE INDEX "contable_asiento_lineas_cuenta_idx" ON "contable_asiento_lineas"("tenant_id", "cuenta_id");

-- Cada asiento cuadra (debe = haber) y tiene al menos dos líneas; se comprueba al confirmar la transacción.
CREATE OR REPLACE FUNCTION "contable_asiento_cuadrado"() RETURNS trigger AS $$
DECLARE d NUMERIC; h NUMERIC; n INTEGER;
BEGIN
  SELECT COALESCE(sum("debe"), 0), COALESCE(sum("haber"), 0), count(*) INTO d, h, n
    FROM "contable_asiento_lineas" WHERE "tenant_id" = NEW."tenant_id" AND "asiento_id" = NEW."asiento_id";
  IF n < 2 OR d <> h OR d = 0 THEN
    RAISE EXCEPTION 'El asiento no cuadra: debe % / haber % en % líneas', d, h, n USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;
CREATE CONSTRAINT TRIGGER "contable_asiento_cuadrado_tg" AFTER INSERT ON "contable_asiento_lineas"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "contable_asiento_cuadrado"();

-- Trazabilidad: ajustes, retenciones y líneas no se reescriben ni se borran; los asientos solo pasan a REVERTIDO.
CREATE OR REPLACE FUNCTION "fiscal_solo_insercion"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Registro de solo inserción: % no admite cambios', TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "fiscal_ajustes_inmutables_tg" BEFORE UPDATE OR DELETE ON "fiscal_ajustes" FOR EACH ROW EXECUTE FUNCTION "fiscal_solo_insercion"();
CREATE TRIGGER "contable_asiento_lineas_inmutables_tg" BEFORE UPDATE OR DELETE ON "contable_asiento_lineas" FOR EACH ROW EXECUTE FUNCTION "fiscal_solo_insercion"();

CREATE OR REPLACE FUNCTION "contable_asiento_solo_reversion"() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Los asientos contables no se eliminan; revierta el asiento'; END IF;
  IF OLD."estado" <> 'CONTABILIZADO' OR NEW."estado" <> 'REVERTIDO'
     OR (to_jsonb(NEW) - 'estado') <> (to_jsonb(OLD) - 'estado') THEN
    RAISE EXCEPTION 'Un asiento contabilizado solo puede marcarse como revertido';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "contable_asientos_reversion_tg" BEFORE UPDATE OR DELETE ON "contable_asientos" FOR EACH ROW EXECUTE FUNCTION "contable_asiento_solo_reversion"();

CREATE OR REPLACE FUNCTION "fiscal_retencion_solo_anulacion"() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Las retenciones no se eliminan; anule la retención'; END IF;
  IF OLD."estado" <> 'VIGENTE' OR NEW."estado" <> 'ANULADA'
     OR (to_jsonb(NEW) - 'estado') <> (to_jsonb(OLD) - 'estado') THEN
    RAISE EXCEPTION 'Una retención vigente solo puede anularse';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "fiscal_retenciones_anulacion_tg" BEFORE UPDATE OR DELETE ON "fiscal_retenciones" FOR EACH ROW EXECUTE FUNCTION "fiscal_retencion_solo_anulacion"();

-- Misma empresa: usuarios y ventas se referencian por su id (sin depender de las claves compuestas de la
-- migración 20261012000000, que su reversión de emergencia elimina) y este disparador impide cruzar empresas.
-- Argumentos: pares columna/tabla referenciada.
CREATE OR REPLACE FUNCTION "fiscal_misma_empresa"() RETURNS trigger AS $$
DECLARE i INTEGER := 0; valor TEXT; empresa TEXT;
BEGIN
  WHILE i < TG_NARGS LOOP
    valor := to_jsonb(NEW) ->> TG_ARGV[i];
    IF valor IS NOT NULL THEN
      EXECUTE format('SELECT tenant_id FROM %I WHERE id = $1', TG_ARGV[i + 1]) INTO empresa USING valor;
      IF empresa IS DISTINCT FROM NEW."tenant_id" THEN
        RAISE EXCEPTION 'Referencia de otra empresa en %.%', TG_TABLE_NAME, TG_ARGV[i] USING ERRCODE = '23503';
      END IF;
    END IF;
    i := i + 2;
  END LOOP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "fiscal_configuraciones_empresa_tg" BEFORE INSERT OR UPDATE ON "fiscal_configuraciones" FOR EACH ROW EXECUTE FUNCTION "fiscal_misma_empresa"('actualizado_por', 'usuarios');
CREATE TRIGGER "fiscal_tasas_empresa_tg" BEFORE INSERT OR UPDATE ON "fiscal_tasas" FOR EACH ROW EXECUTE FUNCTION "fiscal_misma_empresa"('creado_por', 'usuarios');
CREATE TRIGGER "fiscal_reglas_retencion_empresa_tg" BEFORE INSERT OR UPDATE ON "fiscal_reglas_retencion" FOR EACH ROW EXECUTE FUNCTION "fiscal_misma_empresa"('creado_por', 'usuarios');
CREATE TRIGGER "fiscal_cai_empresa_tg" BEFORE INSERT OR UPDATE ON "fiscal_cai" FOR EACH ROW EXECUTE FUNCTION "fiscal_misma_empresa"('creado_por', 'usuarios');
CREATE TRIGGER "fiscal_documentos_empresa_tg" BEFORE INSERT OR UPDATE ON "fiscal_documentos" FOR EACH ROW EXECUTE FUNCTION "fiscal_misma_empresa"('creado_por', 'usuarios', 'venta_id', 'ventas');
CREATE TRIGGER "fiscal_retenciones_empresa_tg" BEFORE INSERT OR UPDATE ON "fiscal_retenciones" FOR EACH ROW EXECUTE FUNCTION "fiscal_misma_empresa"('creado_por', 'usuarios');
CREATE TRIGGER "fiscal_periodos_empresa_tg" BEFORE INSERT OR UPDATE ON "fiscal_periodos" FOR EACH ROW EXECUTE FUNCTION "fiscal_misma_empresa"('cerrado_por', 'usuarios');
CREATE TRIGGER "fiscal_ajustes_empresa_tg" BEFORE INSERT ON "fiscal_ajustes" FOR EACH ROW EXECUTE FUNCTION "fiscal_misma_empresa"('usuario_id', 'usuarios');
CREATE TRIGGER "contable_cuentas_empresa_tg" BEFORE INSERT OR UPDATE ON "contable_cuentas" FOR EACH ROW EXECUTE FUNCTION "fiscal_misma_empresa"('creado_por', 'usuarios');
CREATE TRIGGER "contable_asientos_empresa_tg" BEFORE INSERT ON "contable_asientos" FOR EACH ROW EXECUTE FUNCTION "fiscal_misma_empresa"('creado_por', 'usuarios');

-- Los documentos no se borran (se anulan con motivo; las correcciones dejan rastro en fiscal_ajustes).
CREATE OR REPLACE FUNCTION "fiscal_documentos_sin_borrado"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Los documentos fiscales no se eliminan; anule el documento';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "fiscal_documentos_sin_borrado_tg" BEFORE DELETE ON "fiscal_documentos" FOR EACH ROW EXECUTE FUNCTION "fiscal_documentos_sin_borrado"();

-- Como el resto de tablas privadas: sin acceso desde PostgREST (anon/authenticated); solo el backend propietario.
ALTER TABLE "fiscal_configuraciones" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "fiscal_tasas" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "fiscal_reglas_retencion" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "fiscal_cai" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "fiscal_documentos" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "fiscal_retenciones" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "fiscal_periodos" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "fiscal_ajustes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "contable_cuentas" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "contable_asientos" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "contable_asiento_lineas" ENABLE ROW LEVEL SECURITY;
