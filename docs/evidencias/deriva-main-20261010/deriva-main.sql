-- DropForeignKey
ALTER TABLE "abonos_apartado" DROP CONSTRAINT "abonos_apartado_apartado_id_fkey";

-- DropForeignKey
ALTER TABLE "apartados" DROP CONSTRAINT "apartados_cliente_id_fkey";

-- DropForeignKey
ALTER TABLE "apartados" DROP CONSTRAINT "apartados_producto_id_fkey";

-- DropForeignKey
ALTER TABLE "apartados" DROP CONSTRAINT "apartados_tenant_id_fkey";

-- DropForeignKey
ALTER TABLE "auditoria_soporte" DROP CONSTRAINT "auditoria_soporte_tenant_id_fkey";

-- DropForeignKey
ALTER TABLE "cajas" DROP CONSTRAINT "cajas_tenant_id_fkey";

-- DropForeignKey
ALTER TABLE "cajas" DROP CONSTRAINT "cajas_usuario_id_fkey";

-- DropForeignKey
ALTER TABLE "cierres_comisiones" DROP CONSTRAINT "cierres_comisiones_tenant_id_fkey";

-- DropForeignKey
ALTER TABLE "cierres_comisiones" DROP CONSTRAINT "cierres_comisiones_vendedor_id_fkey";

-- DropForeignKey
ALTER TABLE "clientes" DROP CONSTRAINT "clientes_lista_precio_id_fkey";

-- DropForeignKey
ALTER TABLE "costos_compra" DROP CONSTRAINT "costos_compra_producto_id_fkey";

-- DropForeignKey
ALTER TABLE "costos_compra" DROP CONSTRAINT "costos_compra_proveedor_id_fkey";

-- DropForeignKey
ALTER TABLE "costos_compra" DROP CONSTRAINT "costos_compra_recepcion_id_fkey";

-- DropForeignKey
ALTER TABLE "cuentas_operativas" DROP CONSTRAINT "cuentas_operativas_cliente_id_fkey";

-- DropForeignKey
ALTER TABLE "cuentas_operativas" DROP CONSTRAINT "cuentas_operativas_proveedor_id_fkey";

-- DropForeignKey
ALTER TABLE "detalles_devolucion" DROP CONSTRAINT "detalles_devolucion_detalle_venta_id_fkey";

-- DropForeignKey
ALTER TABLE "detalles_devolucion" DROP CONSTRAINT "detalles_devolucion_devolucion_id_fkey";

-- DropForeignKey
ALTER TABLE "detalles_orden_compra" DROP CONSTRAINT "detalles_orden_compra_orden_id_fkey";

-- DropForeignKey
ALTER TABLE "detalles_orden_compra" DROP CONSTRAINT "detalles_orden_compra_producto_id_fkey";

-- DropForeignKey
ALTER TABLE "detalles_transferencia" DROP CONSTRAINT "detalles_transferencia_producto_id_fkey";

-- DropForeignKey
ALTER TABLE "detalles_transferencia" DROP CONSTRAINT "detalles_transferencia_transferencia_id_fkey";

-- DropForeignKey
ALTER TABLE "devoluciones" DROP CONSTRAINT "devoluciones_venta_id_fkey";

-- DropForeignKey
ALTER TABLE "garantias" DROP CONSTRAINT "garantias_producto_id_fkey";

-- DropForeignKey
ALTER TABLE "garantias" DROP CONSTRAINT "garantias_tenant_id_fkey";

-- DropForeignKey
ALTER TABLE "garantias" DROP CONSTRAINT "garantias_venta_id_fkey";

-- DropForeignKey
ALTER TABLE "historial_garantias" DROP CONSTRAINT "historial_garantias_garantia_id_fkey";

-- DropForeignKey
ALTER TABLE "listas_precio" DROP CONSTRAINT "listas_precio_tenant_id_fkey";

-- DropForeignKey
ALTER TABLE "movimientos_caja" DROP CONSTRAINT "movimientos_caja_caja_id_fkey";

-- DropForeignKey
ALTER TABLE "movimientos_inventario" DROP CONSTRAINT "movimientos_inventario_producto_id_fkey";

-- DropForeignKey
ALTER TABLE "ordenes_compra" DROP CONSTRAINT "ordenes_compra_proveedor_id_fkey";

-- DropForeignKey
ALTER TABLE "ordenes_compra" DROP CONSTRAINT "ordenes_compra_tenant_id_fkey";

-- DropForeignKey
ALTER TABLE "ordenes_compra" DROP CONSTRAINT "ordenes_compra_usuario_id_fkey";

-- DropForeignKey
ALTER TABLE "pagos_cuenta" DROP CONSTRAINT "pagos_cuenta_cuenta_id_fkey";

-- DropForeignKey
ALTER TABLE "pedidos_especiales" DROP CONSTRAINT "pedidos_especiales_tenant_id_fkey";

-- DropForeignKey
ALTER TABLE "proveedores" DROP CONSTRAINT "proveedores_tenant_id_fkey";

-- DropForeignKey
ALTER TABLE "recepciones_compra" DROP CONSTRAINT "recepciones_compra_orden_id_fkey";

-- DropForeignKey
ALTER TABLE "transferencias" DROP CONSTRAINT "transferencias_tenant_id_fkey";

-- DropForeignKey
ALTER TABLE "transferencias" DROP CONSTRAINT "transferencias_usuario_id_fkey";

-- AlterTable
ALTER TABLE "auditoria_operaciones" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "clientes" DROP COLUMN "lista_precio_id";

-- AlterTable
ALTER TABLE "compras_proveedor" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "costos_compra" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "cuentas_operativas" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "detalles_compra_proveedor" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "movimientos_inventario" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "pagos_cuenta" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "pagos_proveedor" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "recepciones_compra" ALTER COLUMN "id" DROP DEFAULT;

-- DropTable
DROP TABLE "abonos_apartado";

-- DropTable
DROP TABLE "apartados";

-- DropTable
DROP TABLE "auditoria_soporte";

-- DropTable
DROP TABLE "cierres_comisiones";

-- DropTable
DROP TABLE "detalles_transferencia";

-- DropTable
DROP TABLE "garantias";

-- DropTable
DROP TABLE "historial_garantias";

-- DropTable
DROP TABLE "listas_precio";

-- DropTable
DROP TABLE "pedidos_especiales";

-- DropTable
DROP TABLE "transferencias";

-- DropEnum
DROP TYPE "EstadoApartado";

-- DropEnum
DROP TYPE "EstadoGarantia";

-- DropEnum
DROP TYPE "EstadoPedidoEspecial";

-- DropEnum
DROP TYPE "EstadoTransferencia";

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

