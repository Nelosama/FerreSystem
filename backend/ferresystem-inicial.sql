-- CreateEnum
CREATE TYPE "Rol" AS ENUM ('ADMIN', 'CAJERO', 'BODEGUERO', 'VENDEDOR');

-- CreateEnum
CREATE TYPE "EstadoTenant" AS ENUM ('ACTIVO', 'SUSPENDIDO');

-- CreateEnum
CREATE TYPE "UnidadMedida" AS ENUM ('UNIDAD', 'PIE', 'METRO', 'METRO_CUADRADO', 'METRO_CUBICO', 'LIBRA', 'KG', 'GALON', 'LITRO', 'CAJA', 'PAQUETE', 'OTRO');

-- CreateEnum
CREATE TYPE "TipoCliente" AS ENUM ('CONSUMIDOR_FINAL', 'MAYORISTA', 'CONTRATISTA');

-- CreateEnum
CREATE TYPE "MetodoPago" AS ENUM ('EFECTIVO', 'TARJETA', 'CREDITO', 'TRANSFERENCIA');

-- CreateEnum
CREATE TYPE "EstadoVenta" AS ENUM ('COMPLETADA', 'ANULADA');

-- CreateEnum
CREATE TYPE "EstadoCotizacion" AS ENUM ('BORRADOR', 'ENVIADA', 'APROBADA', 'RECHAZADA', 'VENCIDA', 'CONVERTIDA');

-- CreateEnum
CREATE TYPE "TipoSecuencia" AS ENUM ('VENTA', 'COTIZACION');

-- CreateEnum
CREATE TYPE "ModoNavegacion" AS ENUM ('SIDEBAR', 'TOPNAV');

-- CreateEnum
CREATE TYPE "EstadoLevantamiento" AS ENUM ('BORRADOR', 'EN_PROGRESO', 'REVISION', 'FINALIZADO');

-- CreateEnum
CREATE TYPE "EstadoCompra" AS ENUM ('PENDIENTE', 'PAGADA', 'PARCIAL');

-- CreateEnum
CREATE TYPE "TipoPago" AS ENUM ('CONTADO', 'CREDITO');

-- CreateEnum
CREATE TYPE "EstadoCaja" AS ENUM ('ABIERTA', 'CERRADA');

-- CreateEnum
CREATE TYPE "TipoMovimientoCaja" AS ENUM ('DEVOLUCION', 'INGRESO_MANUAL', 'EGRESO_MANUAL', 'VENTA_POS', 'ABONO_APARTADO', 'ABONO_CXC', 'PAGO_CXP');

-- CreateEnum
CREATE TYPE "EstadoOrdenCompra" AS ENUM ('BORRADOR', 'SOLICITADA', 'APROBADA', 'RECIBIDA', 'CANCELADA');

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
    "configuracion" JSONB NOT NULL DEFAULT '{}',

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
    "permisos" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "permisos_configurados" BOOLEAN NOT NULL DEFAULT false,
    "descuento_maximo" DECIMAL(5,2) NOT NULL DEFAULT 0,
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
    "stock_reservado" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "codigo_barras" TEXT,
    "codigo_fabricante" TEXT,
    "margen" DECIMAL(5,2),
    "ultima_compra_at" TIMESTAMP(3),
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "categoria_id" TEXT,
    "precio_venta" DECIMAL(12,2) NOT NULL,
    "precio_costo" DECIMAL(12,2) NOT NULL,
    "costo_vigente" DECIMAL(12,2),
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
    "codigo" TEXT NOT NULL DEFAULT '',
    "numero_cliente" INTEGER NOT NULL DEFAULT 0,
    "nombre" TEXT NOT NULL,
    "rtn" TEXT,
    "telefono" TEXT,
    "email" TEXT,
    "direccion" TEXT,
    "tipo" "TipoCliente" NOT NULL DEFAULT 'CONSUMIDOR_FINAL',
    "credito_habilitado" BOOLEAN NOT NULL DEFAULT false,
    "limite_credito" DECIMAL(12,2),
    "saldo_pendiente" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "clientes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "secuencias_cliente" (
    "tenant_id" TEXT NOT NULL,
    "ultimo_numero" INTEGER NOT NULL,

    CONSTRAINT "secuencias_cliente_pkey" PRIMARY KEY ("tenant_id")
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
    "reserva_pendiente" BOOLEAN NOT NULL DEFAULT false,
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
    "tipo_pago" "TipoPago" NOT NULL DEFAULT 'CONTADO',
    "saldo_credito" DECIMAL(12,2),
    "caja_id" TEXT,
    "entregado_at" TIMESTAMP(3),
    "entregado_por" TEXT,
    "cliente_nombre" TEXT,
    "cliente_rtn" TEXT,
    "solicitud_hash" TEXT,
    "estado" "EstadoVenta" NOT NULL DEFAULT 'COMPLETADA',
    "notas" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ventas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "abonos_cliente" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "cliente_id" TEXT NOT NULL,
    "venta_id" TEXT,
    "monto" DECIMAL(12,2) NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL,
    "metodo" TEXT,
    "notas" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "abonos_cliente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "detalles_venta" (
    "id" TEXT NOT NULL,
    "venta_id" TEXT NOT NULL,
    "producto_id" TEXT NOT NULL,
    "cantidad" DECIMAL(12,2) NOT NULL,
    "precio_unitario" DECIMAL(12,2) NOT NULL,
    "subtotal" DECIMAL(12,2) NOT NULL,
    "costo_unitario" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "sin_inventario" BOOLEAN NOT NULL DEFAULT false,
    "proveedor_id" TEXT,
    "orden_compra_id" TEXT,

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

