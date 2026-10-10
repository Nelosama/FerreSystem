-- Cobro y entrega: modo de entrega por línea, contadores de cantidades, eventos de entrega y devolución,
-- claves compuestas por tenant. Migración aditiva. Se ejecuta en una sola transacción (Prisma).
-- Ventas abiertas (reserva pendiente sin entrega): no se modifican; sus contadores quedan en 0 y su
-- reserva actual coincide con C - E - N.

-- 1. tenant_id en detalles_venta (relleno desde la venta; un disparador completa las inserciones futuras sin tenant)
ALTER TABLE "detalles_venta" ADD COLUMN "tenant_id" TEXT;
UPDATE "detalles_venta" d SET "tenant_id" = v."tenant_id" FROM "ventas" v
  WHERE v."id" = d."venta_id" AND d."tenant_id" IS NULL;
ALTER TABLE "detalles_venta" ALTER COLUMN "tenant_id" SET NOT NULL;
ALTER TABLE "detalles_venta" ADD CONSTRAINT "detalles_venta_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION "detalles_venta_tenant_desde_venta"() RETURNS trigger AS $$
BEGIN
  IF NEW."tenant_id" IS NULL THEN
    SELECT v."tenant_id" INTO NEW."tenant_id" FROM "ventas" v WHERE v."id" = NEW."venta_id";
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "detalles_venta_tenant_bi" BEFORE INSERT ON "detalles_venta"
  FOR EACH ROW EXECUTE FUNCTION "detalles_venta_tenant_desde_venta"();

-- 2. Claves referenciables por tenant
ALTER TABLE "ventas" ADD CONSTRAINT "ventas_tenant_id_id_key" UNIQUE ("tenant_id", "id");
ALTER TABLE "productos" ADD CONSTRAINT "productos_tenant_id_id_key" UNIQUE ("tenant_id", "id");
ALTER TABLE "usuarios" ADD CONSTRAINT "usuarios_tenant_id_id_key" UNIQUE ("tenant_id", "id");
ALTER TABLE "detalles_venta" ADD CONSTRAINT "detalles_venta_tenant_id_id_key" UNIQUE ("tenant_id", "id");
ALTER TABLE "detalles_venta" ADD CONSTRAINT "detalles_venta_tenant_venta_fkey"
  FOREIGN KEY ("tenant_id", "venta_id") REFERENCES "ventas"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "detalles_venta" ADD CONSTRAINT "detalles_venta_tenant_producto_fkey"
  FOREIGN KEY ("tenant_id", "producto_id") REFERENCES "productos"("tenant_id", "id") ON UPDATE CASCADE;

-- 3. Modo de entrega y contadores (ver docs/POS_ENTREGA_DISENO_TECNICO.md §2.2).
-- DEFAULT 'BODEGA' se conserva a propósito: una escritura que omita el modo reserva, nunca entrega sin intención.
ALTER TABLE "detalles_venta"
  ADD COLUMN "modo_entrega" TEXT NOT NULL DEFAULT 'BODEGA',
  ADD COLUMN "cantidad_preparada" NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN "cantidad_entregada" NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN "cantidad_devuelta_reingresada" NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN "cantidad_devuelta_sin_reingreso" NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN "cantidad_cancelada" NUMERIC(12,2) NOT NULL DEFAULT 0;

-- 4. Backfill: líneas sin inventario fuera de contadores
UPDATE "detalles_venta" SET "modo_entrega" = 'SIN_INVENTARIO' WHERE "sin_inventario" = true;

-- 5. Backfill: ventas ya entregadas (entrega total registrada en el flujo anterior)
UPDATE "detalles_venta" d SET "cantidad_entregada" = d."cantidad", "modo_entrega" = 'MOSTRADOR'
  FROM "ventas" v
  WHERE v."id" = d."venta_id" AND v."origen" = 'CONTINGENCIA' AND d."sin_inventario" = false;
UPDATE "detalles_venta" d SET "cantidad_entregada" = d."cantidad"
  FROM "ventas" v
  WHERE v."id" = d."venta_id" AND v."entregado_at" IS NOT NULL AND v."origen" <> 'CONTINGENCIA'
    AND d."sin_inventario" = false;

-- 6. Backfill: devoluciones anteriores. INVENTARIO = reingreso; DAÑADO y PROVEEDOR = sin reingreso; NO_ENTREGADO = cancelado.
UPDATE "detalles_venta" d SET
  "cantidad_devuelta_reingresada" = COALESCE((SELECT SUM(dd."cantidad") FROM "detalles_devolucion" dd
      WHERE dd."detalle_venta_id" = d."id" AND dd."destino" = 'INVENTARIO'), 0),
  "cantidad_devuelta_sin_reingreso" = COALESCE((SELECT SUM(dd."cantidad") FROM "detalles_devolucion" dd
      WHERE dd."detalle_venta_id" = d."id" AND dd."destino" IN ('DAÑADO','PROVEEDOR')), 0),
  "cantidad_cancelada" = COALESCE((SELECT SUM(dd."cantidad") FROM "detalles_devolucion" dd
      WHERE dd."detalle_venta_id" = d."id" AND dd."destino" = 'NO_ENTREGADO'), 0)
  WHERE d."sin_inventario" = false;

