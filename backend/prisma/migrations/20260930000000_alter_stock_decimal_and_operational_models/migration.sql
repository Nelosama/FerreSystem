-- AlterTable: Change stock_actual and stock_minimo from Int to Decimal(12,2) in productos
ALTER TABLE "productos" ALTER COLUMN "stock_actual" SET DATA TYPE DECIMAL(12,2);
ALTER TABLE "productos" ALTER COLUMN "stock_minimo" SET DATA TYPE DECIMAL(12,2);

-- CreateEnum: EstadoCaja
CREATE TYPE "EstadoCaja" AS ENUM ('ABIERTA', 'CERRADA');

-- CreateEnum: TipoMovimientoCaja
CREATE TYPE "TipoMovimientoCaja" AS ENUM ('INGRESO_MANUAL', 'EGRESO_MANUAL', 'VENTA_POS', 'ABONO_APARTADO');

-- CreateEnum: EstadoOrdenCompra
CREATE TYPE "EstadoOrdenCompra" AS ENUM ('BORRADOR', 'SOLICITADA', 'APROBADA', 'RECIBIDA', 'CANCELADA');

-- CreateEnum: EstadoApartado
CREATE TYPE "EstadoApartado" AS ENUM ('ACTIVO', 'COMPLETADO', 'CANCELADO');

-- CreateEnum: EstadoTransferencia
CREATE TYPE "EstadoTransferencia" AS ENUM ('SOLICITADA', 'EN_TRANSITO', 'ACEPTADA', 'RECHAZADA');

-- CreateEnum: EstadoGarantia
CREATE TYPE "EstadoGarantia" AS ENUM ('RECIBIDO', 'EN_REVISION', 'APROBADO_REPARACION', 'REEMPLAZADO', 'RECHAZADO');

-- CreateEnum: EstadoPedidoEspecial
CREATE TYPE "EstadoPedidoEspecial" AS ENUM ('PENDIENTE', 'EN_ORDEN_COMPRA', 'RECIBIDO_EN_TIENDA', 'ENTREGADO', 'CANCELADO');

-- CreateTable: cajas
CREATE TABLE "cajas" (
    "id" TEXT NOT NULL,
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
    "notas" TEXT,

    CONSTRAINT "cajas_pkey" PRIMARY KEY ("id")
);

-- CreateTable: movimientos_caja
CREATE TABLE "movimientos_caja" (
    "id" TEXT NOT NULL,
    "caja_id" TEXT NOT NULL,
    "tipo" "TipoMovimientoCaja" NOT NULL,
    "monto" DECIMAL(12,2) NOT NULL,
    "concepto" TEXT NOT NULL,
    "referencia" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "movimientos_caja_pkey" PRIMARY KEY ("id")
);

-- CreateTable: proveedores
CREATE TABLE "proveedores" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "rtn" TEXT,
    "contacto" TEXT,
    "telefono" TEXT,
    "email" TEXT,
    "direccion" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "proveedores_pkey" PRIMARY KEY ("id")
);

-- CreateTable: ordenes_compra
CREATE TABLE "ordenes_compra" (
    "id" TEXT NOT NULL,
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
    "notas" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ordenes_compra_pkey" PRIMARY KEY ("id")
);

-- CreateTable: detalles_orden_compra
CREATE TABLE "detalles_orden_compra" (
    "id" TEXT NOT NULL,
    "orden_id" TEXT NOT NULL,
    "producto_id" TEXT NOT NULL,
    "cantidad" DECIMAL(12,2) NOT NULL,
    "precio_costo" DECIMAL(12,2) NOT NULL,
    "subtotal" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "detalles_orden_compra_pkey" PRIMARY KEY ("id")
);

-- CreateTable: apartados
CREATE TABLE "apartados" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "cliente_id" TEXT,
    "cliente_nombre" TEXT NOT NULL,
    "cliente_telefono" TEXT NOT NULL,
    "producto_id" TEXT NOT NULL,
    "cantidad" DECIMAL(12,2) NOT NULL,
    "precio_total" DECIMAL(12,2) NOT NULL,
    "monto_abonado" DECIMAL(12,2) NOT NULL,
    "saldo_pendiente" DECIMAL(12,2) NOT NULL,
    "fecha_limite" TIMESTAMP(3) NOT NULL,
    "estado" "EstadoApartado" NOT NULL DEFAULT 'ACTIVO',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "apartados_pkey" PRIMARY KEY ("id")
);

-- CreateTable: abonos_apartado
CREATE TABLE "abonos_apartado" (
    "id" TEXT NOT NULL,
    "apartado_id" TEXT NOT NULL,
    "monto" DECIMAL(12,2) NOT NULL,
    "nota" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "abonos_apartado_pkey" PRIMARY KEY ("id")
);

-- CreateTable: transferencias
CREATE TABLE "transferencias" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "sucursal_origen" TEXT NOT NULL,
    "sucursal_destino" TEXT NOT NULL,
    "usuario_id" TEXT NOT NULL,
    "estado" "EstadoTransferencia" NOT NULL DEFAULT 'SOLICITADA',
    "notas" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "transferencias_pkey" PRIMARY KEY ("id")
);

