-- CreateEnum
CREATE TYPE "Rol" AS ENUM ('ADMIN', 'CAJERO', 'BODEGUERO', 'VENDEDOR');

-- CreateEnum
CREATE TYPE "EstadoTenant" AS ENUM ('ACTIVO', 'SUSPENDIDO');

-- CreateEnum
CREATE TYPE "UnidadMedida" AS ENUM ('UNIDAD', 'PIE', 'METRO', 'METRO_CUADRADO', 'METRO_CUBICO', 'LIBRA', 'KG', 'GALON', 'LITRO', 'CAJA', 'PAQUETE', 'OTRO');

-- CreateEnum
CREATE TYPE "TipoCliente" AS ENUM ('CONSUMIDOR_FINAL', 'MAYORISTA', 'CONTRATISTA');

-- CreateEnum
CREATE TYPE "MetodoPago" AS ENUM ('EFECTIVO', 'TARJETA', 'CREDITO');

-- CreateEnum
CREATE TYPE "EstadoVenta" AS ENUM ('COMPLETADA', 'ANULADA');

-- CreateEnum
CREATE TYPE "EstadoCotizacion" AS ENUM ('BORRADOR', 'ENVIADA', 'APROBADA', 'RECHAZADA', 'VENCIDA', 'CONVERTIDA');

-- CreateEnum
CREATE TYPE "TipoSecuencia" AS ENUM ('VENTA', 'COTIZACION');

-- CreateEnum
CREATE TYPE "ModoNavegacion" AS ENUM ('SIDEBAR', 'TOPNAV');

