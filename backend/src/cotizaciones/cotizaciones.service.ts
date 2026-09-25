import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CotizacionesService {
  constructor(private prisma: PrismaService) {}

  async findAll(tenantId: string) {
    const cotizaciones = await this.prisma.cotizacion.findMany({
      where: { tenantId },
      include: {
        cliente: { select: { id: true, nombre: true, rtn: true, telefono: true } },
        usuario: { select: { id: true, nombre: true } },
        detalles: {
          include: {
            producto: { select: { id: true, nombre: true, codigo: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);

    return cotizaciones.map((c) => {
      const fechaVal = new Date(c.fechaValidez);
      fechaVal.setHours(0, 0, 0, 0);
      const diferenciaDias = Math.ceil((fechaVal.getTime() - hoy.getTime()) / (1000 * 60 * 60 * 24));

      return {
        ...c,
        subtotal: Number(c.subtotal),
        isv: Number(c.isv),
        descuento: Number(c.descuento),
        total: Number(c.total),
        porVencerHoy: diferenciaDias === 0 && c.estado !== 'CONVERTIDA' && c.estado !== 'RECHAZADA',
        vencida: diferenciaDias < 0 && c.estado !== 'CONVERTIDA',
        detalles: c.detalles.map((d) => ({
          id: d.id,
          productoId: d.productoId,
          productoNombre: d.producto.nombre,
          productoCodigo: d.producto.codigo,
          cantidad: Number(d.cantidad),
          precioUnitario: Number(d.precioUnitario),
          subtotal: Number(d.subtotal),
        })),
      };
    });
  }

  async findById(tenantId: string, id: string) {
    const c = await this.prisma.cotizacion.findFirst({
      where: { id, tenantId },
      include: {
        cliente: true,
        usuario: { select: { id: true, nombre: true, email: true } },
        tenant: true,
        detalles: {
          include: { producto: true },
        },
      },
    });

    if (!c) {
      throw new NotFoundException('Cotización no encontrada');
    }

    return {
      ...c,
      subtotal: Number(c.subtotal),
      isv: Number(c.isv),
      descuento: Number(c.descuento),
      total: Number(c.total),
      detalles: c.detalles.map((d) => ({
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
      clienteId: string;
      fechaValidez?: string;
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
      throw new BadRequestException('La cotización debe tener al menos un ítem');
    }

    const cliente = await this.prisma.cliente.findFirst({
      where: { id: dto.clienteId, tenantId },
    });
    if (!cliente) {
      throw new NotFoundException('Cliente seleccionado no existe');
    }

    const descuento = dto.descuento || 0;

    return this.prisma.$transaction(async (tx) => {
      // 1. Obtener siguiente número correlativo atómicamente por tenant
      const result = await tx.$queryRaw<[{ ultimo_numero: number }]>`
        INSERT INTO "secuencias_tenant" ("id", "tenant_id", "tipo", "ultimo_numero")
        VALUES (gen_random_uuid(), ${tenantId}, 'COTIZACION'::"TipoSecuencia", 1)
        ON CONFLICT ("tenant_id", "tipo")
        DO UPDATE SET "ultimo_numero" = "secuencias_tenant"."ultimo_numero" + 1
        RETURNING "ultimo_numero"
      `;

      const numeroCotizacion = result[0].ultimo_numero;

      // 2. Procesar ítems y calcular precios
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
          throw new NotFoundException(`Producto ${item.productoId} no encontrado`);
        }

        const precioUnitario = item.precioUnitario !== undefined ? item.precioUnitario : Number(prod.precioVenta);
        const itemSubtotal = Math.round(precioUnitario * item.cantidad * 100) / 100;
        subtotalTotal += itemSubtotal;

        detallesParaCrear.push({
          productoId: prod.id,
          cantidad: item.cantidad,
          precioUnitario,
          subtotal: itemSubtotal,
        });
      }

      // 3. Cálculos fiscales ISV 15%
      const baseGravable = Math.max(0, subtotalTotal - descuento);
      const isv = Math.round(baseGravable * 0.15 * 100) / 100;
      const total = Math.round((baseGravable + isv) * 100) / 100;

      // Fecha de validez por defecto (15 días si no se especifica)
      const fechaValidez = dto.fechaValidez
        ? new Date(dto.fechaValidez)
        : new Date(Date.now() + 15 * 24 * 60 * 60 * 1000);

      const cotizacion = await tx.cotizacion.create({
        data: {
          tenantId,
          numeroCotizacion,
          clienteId: cliente.id,
          usuarioId,
          subtotal: subtotalTotal,
          isv,
          descuento,
          total,
          estado: 'BORRADOR',
          fechaValidez,
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
          detalles: { include: { producto: true } },
        },
      });

      return {
        ...cotizacion,
        subtotal: Number(cotizacion.subtotal),
        isv: Number(cotizacion.isv),
        descuento: Number(cotizacion.descuento),
        total: Number(cotizacion.total),
      };
    });
  }

  async updateEstado(tenantId: string, id: string, estado: any) {
    const c = await this.prisma.cotizacion.findFirst({
      where: { id, tenantId },
    });

    if (!c) {
      throw new NotFoundException('Cotización no encontrada');
    }

    return this.prisma.cotizacion.update({
      where: { id },
      data: { estado },
    });
  }

  /**
   * Conversión directa de Cotización a Venta con un solo clic:
   * - Descuenta stock de inventario
   * - Genera Venta con número correlativo atómico
   * - Marca cotización como 'CONVERTIDA' y la asocia a la venta
   */
  async convertirAVenta(
    tenantId: string,
    usuarioId: string,
    cotizacionId: string,
    metodoPago: any = 'EFECTIVO',
  ) {
    return this.prisma.$transaction(async (tx) => {
      const cotizacion = await tx.cotizacion.findFirst({
        where: { id: cotizacionId, tenantId },
        include: { detalles: { include: { producto: true } } },
      });

      if (!cotizacion) {
        throw new NotFoundException('Cotización no encontrada');
      }

      if (cotizacion.estado === 'CONVERTIDA') {
        throw new BadRequestException('Esta cotización ya fue convertida previamente a una venta');
      }

      // Verificar y descontar stock
      for (const d of cotizacion.detalles) {
        if (d.producto.stockActual < Number(d.cantidad)) {
          throw new BadRequestException(
            `Stock insuficiente para "${d.producto.nombre}". Disponible: ${d.producto.stockActual}, Requerido: ${d.cantidad}`,
          );
        }

        await tx.producto.update({
          where: { id: d.producto.id },
          data: { stockActual: { decrement: Math.round(Number(d.cantidad)) } },
        });
      }

      // Obtener secuencial de venta
      const seqResult = await tx.$queryRaw<[{ ultimo_numero: number }]>`
        INSERT INTO "secuencias_tenant" ("id", "tenant_id", "tipo", "ultimo_numero")
        VALUES (gen_random_uuid(), ${tenantId}, 'VENTA'::"TipoSecuencia", 1)
        ON CONFLICT ("tenant_id", "tipo")
        DO UPDATE SET "ultimo_numero" = "secuencias_tenant"."ultimo_numero" + 1
        RETURNING "ultimo_numero"
      `;

      const numeroVenta = seqResult[0].ultimo_numero;

      // Crear la venta
      const venta = await tx.venta.create({
        data: {
          tenantId,
          numeroVenta,
          clienteId: cotizacion.clienteId,
          usuarioId,
          subtotal: cotizacion.subtotal,
          isv: cotizacion.isv,
          descuento: cotizacion.descuento,
          total: cotizacion.total,
          metodoPago,
          estado: 'COMPLETADA',
          notas: `Convertida de Cotización #${cotizacion.numeroCotizacion}`,
          detalles: {
            create: cotizacion.detalles.map((d) => ({
              productoId: d.productoId,
              cantidad: d.cantidad,
              precioUnitario: d.precioUnitario,
              subtotal: d.subtotal,
            })),
          },
        },
      });

      // Actualizar estado de la cotización
      await tx.cotizacion.update({
        where: { id: cotizacion.id },
        data: {
          estado: 'CONVERTIDA',
          ventaId: venta.id,
        },
      });

      return {
        ventaId: venta.id,
        numeroVenta: venta.numeroVenta,
        total: Number(venta.total),
        mensaje: `Cotización #${cotizacion.numeroCotizacion} convertida con éxito a Venta #${venta.numeroVenta}`,
      };
    });
  }
}