-- CreateTable: detalles_transferencia
CREATE TABLE "detalles_transferencia" (
    "id" TEXT NOT NULL,
    "transferencia_id" TEXT NOT NULL,
    "producto_id" TEXT NOT NULL,
    "cantidad" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "detalles_transferencia_pkey" PRIMARY KEY ("id")
);

-- CreateTable: listas_precio
CREATE TABLE "listas_precio" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "nombre_segmento" TEXT NOT NULL,
    "descuento_porcentaje" DECIMAL(5,2) NOT NULL,
    "descripcion" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "listas_precio_pkey" PRIMARY KEY ("id")
);

-- CreateTable: garantias
CREATE TABLE "garantias" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "venta_id" TEXT,
    "cliente_nombre" TEXT NOT NULL,
    "producto_id" TEXT NOT NULL,
    "serie" TEXT,
    "motivo_falla" TEXT NOT NULL,
    "estado" "EstadoGarantia" NOT NULL DEFAULT 'RECIBIDO',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "garantias_pkey" PRIMARY KEY ("id")
);

-- CreateTable: historial_garantias
CREATE TABLE "historial_garantias" (
    "id" TEXT NOT NULL,
    "garantia_id" TEXT NOT NULL,
    "estado" "EstadoGarantia" NOT NULL,
    "comentario" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "historial_garantias_pkey" PRIMARY KEY ("id")
);

-- CreateTable: pedidos_especiales
CREATE TABLE "pedidos_especiales" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "cliente_nombre" TEXT NOT NULL,
    "cliente_telefono" TEXT NOT NULL,
    "descripcion" TEXT NOT NULL,
    "cantidad" DECIMAL(12,2) NOT NULL,
    "anticipo" DECIMAL(12,2) NOT NULL,
    "precio_estimado" DECIMAL(12,2) NOT NULL,
    "estado" "EstadoPedidoEspecial" NOT NULL DEFAULT 'PENDIENTE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pedidos_especiales_pkey" PRIMARY KEY ("id")
);

-- CreateTable: cierres_comisiones
CREATE TABLE "cierres_comisiones" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "vendedor_id" TEXT NOT NULL,
    "fecha_inicio" TIMESTAMP(3) NOT NULL,
    "fecha_fin" TIMESTAMP(3) NOT NULL,
    "total_vendido" DECIMAL(12,2) NOT NULL,
    "comision_ganada" DECIMAL(12,2) NOT NULL,
    "pagado" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cierres_comisiones_pkey" PRIMARY KEY ("id")
);

-- CreateTable: auditoria_soporte
CREATE TABLE "auditoria_soporte" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "super_admin_email" TEXT NOT NULL,
    "motivo" TEXT NOT NULL,
    "duracion_minutos" INTEGER NOT NULL DEFAULT 30,
    "modo_edicion_activado" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auditoria_soporte_pkey" PRIMARY KEY ("id")
);

-- AlterTable: Add lista_precio_id to clientes
ALTER TABLE "clientes" ADD COLUMN "lista_precio_id" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "cajas_tenant_id_codigo_key" ON "cajas"("tenant_id", "codigo");
CREATE INDEX "cajas_tenant_id_estado_idx" ON "cajas"("tenant_id", "estado");
CREATE INDEX "cajas_tenant_id_usuario_id_idx" ON "cajas"("tenant_id", "usuario_id");

-- CreateIndex
CREATE INDEX "movimientos_caja_caja_id_idx" ON "movimientos_caja"("caja_id");

-- CreateIndex
CREATE INDEX "proveedores_tenant_id_idx" ON "proveedores"("tenant_id");
CREATE INDEX "proveedores_tenant_id_nombre_idx" ON "proveedores"("tenant_id", "nombre");

-- CreateIndex
CREATE UNIQUE INDEX "ordenes_compra_tenant_id_codigo_key" ON "ordenes_compra"("tenant_id", "codigo");
CREATE INDEX "ordenes_compra_tenant_id_idx" ON "ordenes_compra"("tenant_id");
CREATE INDEX "ordenes_compra_tenant_id_estado_idx" ON "ordenes_compra"("tenant_id", "estado");

-- CreateIndex
CREATE INDEX "detalles_orden_compra_orden_id_idx" ON "detalles_orden_compra"("orden_id");

-- CreateIndex
CREATE UNIQUE INDEX "apartados_tenant_id_codigo_key" ON "apartados"("tenant_id", "codigo");
CREATE INDEX "apartados_tenant_id_idx" ON "apartados"("tenant_id");
CREATE INDEX "apartados_tenant_id_estado_idx" ON "apartados"("tenant_id", "estado");

-- CreateIndex
CREATE INDEX "abonos_apartado_apartado_id_idx" ON "abonos_apartado"("apartado_id");

