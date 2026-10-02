import { Injectable, BadRequestException, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class VentasService {
  constructor(private prisma: PrismaService) {}

  async findAll(tenantId: string, limit = 50) {
    const ventas = await this.prisma.venta.findMany({
      where: { tenantId },
      include: {
        cliente: { select: { id: true, nombre: true, rtn: true } },
        usuario: { select: { id: true, nombre: true } },
        detalles: {
          include: {
            producto: { select: { id: true, nombre: true, codigo: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    return ventas.map((v) => ({
      ...v,
      subtotal: Number(v.subtotal),
      isv: Number(v.isv),
      descuento: Number(v.descuento),
      total: Number(v.total),
      detalles: v.detalles.map((d) => ({
        id: d.id,
        productoId: d.productoId,
        productoNombre: d.producto.nombre,
        productoCodigo: d.producto.codigo,
        cantidad: Number(d.cantidad),
        precioUnitario: Number(d.precioUnitario),
        subtotal: Number(d.subtotal),
      })),
    }));
  }

  async findById(tenantId: string, id: string) {
    const v = await this.prisma.venta.findFirst({
      where: { id, tenantId },
      include: {
        cliente: true,
        usuario: { select: { id: true, nombre: true, email: true } },
        tenant: true,
        detalles: {
          include: {
            producto: true,
          },
        },
      },
    });

    if (!v) {
      throw new NotFoundException('Venta no encontrada');
    }

    return {
      ...v,
      subtotal: Number(v.subtotal),
      isv: Number(v.isv),
      descuento: Number(v.descuento),
      total: Number(v.total),
      detalles: v.detalles.map((d) => ({
        id: d.id,
        productoId: d.productoId,
        productoNombre: d.producto.nombre,
        productoCodigo: d.producto.codigo,
        cantidad: Number(d.cantidad),
        precioUnitario: Number(d.precioUnitario),
        subtotal: Number(d.subtotal),
      })),
    };
  }

  async create(
    tenantId: string,
    usuarioId: string,
    dto: {
      solicitudId?: string;
      clienteId?: string;
      metodoPago?: any;
      descuento?: number;
      notas?: string;
      detalles: {
        productoId: string;
        cantidad: number;
        precioUnitario?: number;
      }[];
    },
  ) {
    if (!dto.detalles || dto.detalles.length === 0) {
      throw new BadRequestException('La venta debe incluir al menos un producto');
    }

    const descuento = dto.descuento || 0;

    // Transacción atómica completa: número correlativo, descuento de inventario y guardado
    return this.prisma.$transaction(async (tx) => {
      // Un reintento conserva el ID de la venta; el bloqueo dura hasta commit/rollback.
      if (dto.solicitudId) {
        await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtextextended(${'VENTA:' + dto.solicitudId}, 0))`;
        const anterior = await tx.venta.findUnique({
          where: { id: dto.solicitudId },
          include: { cliente: true, detalles: { include: { producto: true } } },
        });
        if (anterior) {
          const restantes = [...anterior.detalles];
          const mismosDetalles = anterior.detalles.length === dto.detalles.length &&
            dto.detalles.every((item) => {
              const index = restantes.findIndex((d) =>
                d.productoId === item.productoId && Number(d.cantidad) === item.cantidad &&
                (item.precioUnitario === undefined || Number(d.precioUnitario) === item.precioUnitario));
              if (index < 0) return false;
              restantes.splice(index, 1);
              return true;
            });
          if (anterior.tenantId !== tenantId || anterior.usuarioId !== usuarioId ||
              anterior.clienteId !== (dto.clienteId || null) ||
              anterior.metodoPago !== (dto.metodoPago || 'EFECTIVO') ||
              Number(anterior.descuento) !== descuento || anterior.notas !== (dto.notas || null) ||
              !mismosDetalles) {
            throw new ConflictException('La solicitud ya fue utilizada para otra venta');
          }
          return this.formatVentaCreada(anterior);
        }
      }

      if (dto.clienteId) {
        const cliente = await tx.cliente.findFirst({ where: { id: dto.clienteId, tenantId } });
        if (!cliente) throw new NotFoundException('Cliente seleccionado no existe');
      }

      // 1. Obtener siguiente número secuencial por tenant con bloqueo atómico
      const result = await tx.$queryRaw<[{ ultimo_numero: number }]>`
        INSERT INTO "secuencias_tenant" ("id", "tenant_id", "tipo", "ultimo_numero")
        VALUES (gen_random_uuid(), ${tenantId}, 'VENTA'::"TipoSecuencia", 1)
        ON CONFLICT ("tenant_id", "tipo")
        DO UPDATE SET "ultimo_numero" = "secuencias_tenant"."ultimo_numero" + 1
        RETURNING "ultimo_numero"
      `;

      const numeroVenta = result[0].ultimo_numero;

      // 2. Procesar ítems y descontar stock
      let subtotalTotal = 0;
      const detallesParaCrear: {
        productoId: string;
        cantidad: number;
        precioUnitario: number;
        subtotal: number;
      }[] = [];

      for (const item of dto.detalles) {
        const prod = await tx.producto.findFirst({
          where: { id: item.productoId, tenantId, activo: true },
        });

        if (!prod) {
          throw new NotFoundException(`Producto con ID ${item.productoId} no encontrado o inactivo`);
        }

        const stockDisponible = Number(prod.stockActual);
        if (stockDisponible < item.cantidad) {
          throw new BadRequestException(
            `Stock insuficiente para "${prod.nombre}". Disponible: ${stockDisponible}, Solicitado: ${item.cantidad}`,
          );
        }

        const precioUnitario = item.precioUnitario !== undefined ? item.precioUnitario : Number(prod.precioVenta);
        const itemSubtotal = Math.round(precioUnitario * item.cantidad * 100) / 100;
        subtotalTotal += itemSubtotal;

        // Descontar inventario con precisión decimal exacta
        const descontado = await tx.producto.updateMany({
          where: { id: prod.id, tenantId, activo: true, stockActual: { gte: item.cantidad } },
          data: { stockActual: { decrement: item.cantidad } },
        });
        if (descontado.count !== 1) {
          throw new BadRequestException(`Stock insuficiente para "${prod.nombre}" o producto inactivo`);
        }

        detallesParaCrear.push({
          productoId: prod.id,
          cantidad: item.cantidad,
          precioUnitario,
          subtotal: itemSubtotal,
        });
      }

      // 3. Cálculos fiscales de Honduras: ISV 15%
      const baseGravable = Math.max(0, subtotalTotal - descuento);
      const isv = Math.round(baseGravable * 0.15 * 100) / 100;
      const total = Math.round((baseGravable + isv) * 100) / 100;

      // 4. Crear la venta en base de datos
      const venta = await tx.venta.create({
        data: {
          ...(dto.solicitudId && { id: dto.solicitudId }),
          tenantId,
          numeroVenta,
          clienteId: dto.clienteId || null,
          usuarioId,
          subtotal: subtotalTotal,
          isv,
          descuento,
          total,
          metodoPago: dto.metodoPago || 'EFECTIVO',
          estado: 'COMPLETADA',
          notas: dto.notas || null,
          detalles: {
            create: detallesParaCrear.map((d) => ({
              productoId: d.productoId,
              cantidad: d.cantidad,
              precioUnitario: d.precioUnitario,
              subtotal: d.subtotal,
            })),
          },
        },
        include: {
          cliente: true,
          detalles: {
            include: { producto: true },
          },
        },
      });

      return this.formatVentaCreada(venta);
    });
  }
  private formatVentaCreada(venta: any) {
    return {
      ...venta,
      subtotal: Number(venta.subtotal),
      isv: Number(venta.isv),
      descuento: Number(venta.descuento),
      total: Number(venta.total),
      detalles: venta.detalles.map((d) => ({
        id: d.id,
        productoId: d.productoId,
        productoNombre: d.producto.nombre,
        productoCodigo: d.producto.codigo,
        cantidad: Number(d.cantidad),
        precioUnitario: Number(d.precioUnitario),
        subtotal: Number(d.subtotal),
      })),
    };
  }
}
