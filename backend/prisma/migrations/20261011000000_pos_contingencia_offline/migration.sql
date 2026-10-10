-- POS offline de contingencia (efectivo). ADITIVA: crea tablas nuevas y agrega columnas NULLABLE/con DEFAULT a `ventas`.
-- No modifica filas existentes, inventarios, cajas ni cierres. Funcionalidad apagada por defecto (bandera por empresa).
-- Reversión manual: DROP de las 4 tablas y de las 6 columnas nuevas de `ventas` (sin pérdida de datos previos).

ALTER TABLE "ventas"
  ADD COLUMN "origen" TEXT NOT NULL DEFAULT 'ONLINE',
  ADD COLUMN "efectivo_recibido" DECIMAL(12,2),
  ADD COLUMN "cambio" DECIMAL(12,2),
  ADD COLUMN "correlativo_local" TEXT,
  ADD COLUMN "ocurrido_at" TIMESTAMP(3),
  ADD COLUMN "referencia_factura_externa" TEXT;

ALTER TABLE "ventas"
  ADD CONSTRAINT "ventas_origen_check" CHECK ("origen" IN ('ONLINE', 'CONTINGENCIA')),
  ADD CONSTRAINT "ventas_efectivo_check" CHECK (
    ("efectivo_recibido" IS NULL AND "cambio" IS NULL)
    OR ("efectivo_recibido" >= 0 AND "cambio" >= 0 AND "efectivo_recibido" - "cambio" = "total")
  );

CREATE TABLE "dispositivos_pos" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "registrado_por" TEXT NOT NULL,
    "registrado_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ultimo_contacto_at" TIMESTAMP(3),
    "ultima_sync_at" TIMESTAMP(3),
    "pendientes_reportados" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "dispositivos_pos_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "dispositivos_pos_codigo_check" CHECK ("codigo" ~ '^[0-9]{2,3}$'),
    CONSTRAINT "dispositivos_pos_tenant_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "dispositivos_pos_tenant_id_codigo_key" ON "dispositivos_pos"("tenant_id", "codigo");