-- CreateIndex
CREATE UNIQUE INDEX "transferencias_tenant_id_codigo_key" ON "transferencias"("tenant_id", "codigo");
CREATE INDEX "transferencias_tenant_id_idx" ON "transferencias"("tenant_id");
CREATE INDEX "transferencias_tenant_id_estado_idx" ON "transferencias"("tenant_id", "estado");

-- CreateIndex
CREATE INDEX "detalles_transferencia_transferencia_id_idx" ON "detalles_transferencia"("transferencia_id");

-- CreateIndex
CREATE UNIQUE INDEX "listas_precio_tenant_id_nombre_segmento_key" ON "listas_precio"("tenant_id", "nombre_segmento");
CREATE INDEX "listas_precio_tenant_id_idx" ON "listas_precio"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "garantias_tenant_id_codigo_key" ON "garantias"("tenant_id", "codigo");
CREATE INDEX "garantias_tenant_id_idx" ON "garantias"("tenant_id");
CREATE INDEX "garantias_tenant_id_estado_idx" ON "garantias"("tenant_id", "estado");

-- CreateIndex
CREATE INDEX "historial_garantias_garantia_id_idx" ON "historial_garantias"("garantia_id");

-- CreateIndex
CREATE UNIQUE INDEX "pedidos_especiales_tenant_id_codigo_key" ON "pedidos_especiales"("tenant_id", "codigo");
CREATE INDEX "pedidos_especiales_tenant_id_idx" ON "pedidos_especiales"("tenant_id");
CREATE INDEX "pedidos_especiales_tenant_id_estado_idx" ON "pedidos_especiales"("tenant_id", "estado");

-- CreateIndex
CREATE INDEX "cierres_comisiones_tenant_id_vendedor_id_idx" ON "cierres_comisiones"("tenant_id", "vendedor_id");

-- CreateIndex
CREATE INDEX "auditoria_soporte_tenant_id_idx" ON "auditoria_soporte"("tenant_id");

-- AddForeignKey
ALTER TABLE "cajas" ADD CONSTRAINT "cajas_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "cajas" ADD CONSTRAINT "cajas_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimientos_caja" ADD CONSTRAINT "movimientos_caja_caja_id_fkey" FOREIGN KEY ("caja_id") REFERENCES "cajas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proveedores" ADD CONSTRAINT "proveedores_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ordenes_compra" ADD CONSTRAINT "ordenes_compra_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ordenes_compra" ADD CONSTRAINT "ordenes_compra_proveedor_id_fkey" FOREIGN KEY ("proveedor_id") REFERENCES "proveedores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ordenes_compra" ADD CONSTRAINT "ordenes_compra_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "detalles_orden_compra" ADD CONSTRAINT "detalles_orden_compra_orden_id_fkey" FOREIGN KEY ("orden_id") REFERENCES "ordenes_compra"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "detalles_orden_compra" ADD CONSTRAINT "detalles_orden_compra_producto_id_fkey" FOREIGN KEY ("producto_id") REFERENCES "productos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "apartados" ADD CONSTRAINT "apartados_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "apartados" ADD CONSTRAINT "apartados_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "apartados" ADD CONSTRAINT "apartados_producto_id_fkey" FOREIGN KEY ("producto_id") REFERENCES "productos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "abonos_apartado" ADD CONSTRAINT "abonos_apartado_apartado_id_fkey" FOREIGN KEY ("apartado_id") REFERENCES "apartados"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transferencias" ADD CONSTRAINT "transferencias_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "transferencias" ADD CONSTRAINT "transferencias_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "detalles_transferencia" ADD CONSTRAINT "detalles_transferencia_transferencia_id_fkey" FOREIGN KEY ("transferencia_id") REFERENCES "transferencias"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "detalles_transferencia" ADD CONSTRAINT "detalles_transferencia_producto_id_fkey" FOREIGN KEY ("producto_id") REFERENCES "productos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clientes" ADD CONSTRAINT "clientes_lista_precio_id_fkey" FOREIGN KEY ("lista_precio_id") REFERENCES "listas_precio"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listas_precio" ADD CONSTRAINT "listas_precio_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "garantias" ADD CONSTRAINT "garantias_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "garantias" ADD CONSTRAINT "garantias_venta_id_fkey" FOREIGN KEY ("venta_id") REFERENCES "ventas"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "garantias" ADD CONSTRAINT "garantias_producto_id_fkey" FOREIGN KEY ("producto_id") REFERENCES "productos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "historial_garantias" ADD CONSTRAINT "historial_garantias_garantia_id_fkey" FOREIGN KEY ("garantia_id") REFERENCES "garantias"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pedidos_especiales" ADD CONSTRAINT "pedidos_especiales_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cierres_comisiones" ADD CONSTRAINT "cierres_comisiones_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "cierres_comisiones" ADD CONSTRAINT "cierres_comisiones_vendedor_id_fkey" FOREIGN KEY ("vendedor_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auditoria_soporte" ADD CONSTRAINT "auditoria_soporte_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
