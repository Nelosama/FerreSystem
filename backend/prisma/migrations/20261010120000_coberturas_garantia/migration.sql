-- Cobertura de garantía por línea de factura, en días calendario.
-- Aditiva: crea una tabla nueva. No modifica `garantias` (reclamos), ventas, productos ni tenants.
-- Vencimiento = fecha de venta de la factura (día de negocio) + días de garantía.

CREATE TABLE "coberturas_garantia" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "venta_id" TEXT NOT NULL,
    "detalle_venta_id" TEXT NOT NULL,
    "producto_id" TEXT NOT NULL,
    "numero_serie" TEXT,
    "fecha_venta" DATE NOT NULL,
    "dias_garantia" INTEGER NOT NULL,
    "fecha_vencimiento" DATE NOT NULL,
    "solicitud_id" TEXT NOT NULL,
    "creado_por" TEXT NOT NULL,
    "actualizado_por" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "coberturas_garantia_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "coberturas_garantia_dias_check" CHECK ("dias_garantia" BETWEEN 1 AND 3650),
    CONSTRAINT "coberturas_garantia_vencimiento_check" CHECK ("fecha_vencimiento" = "fecha_venta" + "dias_garantia"),
    CONSTRAINT "coberturas_garantia_tenant_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "coberturas_garantia_venta_fkey" FOREIGN KEY ("venta_id") REFERENCES "ventas"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "coberturas_garantia_detalle_fkey" FOREIGN KEY ("detalle_venta_id") REFERENCES "detalles_venta"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "coberturas_garantia_producto_fkey" FOREIGN KEY ("producto_id") REFERENCES "productos"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "coberturas_garantia_creado_fkey" FOREIGN KEY ("creado_por") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "coberturas_garantia_actualizado_fkey" FOREIGN KEY ("actualizado_por") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "coberturas_garantia_tenant_detalle_key" ON "coberturas_garantia"("tenant_id", "detalle_venta_id");
CREATE UNIQUE INDEX "coberturas_garantia_tenant_solicitud_key" ON "coberturas_garantia"("tenant_id", "solicitud_id");
CREATE INDEX "coberturas_garantia_tenant_venta_idx" ON "coberturas_garantia"("tenant_id", "venta_id");
CREATE INDEX "coberturas_garantia_tenant_vencimiento_idx" ON "coberturas_garantia"("tenant_id", "fecha_vencimiento");

-- Integridad: la línea debe pertenecer a la factura indicada, el producto debe ser el de esa línea
-- y la factura debe ser de la misma empresa. Protege también escrituras directas fuera del servicio.
CREATE FUNCTION "coberturas_garantia_validar"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  v_producto TEXT;
  v_tenant_venta TEXT;
BEGIN
  SELECT d.producto_id, v.tenant_id INTO v_producto, v_tenant_venta
  FROM detalles_venta d
  JOIN ventas v ON v.id = d.venta_id
  WHERE d.id = NEW.detalle_venta_id AND d.venta_id = NEW.venta_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'La línea no pertenece a la factura indicada' USING ERRCODE = 'foreign_key_violation';
  END IF;
  IF v_tenant_venta <> NEW.tenant_id THEN
    RAISE EXCEPTION 'La factura pertenece a otra empresa' USING ERRCODE = 'foreign_key_violation';
  END IF;
  IF v_producto <> NEW.producto_id THEN
    RAISE EXCEPTION 'El producto no corresponde a la línea de la factura' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "coberturas_garantia_validar_trg"
BEFORE INSERT OR UPDATE ON "coberturas_garantia"
FOR EACH ROW EXECUTE FUNCTION "coberturas_garantia_validar"();
