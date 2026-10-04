-- Migración aditiva. Reutiliza las tablas operativas del historial; no elimina datos.
ALTER TYPE "MetodoPago" ADD VALUE IF NOT EXISTS 'TRANSFERENCIA';
ALTER TABLE "usuarios" ADD COLUMN IF NOT EXISTS "permisos" TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE "usuarios" ADD COLUMN IF NOT EXISTS "descuento_maximo" DECIMAL(5,2) NOT NULL DEFAULT 0;
ALTER TABLE "productos" ADD COLUMN IF NOT EXISTS "codigo_fabricante" TEXT;
ALTER TABLE "productos" ADD COLUMN IF NOT EXISTS "margen" DECIMAL(5,2);
ALTER TABLE "productos" ADD COLUMN IF NOT EXISTS "ultima_compra_at" TIMESTAMP(3);
ALTER TABLE "ventas" ADD COLUMN IF NOT EXISTS "caja_id" TEXT;
ALTER TABLE "ventas" ADD COLUMN IF NOT EXISTS "entregado_at" TIMESTAMP(3);
ALTER TABLE "ventas" ADD COLUMN IF NOT EXISTS "entregado_por" TEXT;
ALTER TABLE "ventas" ADD COLUMN IF NOT EXISTS "cliente_nombre" TEXT;
ALTER TABLE "ventas" ADD COLUMN IF NOT EXISTS "cliente_rtn" TEXT;
ALTER TABLE "ventas" ADD COLUMN IF NOT EXISTS "solicitud_hash" TEXT;
ALTER TABLE "detalles_venta" ADD COLUMN IF NOT EXISTS "costo_unitario" DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE "detalles_venta" ADD COLUMN IF NOT EXISTS "sin_inventario" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "detalles_venta" ADD COLUMN IF NOT EXISTS "proveedor_id" TEXT;
ALTER TABLE "detalles_venta" ADD COLUMN IF NOT EXISTS "orden_compra_id" TEXT;
ALTER TABLE "levantamientos" ADD COLUMN IF NOT EXISTS "aplicado_at" TIMESTAMP(3);
ALTER TABLE "levantamientos" ADD COLUMN IF NOT EXISTS "aplicado_por" TEXT;
ALTER TABLE "levantamiento_items" ADD COLUMN IF NOT EXISTS "codigo_barras" TEXT;
ALTER TABLE "levantamiento_items" ADD COLUMN IF NOT EXISTS "ubicacion" TEXT;
ALTER TABLE "levantamiento_items" ADD COLUMN IF NOT EXISTS "precio_costo" DECIMAL(12,2);
ALTER TABLE "levantamiento_items" ADD COLUMN IF NOT EXISTS "precio_venta" DECIMAL(12,2);
ALTER TABLE "levantamiento_items" ADD COLUMN IF NOT EXISTS "margen" DECIMAL(5,2);
ALTER TABLE "levantamiento_items" ADD COLUMN IF NOT EXISTS "producto_id" TEXT;
ALTER TABLE "levantamiento_items" ADD COLUMN IF NOT EXISTS "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "levantamiento_items" ADD COLUMN IF NOT EXISTS "created_by" TEXT;
ALTER TABLE "levantamiento_items" ADD COLUMN IF NOT EXISTS "updated_by" TEXT;
DO $$ BEGIN CREATE TYPE "EstadoCaja" AS ENUM ('ABIERTA', 'CERRADA'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "TipoMovimientoCaja" AS ENUM ('INGRESO_MANUAL', 'EGRESO_MANUAL', 'VENTA_POS', 'ABONO_APARTADO', 'ABONO_CXC', 'PAGO_CXP'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
ALTER TYPE "TipoMovimientoCaja" ADD VALUE IF NOT EXISTS 'ABONO_CXC';
ALTER TYPE "TipoMovimientoCaja" ADD VALUE IF NOT EXISTS 'PAGO_CXP';
DO $$ BEGIN CREATE TYPE "EstadoOrdenCompra" AS ENUM ('BORRADOR', 'SOLICITADA', 'APROBADA', 'RECIBIDA', 'CANCELADA'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS "proveedores" (
 "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text PRIMARY KEY,
 "tenant_id" TEXT NOT NULL,
 "nombre" TEXT NOT NULL,
 "rtn" TEXT,
 "contacto" TEXT,
 "telefono" TEXT,
 "email" TEXT,
 "direccion" TEXT,
 "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updated_at" TIMESTAMP(3) NOT NULL
);
CREATE INDEX IF NOT EXISTS "proveedores_tenant_id_idx" ON "proveedores" ("tenant_id");
CREATE INDEX IF NOT EXISTS "proveedores_tenant_id_nombre_idx" ON "proveedores" ("tenant_id", "nombre");
CREATE TABLE IF NOT EXISTS "ordenes_compra" (
 "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text PRIMARY KEY,
 "tenant_id" TEXT NOT NULL,
 "codigo" TEXT NOT NULL,
 "proveedor_id" TEXT NOT NULL,
 "usuario_id" TEXT NOT NULL,
 "subtotal" DECIMAL(12,2) NOT NULL,
 "isv" DECIMAL(12,2) NOT NULL,
 "total" DECIMAL(12,2) NOT NULL,
 "estado" "EstadoOrdenCompra" NOT NULL DEFAULT 'BORRADOR',
 "fecha_emision" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "fecha_entrega" TIMESTAMP(3),
 "numero_factura" TEXT,
 "vencimiento" TIMESTAMP(3),
 "notas" TEXT,
 "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updated_at" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "ordenes_compra_tenant_id_codigo_key" ON "ordenes_compra" ("tenant_id", "codigo");
CREATE INDEX IF NOT EXISTS "ordenes_compra_tenant_id_idx" ON "ordenes_compra" ("tenant_id");
CREATE INDEX IF NOT EXISTS "ordenes_compra_tenant_id_estado_idx" ON "ordenes_compra" ("tenant_id", "estado");
CREATE TABLE IF NOT EXISTS "detalles_orden_compra" (
 "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text PRIMARY KEY,
 "orden_id" TEXT NOT NULL,
 "producto_id" TEXT NOT NULL,
 "cantidad" DECIMAL(12,2) NOT NULL,
 "cantidad_recibida" DECIMAL(12,2) NOT NULL DEFAULT 0,
 "precio_costo" DECIMAL(12,2) NOT NULL,
 "subtotal" DECIMAL(12,2) NOT NULL
);
CREATE INDEX IF NOT EXISTS "detalles_orden_compra_orden_id_idx" ON "detalles_orden_compra" ("orden_id");
CREATE TABLE IF NOT EXISTS "recepciones_compra" (
 "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text PRIMARY KEY,
 "tenant_id" TEXT NOT NULL,
 "orden_id" TEXT NOT NULL,
 "solicitud_id" TEXT NOT NULL,
 "solicitud_hash" TEXT NOT NULL,
 "usuario_id" TEXT NOT NULL,
 "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "recepciones_compra_tenant_id_solicitud_id_key" ON "recepciones_compra" ("tenant_id", "solicitud_id");
CREATE INDEX IF NOT EXISTS "recepciones_compra_orden_id_idx" ON "recepciones_compra" ("orden_id");
CREATE TABLE IF NOT EXISTS "costos_compra" (
 "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text PRIMARY KEY,
 "tenant_id" TEXT NOT NULL,
 "producto_id" TEXT NOT NULL,
 "proveedor_id" TEXT NOT NULL,
 "orden_id" TEXT NOT NULL,
 "recepcion_id" TEXT NOT NULL,
 "cantidad" DECIMAL(12,2) NOT NULL,
 "costo" DECIMAL(12,2) NOT NULL,
 "fecha" TIMESTAMP(3) NOT NULL
);
CREATE INDEX IF NOT EXISTS "costos_compra_tenant_id_producto_id_fecha_idx" ON "costos_compra" ("tenant_id", "producto_id", "fecha");
CREATE TABLE IF NOT EXISTS "movimientos_inventario" (
 "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text PRIMARY KEY,
 "tenant_id" TEXT NOT NULL,
 "producto_id" TEXT NOT NULL,
 "usuario_id" TEXT NOT NULL,
 "tipo" TEXT NOT NULL,
 "cantidad" DECIMAL(12,2) NOT NULL,
 "anterior" DECIMAL(12,2) NOT NULL,
 "nuevo" DECIMAL(12,2) NOT NULL,
 "documento_id" TEXT NOT NULL,
 "motivo" TEXT NOT NULL,
 "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "movimientos_inventario_tenant_id_producto_id_created_at_idx" ON "movimientos_inventario" ("tenant_id", "producto_id", "created_at");
CREATE TABLE IF NOT EXISTS "cajas" (
 "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text PRIMARY KEY,
 "tenant_id" TEXT NOT NULL,
 "codigo" TEXT NOT NULL,
 "usuario_id" TEXT NOT NULL,
 "monto_apertura" DECIMAL(12,2) NOT NULL,
 "monto_cierre_fisico" DECIMAL(12,2),
 "monto_esperado" DECIMAL(12,2),
 "diferencia" DECIMAL(12,2),
 "estado" "EstadoCaja" NOT NULL DEFAULT 'ABIERTA',
 "fecha_apertura" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "fecha_cierre" TIMESTAMP(3),
 "notas" TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS "cajas_tenant_id_codigo_key" ON "cajas" ("tenant_id", "codigo");
CREATE INDEX IF NOT EXISTS "cajas_tenant_id_estado_idx" ON "cajas" ("tenant_id", "estado");
CREATE INDEX IF NOT EXISTS "cajas_tenant_id_usuario_id_idx" ON "cajas" ("tenant_id", "usuario_id");
CREATE TABLE IF NOT EXISTS "movimientos_caja" (
 "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text PRIMARY KEY,
 "caja_id" TEXT NOT NULL,
 "tipo" "TipoMovimientoCaja" NOT NULL,
 "monto" DECIMAL(12,2) NOT NULL,
 "metodo" TEXT NOT NULL DEFAULT 'EFECTIVO',
 "usuario_id" TEXT,
 "concepto" TEXT NOT NULL,
 "referencia" TEXT,
 "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "movimientos_caja_caja_id_idx" ON "movimientos_caja" ("caja_id");
CREATE TABLE IF NOT EXISTS "cuentas_operativas" (
 "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text PRIMARY KEY,
 "tenant_id" TEXT NOT NULL,
 "tipo" TEXT NOT NULL,
 "cliente_id" TEXT,
 "proveedor_id" TEXT,
 "documento_id" TEXT NOT NULL,
 "monto" DECIMAL(12,2) NOT NULL,
 "saldo" DECIMAL(12,2) NOT NULL,
 "vencimiento" TIMESTAMP(3),
 "usuario_id" TEXT NOT NULL,
 "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "cuentas_operativas_tenant_id_tipo_documento_id_key" ON "cuentas_operativas" ("tenant_id", "tipo", "documento_id");
CREATE INDEX IF NOT EXISTS "cuentas_operativas_tenant_id_tipo_vencimiento_idx" ON "cuentas_operativas" ("tenant_id", "tipo", "vencimiento");
CREATE TABLE IF NOT EXISTS "pagos_cuenta" (
 "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text PRIMARY KEY,
 "tenant_id" TEXT NOT NULL,
 "cuenta_id" TEXT NOT NULL,
 "solicitud_id" TEXT NOT NULL,
 "solicitud_hash" TEXT NOT NULL,
 "monto" DECIMAL(12,2) NOT NULL,
 "metodo" TEXT NOT NULL,
 "usuario_id" TEXT NOT NULL,
 "caja_id" TEXT,
 "notas" TEXT,
 "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "pagos_cuenta_tenant_id_solicitud_id_key" ON "pagos_cuenta" ("tenant_id", "solicitud_id");
CREATE INDEX IF NOT EXISTS "pagos_cuenta_cuenta_id_idx" ON "pagos_cuenta" ("cuenta_id");
CREATE TABLE IF NOT EXISTS "auditoria_operaciones" (
 "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text PRIMARY KEY,
 "tenant_id" TEXT NOT NULL,
 "usuario_id" TEXT NOT NULL,
 "operacion" TEXT NOT NULL,
 "entidad_id" TEXT NOT NULL,
 "datos" JSONB NOT NULL,
 "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "auditoria_operaciones_tenant_id_created_at_idx" ON "auditoria_operaciones" ("tenant_id", "created_at");
ALTER TABLE "ordenes_compra" ADD COLUMN IF NOT EXISTS "numero_factura" TEXT;
ALTER TABLE "ordenes_compra" ADD COLUMN IF NOT EXISTS "vencimiento" TIMESTAMP(3);
ALTER TABLE "detalles_orden_compra" ADD COLUMN IF NOT EXISTS "cantidad_recibida" DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE "movimientos_caja" ADD COLUMN IF NOT EXISTS "metodo" TEXT NOT NULL DEFAULT 'EFECTIVO';
ALTER TABLE "movimientos_caja" ADD COLUMN IF NOT EXISTS "usuario_id" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "cajas_usuario_abierta_key" ON "cajas" ("tenant_id", "usuario_id") WHERE estado = 'ABIERTA';
CREATE UNIQUE INDEX IF NOT EXISTS "facturas_proveedor_key" ON "ordenes_compra" ("tenant_id", "proveedor_id", "numero_factura") WHERE numero_factura IS NOT NULL;
DO $$ BEGIN ALTER TABLE "recepciones_compra" ADD CONSTRAINT "recepciones_compra_orden_id_fkey" FOREIGN KEY ("orden_id") REFERENCES "ordenes_compra"("id") ON DELETE RESTRICT; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "costos_compra" ADD CONSTRAINT "costos_compra_producto_id_fkey" FOREIGN KEY ("producto_id") REFERENCES "productos"("id") ON DELETE RESTRICT; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "costos_compra" ADD CONSTRAINT "costos_compra_recepcion_id_fkey" FOREIGN KEY ("recepcion_id") REFERENCES "recepciones_compra"("id") ON DELETE RESTRICT; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "costos_compra" ADD CONSTRAINT "costos_compra_proveedor_id_fkey" FOREIGN KEY ("proveedor_id") REFERENCES "proveedores"("id") ON DELETE RESTRICT; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "movimientos_inventario" ADD CONSTRAINT "movimientos_inventario_producto_id_fkey" FOREIGN KEY ("producto_id") REFERENCES "productos"("id") ON DELETE RESTRICT; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "cuentas_operativas" ADD CONSTRAINT "cuentas_operativas_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE RESTRICT; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "cuentas_operativas" ADD CONSTRAINT "cuentas_operativas_proveedor_id_fkey" FOREIGN KEY ("proveedor_id") REFERENCES "proveedores"("id") ON DELETE RESTRICT; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "pagos_cuenta" ADD CONSTRAINT "pagos_cuenta_cuenta_id_fkey" FOREIGN KEY ("cuenta_id") REFERENCES "cuentas_operativas"("id") ON DELETE RESTRICT; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE cuentas_operativas ADD CONSTRAINT cuentas_saldo_check CHECK (monto >= 0 AND saldo >= 0 AND saldo <= monto); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE cuentas_operativas ADD CONSTRAINT cuentas_tipo_check CHECK ((tipo = 'CXC' AND cliente_id IS NOT NULL AND proveedor_id IS NULL) OR (tipo = 'CXP' AND proveedor_id IS NOT NULL AND cliente_id IS NULL)); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE pagos_cuenta ADD CONSTRAINT pagos_monto_check CHECK (monto > 0); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE movimientos_inventario ADD CONSTRAINT movimiento_balance_check CHECK (nuevo = anterior + cantidad); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE usuarios ADD CONSTRAINT descuento_maximo_check CHECK (descuento_maximo >= 0 AND descuento_maximo <= 100); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS permisos_configurados BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE productos ADD COLUMN IF NOT EXISTS stock_reservado DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE ventas ADD COLUMN IF NOT EXISTS reserva_pendiente BOOLEAN NOT NULL DEFAULT false;
DO $$ BEGIN ALTER TABLE productos ADD CONSTRAINT stock_reservado_check CHECK (stock_reservado >= 0 AND stock_actual >= stock_reservado) NOT VALID; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