-- 7. Eventos de entrega, devolución y cobro (solo inserción)
CREATE TABLE "entregas_eventos" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "solicitud_id" TEXT NOT NULL,
  "huella" CHAR(64) NOT NULL,
  "tipo" TEXT NOT NULL,
  "venta_id" TEXT NOT NULL,
  "usuario_id" TEXT NOT NULL,
  "receptor_nombre" TEXT,
  "motivo" TEXT,
  "origen" TEXT NOT NULL,
  "dispositivo_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "entregas_eventos_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "entregas_eventos_tenant_solicitud_key" UNIQUE ("tenant_id", "solicitud_id"),
  CONSTRAINT "entregas_eventos_tenant_id_id_key" UNIQUE ("tenant_id", "id"),
  CONSTRAINT "entregas_eventos_tenant_venta_fkey" FOREIGN KEY ("tenant_id", "venta_id")
    REFERENCES "ventas"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "entregas_eventos_tenant_usuario_fkey" FOREIGN KEY ("tenant_id", "usuario_id")
    REFERENCES "usuarios"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "entregas_eventos_tenant_fkey" FOREIGN KEY ("tenant_id")
    REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "entregas_eventos_tipo_chk" CHECK ("tipo" IN ('COBRO','PREPARACION','ENTREGA','LIBERACION','DEVOLUCION_REINGRESO','DEVOLUCION_SIN_REINGRESO')),
  CONSTRAINT "entregas_eventos_origen_chk" CHECK ("origen" IN ('ONLINE','OFFLINE')),
  CONSTRAINT "entregas_eventos_huella_chk" CHECK ("huella" ~ '^[0-9a-f]{64}$'),
  -- Las devoluciones heredadas solo exigen motivo no vacío; la liberación explícita exige 10 caracteres en la aplicación.
  CONSTRAINT "entregas_eventos_motivo_chk" CHECK ("tipo" NOT IN ('LIBERACION','DEVOLUCION_REINGRESO','DEVOLUCION_SIN_REINGRESO') OR length(btrim("motivo")) >= 1)
);
CREATE INDEX "entregas_eventos_tenant_venta_idx" ON "entregas_eventos" ("tenant_id", "venta_id", "created_at");
CREATE INDEX "entregas_eventos_tenant_fecha_idx" ON "entregas_eventos" ("tenant_id", "created_at");

CREATE TABLE "entregas_eventos_lineas" (
  "tenant_id" TEXT NOT NULL,
  "evento_id" TEXT NOT NULL,
  "detalle_venta_id" TEXT NOT NULL,
  "cantidad" NUMERIC(12,2) NOT NULL,
  CONSTRAINT "entregas_eventos_lineas_pkey" PRIMARY KEY ("tenant_id", "evento_id", "detalle_venta_id"),
  CONSTRAINT "entregas_eventos_lineas_evento_fkey" FOREIGN KEY ("tenant_id", "evento_id")
    REFERENCES "entregas_eventos"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "entregas_eventos_lineas_detalle_fkey" FOREIGN KEY ("tenant_id", "detalle_venta_id")
    REFERENCES "detalles_venta"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "entregas_eventos_lineas_cantidad_chk" CHECK ("cantidad" > 0)
);

-- 8. Movimientos de inventario con evento y línea
ALTER TABLE "movimientos_inventario" ADD COLUMN "evento_id" TEXT, ADD COLUMN "detalle_venta_id" TEXT;
ALTER TABLE "movimientos_inventario" ADD CONSTRAINT "movimientos_evento_fkey"
  FOREIGN KEY ("tenant_id", "evento_id") REFERENCES "entregas_eventos"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "movimientos_inventario" ADD CONSTRAINT "movimientos_detalle_fkey"
  FOREIGN KEY ("tenant_id", "detalle_venta_id") REFERENCES "detalles_venta"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "movimientos_inventario" ADD CONSTRAINT "movimientos_producto_tenant_fkey"
  FOREIGN KEY ("tenant_id", "producto_id") REFERENCES "productos"("tenant_id", "id") ON UPDATE CASCADE;
