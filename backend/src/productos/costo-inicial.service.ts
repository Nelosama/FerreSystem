import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { audit, authorizedActor, decimal, fingerprint, lockTenant, query, text } from '../operaciones/ledger';
import { InicializarCostoDto } from './dto/inicializar-costo.dto';

@Injectable()
export class CostoInicialService {
  constructor(private readonly prisma: PrismaService) {}

  async inicializar(tenantId: string, productoId: string, dto: InicializarCostoDto, userId: string) {
    return this.prisma.$transaction(async tx => {
      await lockTenant(tx, tenantId);
      await authorizedActor(tx, tenantId, userId, ['ADMIN']);
      const costo = decimal(dto.costo, 'Costo inicial', true);
      const motivo = text(dto.motivo, 'Motivo');
      // Validar también las llamadas internas que no pasan por el DTO HTTP.
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(dto.solicitudId || '') || !Number.isInteger(dto.version) || dto.version < 1) {
        throw new BadRequestException('Solicitud UUID y versión positiva son requeridas');
      }
      const hash = fingerprint({ productoId, userId, version: dto.version, costo, motivo });
      const [previa] = await query(tx, "SELECT entidad_id, datos FROM auditoria_operaciones WHERE tenant_id=$1 AND operacion='COSTO_INICIALIZAR' AND datos->>'solicitudId'=$2", tenantId, dto.solicitudId);
      if (previa) {
        if (previa.datos.hash !== hash) throw new ConflictException('Solicitud utilizada para otra inicialización');
        // Respuesta original incluso si una compra posterior cambió el costo. No vuelve a escribir.
        return previa.datos.resultado;
      }
      const [producto] = await query(tx, 'SELECT id, version, activo, precio_costo, costo_vigente, ultima_compra_at FROM productos WHERE id=$1 AND tenant_id=$2 FOR UPDATE', productoId, tenantId);
      if (!producto) throw new NotFoundException('Producto no encontrado');
      if (producto.version !== dto.version) throw new ConflictException('El producto cambió; recargue su versión');
      if (!producto.activo) throw new ConflictException('El producto debe estar activo');
      const [historial] = await query(tx, 'SELECT COUNT(*)::int AS cantidad FROM costos_compra WHERE tenant_id=$1 AND producto_id=$2', tenantId, productoId);
      if (producto.ultima_compra_at != null || historial.cantidad > 0) throw new ConflictException('El costo lo fija la compra recibida; no admite inicialización');
      if (producto.costo_vigente != null && Number(producto.costo_vigente) !== 0) throw new ConflictException('El producto ya tiene costo vigente; no admite inicialización');
      const resultado = { id: productoId, costoVigente: costo, precioCosto: costo, version: producto.version + 1, solicitudId: dto.solicitudId };
      // Mantener coherencia del costo comercial. No escribir stock, fechas de compra, precios de venta ni aprobación.
      await tx.producto.update({ where: { id: productoId }, data: { costoVigente: costo, precioCosto: costo, version: { increment: 1 } } });
      await audit(tx, tenantId, userId, 'COSTO_INICIALIZAR', productoId, {
        solicitudId: dto.solicitudId, hash, motivo,
        anterior: { costoVigente: producto.costo_vigente == null ? null : Number(producto.costo_vigente), precioCosto: Number(producto.precio_costo), version: producto.version },
        resultado,
      });
      return resultado;
    });
  }
}