-- CreateTable
CREATE TABLE "super_admins" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "super_admins_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenants" (
    "id" TEXT NOT NULL,
    "nombre_comercial" TEXT NOT NULL,
    "direccion" TEXT,
    "telefono" TEXT,
    "email" TEXT,
    "logo_url" TEXT,
    "color_primario" TEXT NOT NULL DEFAULT '#EA580C',
    "modo_navegacion" "ModoNavegacion" NOT NULL DEFAULT 'SIDEBAR',
    "plan" TEXT NOT NULL DEFAULT 'Plan Pro',
    "estado" "EstadoTenant" NOT NULL DEFAULT 'ACTIVO',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_modules" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "module_key" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenant_modules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usuarios" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "rol" "Rol" NOT NULL DEFAULT 'ADMIN',
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "usuarios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categorias" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "categorias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "productos" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "codigo_barras" TEXT,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "categoria_id" TEXT,
    "precio_venta" DECIMAL(12,2) NOT NULL,
    "precio_costo" DECIMAL(12,2) NOT NULL,
    "stock_actual" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "stock_minimo" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "unidad_medida" "UnidadMedida" NOT NULL DEFAULT 'UNIDAD',
    "usa_medida" BOOLEAN NOT NULL DEFAULT false,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "imagen_url" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "productos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clientes" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "rtn" TEXT,
    "telefono" TEXT,
    "email" TEXT,
    "direccion" TEXT,
    "tipo" "TipoCliente" NOT NULL DEFAULT 'CONSUMIDOR_FINAL',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "clientes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "secuencias_tenant" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "tipo" "TipoSecuencia" NOT NULL,
    "ultimo_numero" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "secuencias_tenant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ventas" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "numero_venta" INTEGER NOT NULL,
    "cliente_id" TEXT,
    "usuario_id" TEXT NOT NULL,
    "subtotal" DECIMAL(12,2) NOT NULL,
    "isv" DECIMAL(12,2) NOT NULL,
    "descuento" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(12,2) NOT NULL,
    "metodo_pago" "MetodoPago" NOT NULL DEFAULT 'EFECTIVO',
    "estado" "EstadoVenta" NOT NULL DEFAULT 'COMPLETADA',
    "notas" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ventas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "detalles_venta" (
    "id" TEXT NOT NULL,
    "venta_id" TEXT NOT NULL,
    "producto_id" TEXT NOT NULL,
    "cantidad" DECIMAL(12,2) NOT NULL,
    "precio_unitario" DECIMAL(12,2) NOT NULL,
    "subtotal" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "detalles_venta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cotizaciones" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "numero_cotizacion" INTEGER NOT NULL,
    "cliente_id" TEXT,
    "cliente_nombre" TEXT NOT NULL DEFAULT '',
    "cliente_rtn" TEXT,
    "cliente_telefono" TEXT,
    "cliente_email" TEXT,
    "cliente_direccion" TEXT,
    "usuario_id" TEXT NOT NULL,
    "subtotal" DECIMAL(12,2) NOT NULL,
    "porcentaje_isv" DECIMAL(5,2) NOT NULL DEFAULT 15.00,
    "isv" DECIMAL(12,2) NOT NULL,
    "descuento" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "descuento_general" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "tipo_descuento_general" TEXT NOT NULL DEFAULT 'MONTO',
    "total" DECIMAL(12,2) NOT NULL,
    "estado" "EstadoCotizacion" NOT NULL DEFAULT 'BORRADOR',
    "fecha_validez" DATE NOT NULL,
    "dias_validez" INTEGER NOT NULL DEFAULT 15,
    "condiciones_pago" TEXT NOT NULL DEFAULT 'CONTADO',
    "notas" TEXT,
    "venta_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cotizaciones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "detalles_cotizacion" (
    "id" TEXT NOT NULL,
    "cotizacion_id" TEXT NOT NULL,
    "producto_id" TEXT NOT NULL,
    "codigo_producto" TEXT NOT NULL DEFAULT '',
    "descripcion_producto" TEXT NOT NULL DEFAULT '',
    "unidad_medida" TEXT NOT NULL DEFAULT 'UNIDAD',
    "usa_medida" BOOLEAN NOT NULL DEFAULT false,
    "cantidad" DECIMAL(12,2) NOT NULL,
    "medida" DECIMAL(12,2) NOT NULL DEFAULT 1.00,
    "total_medida" DECIMAL(12,2) NOT NULL DEFAULT 1.00,
    "precio_lista" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "precio_unitario" DECIMAL(12,2) NOT NULL,
    "descuento" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "tipo_descuento" TEXT NOT NULL DEFAULT 'MONTO',
    "exento" BOOLEAN NOT NULL DEFAULT false,
    "subtotal" DECIMAL(12,2) NOT NULL,
    "isv" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "total_linea" DECIMAL(12,2) NOT NULL DEFAULT 0,

    CONSTRAINT "detalles_cotizacion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "super_admins_email_key" ON "super_admins"("email");

-- CreateIndex
CREATE INDEX "tenant_modules_tenant_id_idx" ON "tenant_modules"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "tenant_modules_tenant_id_module_key_key" ON "tenant_modules"("tenant_id", "module_key");

-- CreateIndex
CREATE INDEX "usuarios_tenant_id_idx" ON "usuarios"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "usuarios_tenant_id_email_key" ON "usuarios"("tenant_id", "email");

-- CreateIndex
CREATE INDEX "categorias_tenant_id_idx" ON "categorias"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "categorias_tenant_id_nombre_key" ON "categorias"("tenant_id", "nombre");

-- CreateIndex
CREATE INDEX "productos_tenant_id_idx" ON "productos"("tenant_id");

-- CreateIndex
CREATE INDEX "productos_tenant_id_activo_idx" ON "productos"("tenant_id", "activo");

-- CreateIndex
CREATE INDEX "productos_tenant_id_nombre_idx" ON "productos"("tenant_id", "nombre");

-- CreateIndex
CREATE INDEX "productos_tenant_id_codigo_barras_idx" ON "productos"("tenant_id", "codigo_barras");

-- CreateIndex
CREATE UNIQUE INDEX "productos_tenant_id_codigo_key" ON "productos"("tenant_id", "codigo");

-- CreateIndex
CREATE INDEX "clientes_tenant_id_idx" ON "clientes"("tenant_id");

-- CreateIndex
CREATE INDEX "clientes_tenant_id_nombre_idx" ON "clientes"("tenant_id", "nombre");

-- CreateIndex
CREATE UNIQUE INDEX "secuencias_tenant_tenant_id_tipo_key" ON "secuencias_tenant"("tenant_id", "tipo");

-- CreateIndex
CREATE INDEX "ventas_tenant_id_idx" ON "ventas"("tenant_id");

-- CreateIndex
CREATE INDEX "ventas_tenant_id_estado_idx" ON "ventas"("tenant_id", "estado");

-- CreateIndex
CREATE INDEX "ventas_tenant_id_created_at_idx" ON "ventas"("tenant_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "ventas_tenant_id_numero_venta_key" ON "ventas"("tenant_id", "numero_venta");

-- CreateIndex
CREATE INDEX "detalles_venta_venta_id_idx" ON "detalles_venta"("venta_id");

-- CreateIndex
CREATE UNIQUE INDEX "cotizaciones_venta_id_key" ON "cotizaciones"("venta_id");

-- CreateIndex
CREATE INDEX "cotizaciones_tenant_id_idx" ON "cotizaciones"("tenant_id");

-- CreateIndex
CREATE INDEX "cotizaciones_tenant_id_estado_idx" ON "cotizaciones"("tenant_id", "estado");

-- CreateIndex
CREATE INDEX "cotizaciones_tenant_id_fecha_validez_idx" ON "cotizaciones"("tenant_id", "fecha_validez");

-- CreateIndex
CREATE UNIQUE INDEX "cotizaciones_tenant_id_numero_cotizacion_key" ON "cotizaciones"("tenant_id", "numero_cotizacion");

-- CreateIndex
CREATE INDEX "detalles_cotizacion_cotizacion_id_idx" ON "detalles_cotizacion"("cotizacion_id");

-- AddForeignKey
ALTER TABLE "tenant_modules" ADD CONSTRAINT "tenant_modules_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usuarios" ADD CONSTRAINT "usuarios_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "categorias" ADD CONSTRAINT "categorias_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "productos" ADD CONSTRAINT "productos_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "productos" ADD CONSTRAINT "productos_categoria_id_fkey" FOREIGN KEY ("categoria_id") REFERENCES "categorias"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clientes" ADD CONSTRAINT "clientes_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "secuencias_tenant" ADD CONSTRAINT "secuencias_tenant_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ventas" ADD CONSTRAINT "ventas_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ventas" ADD CONSTRAINT "ventas_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ventas" ADD CONSTRAINT "ventas_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "detalles_venta" ADD CONSTRAINT "detalles_venta_venta_id_fkey" FOREIGN KEY ("venta_id") REFERENCES "ventas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "detalles_venta" ADD CONSTRAINT "detalles_venta_producto_id_fkey" FOREIGN KEY ("producto_id") REFERENCES "productos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cotizaciones" ADD CONSTRAINT "cotizaciones_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cotizaciones" ADD CONSTRAINT "cotizaciones_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cotizaciones" ADD CONSTRAINT "cotizaciones_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cotizaciones" ADD CONSTRAINT "cotizaciones_venta_id_fkey" FOREIGN KEY ("venta_id") REFERENCES "ventas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "detalles_cotizacion" ADD CONSTRAINT "detalles_cotizacion_cotizacion_id_fkey" FOREIGN KEY ("cotizacion_id") REFERENCES "cotizaciones"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "detalles_cotizacion" ADD CONSTRAINT "detalles_cotizacion_producto_id_fkey" FOREIGN KEY ("producto_id") REFERENCES "productos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

