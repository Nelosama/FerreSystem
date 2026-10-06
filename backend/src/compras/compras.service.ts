import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateCompraDto, CreatePagoProveedorDto } from './dto/compra.dto';

@Injectable()
export class ComprasService {
  constructor(private readonly prisma: PrismaService) {}

  async create(tenantId: string, dto: CreateCompraDto) {
    if (new Set(dto.detalles.map(item => item.productoId)).size !== dto.detalles.length) {
      throw new BadRequestException('Use una sola línea por producto en cada compra');
    }
    return this.prisma.$transaction(async tx => {
      const proveedor = await tx.proveedor.findFirst({ where: { id: dto.proveedorId, tenantId, activo: true }, select: { id: true } });
      if (!proveedor) throw new NotFoundException('Proveedor no encontrado');

      const detalles: Prisma.DetalleCompraCreateWithoutCompraInput[] = [];
      let monto = new Prisma.Decimal(0);
      for (const item of dto.detalles) {
        const producto = await tx.producto.findFirst({ where: { id: item.productoId, tenantId, activo: true }, select: { id: true } });
        if (!producto) throw new NotFoundException(`Producto ${item.productoId} no encontrado en este tenant`);
        const cantidad = new Prisma.Decimal(item.cantidad);
        const costoUnitario = new Prisma.Decimal(item.costoUnitario);
        const subtotal = cantidad.mul(costoUnitario).toDecimalPlaces(2);
        monto = monto.add(subtotal);
        detalles.push({ producto: { connect: { id: producto.id } }, cantidad, costoUnitario, subtotal });
      }

      const compra = await tx.compraProveedor.create({
        data: {
          tenantId,
          proveedor: { connect: { id: proveedor.id } },
          numeroFactura: dto.numeroFactura,
          fecha: new Date(dto.fecha),
          vencimiento: dto.vencimiento ? new Date(dto.vencimiento) : undefined,
          notas: dto.notas,
          monto,
          detalles: { create: detalles },
        },
        include: { proveedor: true, detalles: { include: { producto: { select: { id: true, nombre: true, codigo: true } } } } },
      });

      for (const item of dto.detalles) {
        await tx.producto.update({
          where: { id: item.productoId },
          data: { costoVigente: new Prisma.Decimal(item.costoUnitario), precioCosto: new Prisma.Decimal(item.costoUnitario), ultimaCompraAt: compra.fecha },
        });
      }
      return compra;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30000 });
  }

  findAll(tenantId: string) {
    return this.prisma.compraProveedor.findMany({ where: { tenantId }, include: { proveedor: true, detalles: true, pagos: true }, orderBy: { fecha: 'desc' } });
  }

  async findById(tenantId: string, id: string) {
    const compra = await this.prisma.compraProveedor.findFirst({ where: { id, tenantId }, include: { proveedor: true, detalles: { include: { producto: true } }, pagos: { orderBy: { fecha: 'desc' } } } });
    if (!compra) throw new NotFoundException('Compra no encontrada');
    return compra;
  }

  async addPayment(tenantId: string, id: string, dto: CreatePagoProveedorDto) {
    return this.prisma.$transaction(async tx => {
      const compra = await tx.compraProveedor.findFirst({ where: { id, tenantId }, include: { pagos: true } });
      if (!compra) throw new NotFoundException('Compra no encontrada');
      const pagado = compra.pagos.reduce((sum, pago) => sum.add(pago.monto), new Prisma.Decimal(0));
      const monto = new Prisma.Decimal(dto.monto);
      if (pagado.add(monto).greaterThan(compra.monto)) throw new BadRequestException('El pago supera el saldo pendiente');
      const nuevoPagado = pagado.add(monto);
      const estado = nuevoPagado.equals(compra.monto) ? 'PAGADA' : 'PARCIAL';
      await tx.pagoProveedor.create({ data: { compraId: compra.id, monto, fecha: dto.fecha ? new Date(dto.fecha) : new Date(), metodo: dto.metodo, notas: dto.notas } });
      return tx.compraProveedor.update({ where: { id: compra.id }, data: { estado }, include: { proveedor: true, pagos: { orderBy: { fecha: 'desc' } } } });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async productHistory(tenantId: string, productoId: string) {
    const producto = await this.prisma.producto.findFirst({ where: { id: productoId, tenantId }, select: { id: true } });
    if (!producto) throw new NotFoundException('Producto no encontrado');
    return this.prisma.detalleCompra.findMany({ where: { productoId, compra: { tenantId } }, include: { compra: { include: { proveedor: true } } }, orderBy: { compra: { fecha: 'desc' } } });
  }
}