-- Una línea solo puede tener un movimiento por evento. Entregas sucesivas usan eventos distintos.
CREATE UNIQUE INDEX "movimientos_evento_linea_key" ON "movimientos_inventario" ("tenant_id", "evento_id", "detalle_venta_id")
  WHERE "evento_id" IS NOT NULL AND "detalle_venta_id" IS NOT NULL;

-- 9. Verificación previa a las restricciones (falla antes de dejar datos inconsistentes)
DO $$
DECLARE malos INTEGER;
BEGIN
  SELECT COUNT(*) INTO malos FROM "detalles_venta"
   WHERE "sin_inventario" = false AND (
        "cantidad_entregada" + "cantidad_cancelada" > "cantidad"
     OR "cantidad_devuelta_reingresada" + "cantidad_devuelta_sin_reingreso" > "cantidad_entregada"
     OR "cantidad_preparada" > "cantidad" - "cantidad_entregada" - "cantidad_cancelada"
     OR "cantidad_entregada" < 0 OR "cantidad_cancelada" < 0 OR "cantidad_preparada" < 0);
  IF malos > 0 THEN
    RAISE EXCEPTION 'Backfill de entregas inconsistente en % líneas; no se aplica la migración', malos;
  END IF;
  SELECT COUNT(*) INTO malos FROM "productos" WHERE "stock_reservado" < 0;
  IF malos > 0 THEN
    RAISE EXCEPTION 'Existencias reservadas negativas en % productos; no se aplica la migración', malos;
  END IF;
END $$;

-- 10. Restricciones de cantidades (I1–I6)
ALTER TABLE "detalles_venta"
  ADD CONSTRAINT "detalles_venta_modo_chk" CHECK ("modo_entrega" IN ('MOSTRADOR','BODEGA','SIN_INVENTARIO')),
  ADD CONSTRAINT "detalles_venta_sin_inventario_chk" CHECK ("sin_inventario" = ("modo_entrega" = 'SIN_INVENTARIO')),
  ADD CONSTRAINT "detalles_venta_no_negativos_chk" CHECK ("cantidad_preparada" >= 0 AND "cantidad_entregada" >= 0
    AND "cantidad_devuelta_reingresada" >= 0 AND "cantidad_devuelta_sin_reingreso" >= 0 AND "cantidad_cancelada" >= 0),
  ADD CONSTRAINT "detalles_venta_i2_chk" CHECK ("cantidad_entregada" + "cantidad_cancelada" <= "cantidad"),
  ADD CONSTRAINT "detalles_venta_i3_chk" CHECK ("cantidad_devuelta_reingresada" + "cantidad_devuelta_sin_reingreso" <= "cantidad_entregada"),
  ADD CONSTRAINT "detalles_venta_i4_chk" CHECK ("cantidad_preparada" <= "cantidad" - "cantidad_entregada" - "cantidad_cancelada"),
  ADD CONSTRAINT "detalles_venta_i5_chk" CHECK ("modo_entrega" = 'BODEGA' OR ("cantidad_cancelada" = 0 AND "cantidad_preparada" = 0)),
  ADD CONSTRAINT "detalles_venta_sin_inv_contadores_chk" CHECK ("modo_entrega" <> 'SIN_INVENTARIO'
    OR ("cantidad_entregada" = 0 AND "cantidad_preparada" = 0 AND "cantidad_cancelada" = 0
        AND "cantidad_devuelta_reingresada" = 0 AND "cantidad_devuelta_sin_reingreso" = 0));
ALTER TABLE "productos" ADD CONSTRAINT "productos_stock_reservado_no_negativo_chk" CHECK ("stock_reservado" >= 0);

-- 11. Inmutabilidad de eventos y de la línea de eventos
CREATE OR REPLACE FUNCTION "entregas_eventos_inmutables"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Los eventos de entrega son de solo inserción';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "entregas_eventos_inmutables_tg" BEFORE UPDATE OR DELETE ON "entregas_eventos"
  FOR EACH ROW EXECUTE FUNCTION "entregas_eventos_inmutables"();
CREATE TRIGGER "entregas_eventos_lineas_inmutables_tg" BEFORE UPDATE OR DELETE ON "entregas_eventos_lineas"
  FOR EACH ROW EXECUTE FUNCTION "entregas_eventos_inmutables"();

-- 12. El modo de entrega no cambia después del cobro
CREATE OR REPLACE FUNCTION "detalles_venta_modo_inmutable"() RETURNS trigger AS $$
BEGIN
  IF NEW."modo_entrega" <> OLD."modo_entrega" THEN
    RAISE EXCEPTION 'El modo de entrega no puede cambiar después del cobro';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "detalles_venta_modo_inmutable_tg" BEFORE UPDATE ON "detalles_venta"
  FOR EACH ROW EXECUTE FUNCTION "detalles_venta_modo_inmutable"();