CREATE TABLE "catalogo_instantaneas" (
    "tenant_id" TEXT NOT NULL,
    "hash" TEXT NOT NULL,
    "datos" JSONB NOT NULL,
    "creada_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "catalogo_instantaneas_pkey" PRIMARY KEY ("tenant_id", "hash"),
    CONSTRAINT "catalogo_instantaneas_tenant_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "contingencia_ventanas" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "dispositivo_id" TEXT NOT NULL,
    "usuario_id" TEXT NOT NULL,
    "caja_id" TEXT NOT NULL,
    "emitida_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "vigente_hasta" TIMESTAMP(3) NOT NULL,
    "catalogo_hash" TEXT NOT NULL,
    "limites" JSONB NOT NULL,
    "revocada_at" TIMESTAMP(3),
    CONSTRAINT "contingencia_ventanas_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "contingencia_ventanas_vigencia_check" CHECK ("vigente_hasta" > "emitida_at"),
    CONSTRAINT "contingencia_ventanas_tenant_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "contingencia_ventanas_dispositivo_fkey" FOREIGN KEY ("dispositivo_id") REFERENCES "dispositivos_pos"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "contingencia_ventanas_tenant_id_dispositivo_id_emitida_at_idx" ON "contingencia_ventanas"("tenant_id", "dispositivo_id", "emitida_at");

CREATE TABLE "operaciones_contingencia" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "dispositivo_id" TEXT NOT NULL,
    "ventana_id" TEXT NOT NULL,
    "usuario_id" TEXT NOT NULL,
    "caja_id" TEXT NOT NULL,
    "secuencia_local" INTEGER NOT NULL,
    "correlativo_local" TEXT NOT NULL,
    "ocurrido_at_local" TIMESTAMP(3) NOT NULL,
    "ocurrido_at_estimado" TIMESTAMP(3) NOT NULL,
    "recibido_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "payload" JSONB NOT NULL,
    "payload_hash" TEXT NOT NULL,
    "total_centavos" INTEGER NOT NULL,
    "efectivo_recibido_centavos" INTEGER NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'RECIBIDA',
    "requiere_revision" BOOLEAN NOT NULL DEFAULT false,
    "conflictos" JSONB NOT NULL DEFAULT '[]',
    "venta_id" TEXT,
    "numero_venta" INTEGER,
    "aplicado_at" TIMESTAMP(3),
    "resolucion" JSONB,
    "resuelto_por" TEXT,
    "resuelto_at" TIMESTAMP(3),
    "referencia_factura_externa" TEXT,
    CONSTRAINT "operaciones_contingencia_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "operaciones_contingencia_estado_check" CHECK ("estado" IN ('RECIBIDA', 'APLICADA', 'REVISION', 'RESUELTA_MANUAL')),
    CONSTRAINT "operaciones_contingencia_montos_check" CHECK ("total_centavos" > 0 AND "efectivo_recibido_centavos" >= "total_centavos"),
    CONSTRAINT "operaciones_contingencia_secuencia_check" CHECK ("secuencia_local" > 0),
    CONSTRAINT "operaciones_contingencia_aplicada_check" CHECK ("estado" <> 'APLICADA' OR "venta_id" IS NOT NULL),
    CONSTRAINT "operaciones_contingencia_tenant_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "operaciones_contingencia_dispositivo_fkey" FOREIGN KEY ("dispositivo_id") REFERENCES "dispositivos_pos"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "operaciones_contingencia_ventana_fkey" FOREIGN KEY ("ventana_id") REFERENCES "contingencia_ventanas"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "operaciones_contingencia_venta_fkey" FOREIGN KEY ("venta_id") REFERENCES "ventas"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "operaciones_contingencia_venta_id_key" ON "operaciones_contingencia"("venta_id");
CREATE UNIQUE INDEX "operaciones_contingencia_tenant_id_dispositivo_id_secuencia_local_key" ON "operaciones_contingencia"("tenant_id", "dispositivo_id", "secuencia_local");
CREATE UNIQUE INDEX "operaciones_contingencia_tenant_id_correlativo_local_key" ON "operaciones_contingencia"("tenant_id", "correlativo_local");
CREATE INDEX "operaciones_contingencia_tenant_id_estado_idx" ON "operaciones_contingencia"("tenant_id", "estado");
CREATE INDEX "operaciones_contingencia_tenant_id_recibido_at_idx" ON "operaciones_contingencia"("tenant_id", "recibido_at");

-- Inmutabilidad del diario: la carga recibida y su identidad no pueden modificarse. La aplicación no borra filas;
-- el borrado en cascada al eliminar una empresa se deja permitido a propósito.
CREATE FUNCTION "operaciones_contingencia_inmutable"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."id" IS DISTINCT FROM OLD."id" OR NEW."tenant_id" IS DISTINCT FROM OLD."tenant_id"
     OR NEW."payload" IS DISTINCT FROM OLD."payload" OR NEW."payload_hash" IS DISTINCT FROM OLD."payload_hash"
     OR NEW."dispositivo_id" IS DISTINCT FROM OLD."dispositivo_id" OR NEW."secuencia_local" IS DISTINCT FROM OLD."secuencia_local"
     OR NEW."correlativo_local" IS DISTINCT FROM OLD."correlativo_local" OR NEW."total_centavos" IS DISTINCT FROM OLD."total_centavos"
     OR NEW."efectivo_recibido_centavos" IS DISTINCT FROM OLD."efectivo_recibido_centavos"
     OR NEW."ocurrido_at_local" IS DISTINCT FROM OLD."ocurrido_at_local" OR NEW."recibido_at" IS DISTINCT FROM OLD."recibido_at" THEN
    RAISE EXCEPTION 'La carga recibida del diario de contingencia es inmutable (operacion %)', OLD."id";
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "operaciones_contingencia_inmutable_trg" BEFORE UPDATE ON "operaciones_contingencia"
  FOR EACH ROW EXECUTE FUNCTION "operaciones_contingencia_inmutable"();