-- CreateTable
CREATE TABLE "levantamientos" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "estado" "EstadoLevantamiento" NOT NULL DEFAULT 'BORRADOR',
    "created_by" TEXT,
    "aplicado_at" TIMESTAMP(3),
    "aplicado_por" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "levantamientos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "levantamiento_items" (
    "id" TEXT NOT NULL,
    "levantamiento_id" TEXT NOT NULL,
    "descripcion" TEXT NOT NULL,
    "cantidad" DECIMAL(12,2) NOT NULL,
    "unidad" TEXT NOT NULL DEFAULT 'unidad',
    "codigo" TEXT,
    "codigo_barras" TEXT,
    "ubicacion" TEXT,
    "precio_costo" DECIMAL(12,2),
    "precio_venta" DECIMAL(12,2),
    "margen" DECIMAL(5,2),
    "producto_id" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_by" TEXT,
    "updated_by" TEXT,
    "marca" TEXT,
    "categoria" TEXT,
    "notas" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "levantamiento_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "proveedores" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "rtn" TEXT,
    "contacto" TEXT,
    "telefono" TEXT,
    "email" TEXT,
    "direccion" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "proveedores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "compras_proveedor" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "proveedor_id" TEXT NOT NULL,
    "numero_factura" TEXT,
    "monto" DECIMAL(12,2) NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL,
    "vencimiento" TIMESTAMP(3),
    "estado" "EstadoCompra" NOT NULL DEFAULT 'PENDIENTE',
    "notas" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "compras_proveedor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "detalles_compra_proveedor" (
    "id" TEXT NOT NULL,
    "compra_id" TEXT NOT NULL,
    "producto_id" TEXT NOT NULL,
    "cantidad" DECIMAL(12,2) NOT NULL,
    "costo_unitario" DECIMAL(12,2) NOT NULL,
    "subtotal" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "detalles_compra_proveedor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pagos_proveedor" (
    "id" TEXT NOT NULL,
    "compra_id" TEXT NOT NULL,
    "monto" DECIMAL(12,2) NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL,
    "metodo" TEXT,
    "notas" TEXT,

    CONSTRAINT "pagos_proveedor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
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
    "numero_factura" TEXT,
    "vencimiento" TIMESTAMP(3),
    "notas" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ordenes_compra_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "detalles_orden_compra" (
    "id" TEXT NOT NULL,
    "orden_id" TEXT NOT NULL,
    "producto_id" TEXT NOT NULL,
    "cantidad" DECIMAL(12,2) NOT NULL,
    "cantidad_recibida" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "precio_costo" DECIMAL(12,2) NOT NULL,
    "subtotal" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "detalles_orden_compra_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recepciones_compra" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "orden_id" TEXT NOT NULL,
    "solicitud_id" TEXT NOT NULL,
    "solicitud_hash" TEXT NOT NULL,
    "usuario_id" TEXT NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recepciones_compra_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "costos_compra" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "producto_id" TEXT NOT NULL,
    "proveedor_id" TEXT NOT NULL,
    "orden_id" TEXT NOT NULL,
    "recepcion_id" TEXT NOT NULL,
    "cantidad" DECIMAL(12,2) NOT NULL,
    "costo" DECIMAL(12,2) NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "costos_compra_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "movimientos_inventario" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "producto_id" TEXT NOT NULL,
    "usuario_id" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "cantidad" DECIMAL(12,2) NOT NULL,
    "anterior" DECIMAL(12,2) NOT NULL,
    "nuevo" DECIMAL(12,2) NOT NULL,
    "documento_id" TEXT NOT NULL,
    "motivo" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "movimientos_inventario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
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

-- CreateTable
CREATE TABLE "movimientos_caja" (
    "id" TEXT NOT NULL,
    "caja_id" TEXT NOT NULL,
    "tipo" "TipoMovimientoCaja" NOT NULL,
    "monto" DECIMAL(12,2) NOT NULL,
    "metodo" TEXT NOT NULL DEFAULT 'EFECTIVO',
    "usuario_id" TEXT,
    "concepto" TEXT NOT NULL,
    "referencia" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "movimientos_caja_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cuentas_operativas" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "cliente_id" TEXT,
    "proveedor_id" TEXT,
    "documento_id" TEXT NOT NULL,
    "monto" DECIMAL(12,2) NOT NULL,
    "saldo" DECIMAL(12,2) NOT NULL,
    "vencimiento" TIMESTAMP(3),
    "usuario_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cuentas_operativas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pagos_cuenta" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "cuenta_id" TEXT NOT NULL,
    "solicitud_id" TEXT NOT NULL,
    "solicitud_hash" TEXT NOT NULL,
    "monto" DECIMAL(12,2) NOT NULL,
    "metodo" TEXT NOT NULL,
    "usuario_id" TEXT NOT NULL,
    "caja_id" TEXT,
    "notas" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pagos_cuenta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auditoria_operaciones" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "usuario_id" TEXT NOT NULL,
    "operacion" TEXT NOT NULL,
    "entidad_id" TEXT NOT NULL,
    "datos" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auditoria_operaciones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "devoluciones" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "venta_id" TEXT NOT NULL,
    "usuario_id" TEXT NOT NULL,
    "solicitud_hash" TEXT NOT NULL,
    "motivo" TEXT NOT NULL,
    "monto" DECIMAL(12,2) NOT NULL,
    "credito_cancelado" DECIMAL(12,2) NOT NULL,
    "reembolso" DECIMAL(12,2) NOT NULL,
    "metodo" TEXT NOT NULL,
    "caja_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "devoluciones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "detalles_devolucion" (
    "id" TEXT NOT NULL,
    "devolucion_id" TEXT NOT NULL,
    "detalle_venta_id" TEXT NOT NULL,
    "cantidad" DECIMAL(12,2) NOT NULL,
    "destino" TEXT NOT NULL,

    CONSTRAINT "detalles_devolucion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "solicitudes_devolucion" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "venta_id" TEXT NOT NULL,
    "solicitante_id" TEXT NOT NULL,
    "solicitud_hash" TEXT NOT NULL,
    "comando" JSONB NOT NULL,
    "monto_estimado" DECIMAL(12,2) NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'PENDIENTE',
    "administrador_id" TEXT,
    "motivo_decision" TEXT,
    "decidida_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "solicitudes_devolucion_pkey" PRIMARY KEY ("id")
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
CREATE INDEX "clientes_tenant_id_activo_idx" ON "clientes"("tenant_id", "activo");

-- CreateIndex
CREATE INDEX "clientes_tenant_id_nombre_idx" ON "clientes"("tenant_id", "nombre");

-- CreateIndex
CREATE UNIQUE INDEX "clientes_tenant_id_codigo_key" ON "clientes"("tenant_id", "codigo");

-- CreateIndex
CREATE UNIQUE INDEX "clientes_tenant_id_numero_cliente_key" ON "clientes"("tenant_id", "numero_cliente");

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
CREATE INDEX "abonos_cliente_tenant_id_idx" ON "abonos_cliente"("tenant_id");

-- CreateIndex
CREATE INDEX "abonos_cliente_cliente_id_idx" ON "abonos_cliente"("cliente_id");

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

-- CreateIndex
CREATE INDEX "levantamientos_tenant_id_idx" ON "levantamientos"("tenant_id");

-- CreateIndex
CREATE INDEX "levantamientos_tenant_id_estado_idx" ON "levantamientos"("tenant_id", "estado");

-- CreateIndex
CREATE INDEX "levantamientos_tenant_id_created_at_idx" ON "levantamientos"("tenant_id", "created_at");

-- CreateIndex
CREATE INDEX "levantamiento_items_levantamiento_id_idx" ON "levantamiento_items"("levantamiento_id");

-- CreateIndex
CREATE INDEX "proveedores_tenant_id_idx" ON "proveedores"("tenant_id");

-- CreateIndex
CREATE INDEX "proveedores_tenant_id_nombre_idx" ON "proveedores"("tenant_id", "nombre");

-- CreateIndex
CREATE INDEX "compras_proveedor_tenant_id_idx" ON "compras_proveedor"("tenant_id");

-- CreateIndex
CREATE INDEX "compras_proveedor_tenant_id_estado_idx" ON "compras_proveedor"("tenant_id", "estado");

-- CreateIndex
CREATE INDEX "detalles_compra_proveedor_compra_id_idx" ON "detalles_compra_proveedor"("compra_id");

-- CreateIndex
CREATE INDEX "detalles_compra_proveedor_producto_id_idx" ON "detalles_compra_proveedor"("producto_id");

-- CreateIndex
CREATE INDEX "pagos_proveedor_compra_id_idx" ON "pagos_proveedor"("compra_id");

-- CreateIndex
CREATE INDEX "ordenes_compra_tenant_id_idx" ON "ordenes_compra"("tenant_id");

-- CreateIndex
CREATE INDEX "ordenes_compra_tenant_id_estado_idx" ON "ordenes_compra"("tenant_id", "estado");

-- CreateIndex
CREATE UNIQUE INDEX "ordenes_compra_tenant_id_codigo_key" ON "ordenes_compra"("tenant_id", "codigo");

-- CreateIndex
CREATE INDEX "detalles_orden_compra_orden_id_idx" ON "detalles_orden_compra"("orden_id");

-- CreateIndex
CREATE INDEX "recepciones_compra_orden_id_idx" ON "recepciones_compra"("orden_id");

-- CreateIndex
CREATE UNIQUE INDEX "recepciones_compra_tenant_id_solicitud_id_key" ON "recepciones_compra"("tenant_id", "solicitud_id");

-- CreateIndex
CREATE INDEX "costos_compra_tenant_id_producto_id_fecha_idx" ON "costos_compra"("tenant_id", "producto_id", "fecha");

-- CreateIndex
CREATE INDEX "movimientos_inventario_tenant_id_producto_id_created_at_idx" ON "movimientos_inventario"("tenant_id", "producto_id", "created_at");

-- CreateIndex
CREATE INDEX "cajas_tenant_id_estado_idx" ON "cajas"("tenant_id", "estado");

-- CreateIndex
CREATE INDEX "cajas_tenant_id_usuario_id_idx" ON "cajas"("tenant_id", "usuario_id");

-- CreateIndex
CREATE UNIQUE INDEX "cajas_tenant_id_codigo_key" ON "cajas"("tenant_id", "codigo");

-- CreateIndex
CREATE INDEX "movimientos_caja_caja_id_idx" ON "movimientos_caja"("caja_id");

-- CreateIndex
CREATE INDEX "cuentas_operativas_tenant_id_tipo_vencimiento_idx" ON "cuentas_operativas"("tenant_id", "tipo", "vencimiento");

-- CreateIndex
CREATE UNIQUE INDEX "cuentas_operativas_tenant_id_tipo_documento_id_key" ON "cuentas_operativas"("tenant_id", "tipo", "documento_id");

-- CreateIndex
CREATE INDEX "pagos_cuenta_cuenta_id_idx" ON "pagos_cuenta"("cuenta_id");

-- CreateIndex
CREATE UNIQUE INDEX "pagos_cuenta_tenant_id_solicitud_id_key" ON "pagos_cuenta"("tenant_id", "solicitud_id");

-- CreateIndex
CREATE INDEX "auditoria_operaciones_tenant_id_created_at_idx" ON "auditoria_operaciones"("tenant_id", "created_at");

-- CreateIndex
CREATE INDEX "devoluciones_tenant_id_venta_id_idx" ON "devoluciones"("tenant_id", "venta_id");

-- CreateIndex
CREATE INDEX "detalles_devolucion_detalle_venta_id_idx" ON "detalles_devolucion"("detalle_venta_id");

-- CreateIndex
CREATE INDEX "solicitudes_devolucion_tenant_id_estado_created_at_idx" ON "solicitudes_devolucion"("tenant_id", "estado", "created_at");

-- CreateIndex
CREATE INDEX "solicitudes_devolucion_tenant_id_solicitante_id_idx" ON "solicitudes_devolucion"("tenant_id", "solicitante_id");

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
ALTER TABLE "secuencias_cliente" ADD CONSTRAINT "secuencias_cliente_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "secuencias_tenant" ADD CONSTRAINT "secuencias_tenant_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ventas" ADD CONSTRAINT "ventas_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ventas" ADD CONSTRAINT "ventas_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ventas" ADD CONSTRAINT "ventas_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "abonos_cliente" ADD CONSTRAINT "abonos_cliente_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "abonos_cliente" ADD CONSTRAINT "abonos_cliente_venta_id_fkey" FOREIGN KEY ("venta_id") REFERENCES "ventas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

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

-- AddForeignKey
ALTER TABLE "levantamientos" ADD CONSTRAINT "levantamientos_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "levantamiento_items" ADD CONSTRAINT "levantamiento_items_levantamiento_id_fkey" FOREIGN KEY ("levantamiento_id") REFERENCES "levantamientos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "compras_proveedor" ADD CONSTRAINT "compras_proveedor_proveedor_id_fkey" FOREIGN KEY ("proveedor_id") REFERENCES "proveedores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "detalles_compra_proveedor" ADD CONSTRAINT "detalles_compra_proveedor_compra_id_fkey" FOREIGN KEY ("compra_id") REFERENCES "compras_proveedor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "detalles_compra_proveedor" ADD CONSTRAINT "detalles_compra_proveedor_producto_id_fkey" FOREIGN KEY ("producto_id") REFERENCES "productos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pagos_proveedor" ADD CONSTRAINT "pagos_proveedor_compra_id_fkey" FOREIGN KEY ("compra_id") REFERENCES "compras_proveedor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recepciones_compra" ADD CONSTRAINT "recepciones_compra_orden_id_fkey" FOREIGN KEY ("orden_id") REFERENCES "ordenes_compra"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "costos_compra" ADD CONSTRAINT "costos_compra_producto_id_fkey" FOREIGN KEY ("producto_id") REFERENCES "productos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "costos_compra" ADD CONSTRAINT "costos_compra_recepcion_id_fkey" FOREIGN KEY ("recepcion_id") REFERENCES "recepciones_compra"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "costos_compra" ADD CONSTRAINT "costos_compra_proveedor_id_fkey" FOREIGN KEY ("proveedor_id") REFERENCES "proveedores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimientos_inventario" ADD CONSTRAINT "movimientos_inventario_producto_id_fkey" FOREIGN KEY ("producto_id") REFERENCES "productos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cuentas_operativas" ADD CONSTRAINT "cuentas_operativas_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cuentas_operativas" ADD CONSTRAINT "cuentas_operativas_proveedor_id_fkey" FOREIGN KEY ("proveedor_id") REFERENCES "proveedores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pagos_cuenta" ADD CONSTRAINT "pagos_cuenta_cuenta_id_fkey" FOREIGN KEY ("cuenta_id") REFERENCES "cuentas_operativas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "devoluciones" ADD CONSTRAINT "devoluciones_venta_id_fkey" FOREIGN KEY ("venta_id") REFERENCES "ventas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "detalles_devolucion" ADD CONSTRAINT "detalles_devolucion_devolucion_id_fkey" FOREIGN KEY ("devolucion_id") REFERENCES "devoluciones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "detalles_devolucion" ADD CONSTRAINT "detalles_devolucion_detalle_venta_id_fkey" FOREIGN KEY ("detalle_venta_id") REFERENCES "detalles_venta"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
