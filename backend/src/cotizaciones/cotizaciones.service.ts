import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCotizacionDto } from './dto/create-cotizacion.dto';

@Injectable()
export class CotizacionesService {
  constructor(private prisma: PrismaService) {}

  async findAll(tenantId: string) {
    const cotizaciones = await this.prisma.cotizacion.findMany({
      where: { tenantId },
      include: {
        cliente: { select: { id: true, nombre: true, rtn: true, telefono: true, email: true, direccion: true } },
        usuario: { select: { id: true, nombre: true } },
        detalles: {
          include: {
            producto: { select: { id: true, nombre: true, codigo: true, stockActual: true, activo: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);

    return cotizaciones.map((c) => this.formatCotizacion(c, hoy));
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

    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    return this.formatCotizacion(c, hoy);
  }

  async create(tenantId: string, usuarioId: string, dto: CreateCotizacionDto) {
    if (!dto.detalles || dto.detalles.length === 0) {
      throw new BadRequestException('La cotización debe tener al menos un ítem');
    }

    let clienteNombre = dto.clienteNombre || '';
    let clienteRtn = dto.clienteRtn || null;
    let clienteTelefono = dto.clienteTelefono || null;
    let clienteEmail = dto.clienteEmail || null;
    let clienteDireccion = dto.clienteDireccion || null;

    if (dto.clienteId) {
      const cliente = await this.prisma.cliente.findFirst({
        where: { id: dto.clienteId, tenantId },
      });
      if (!cliente) {
        throw new NotFoundException('Cliente seleccionado no existe');
      }
      clienteNombre = cliente.nombre;
      clienteRtn = cliente.rtn || clienteRtn;
      clienteTelefono = cliente.telefono || clienteTelefono;
      clienteEmail = cliente.email || clienteEmail;
      clienteDireccion = cliente.direccion || clienteDireccion;
    }

    if (!clienteNombre.trim()) {
      clienteNombre = 'Consumidor Final';
    }

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

      // 2. Procesar ítems y realizar cálculos precisos
      const porcentajeIsv = dto.porcentajeIsv !== undefined ? dto.porcentajeIsv : 15.0;
      const parsedDetails = await this.processLineItems(tx, tenantId, dto.detalles, porcentajeIsv);

      const subtotalTotal = parsedDetails.reduce((sum, item) => sum + item.subtotal, 0);
      const descuentoLineas = parsedDetails.reduce((sum, item) => sum + item.descuentoMonto, 0);

      // Descuento General
      const descGenVal = dto.descuentoGeneral || 0;
      const tipoDescGen = dto.tipoDescuentoGeneral || 'MONTO';
      let descuentoGeneralMonto = 0;

      if (tipoDescGen === 'PORCENTAJE') {
        descuentoGeneralMonto = Math.round(subtotalTotal * (descGenVal / 100) * 100) / 100;
      } else {
        descuentoGeneralMonto = Math.min(subtotalTotal, descGenVal);
      }

      const descuentoTotal = descuentoLineas + descuentoGeneralMonto;
      const isvTotal = parsedDetails.reduce((sum, item) => sum + item.isv, 0);
      const total = Math.round((subtotalTotal - descuentoGeneralMonto + isvTotal) * 100) / 100;

      const diasVal = dto.diasValidez || 15;
      const fechaValidez = dto.fechaValidez
        ? new Date(dto.fechaValidez)
        : new Date(Date.now() + diasVal * 24 * 60 * 60 * 1000);

      const cotizacion = await tx.cotizacion.create({
        data: {
          tenantId,
          numeroCotizacion,
          clienteId: dto.clienteId || null,
          clienteNombre,
          clienteRtn,
          clienteTelefono,
          clienteEmail,
          clienteDireccion,
          usuarioId,
          subtotal: subtotalTotal,
          porcentajeIsv,
          isv: isvTotal,
          descuento: descuentoTotal,
          descuentoGeneral: descuentoGeneralMonto,
          tipoDescuentoGeneral: tipoDescGen,
          total,
          estado: 'BORRADOR',
          fechaValidez,
          diasValidez: diasVal,
          condicionesPago: dto.condicionesPago || 'CONTADO',
          notas: dto.notas || null,
          detalles: {
            create: parsedDetails.map((d) => ({
              productoId: d.productoId,
              codigoProducto: d.codigoProducto,
              descripcionProducto: d.descripcionProducto,
              unidadMedida: d.unidadMedida,
              usaMedida: d.usaMedida,
              cantidad: d.cantidad,
              medida: d.medida,
              totalMedida: d.totalMedida,
              precioLista: d.precioLista,
              precioUnitario: d.precioUnitario,
              descuento: d.descuentoMonto,
              tipoDescuento: d.tipoDescuento,
              exento: d.exento,
              subtotal: d.subtotal,
              isv: d.isv,
              totalLinea: d.totalLinea,
            })),
          },
        },
        include: {
          cliente: true,
          usuario: { select: { id: true, nombre: true } },
          detalles: { include: { producto: true } },
        },
      });

      const hoy = new Date();
      hoy.setHours(0, 0, 0, 0);
      return this.formatCotizacion(cotizacion, hoy);
    });
  }

  async update(tenantId: string, id: string, dto: CreateCotizacionDto) {
    const existing = await this.prisma.cotizacion.findFirst({
      where: { id, tenantId },
    });

    if (!existing) {
      throw new NotFoundException('Cotización no encontrada');
    }

    if (existing.estado === 'APROBADA' || existing.estado === 'CONVERTIDA') {
      throw new BadRequestException('No se puede modificar una cotización que ha sido aprobada o convertida a venta');
    }

    if (!dto.detalles || dto.detalles.length === 0) {
      throw new BadRequestException('La cotización debe tener al menos un ítem');
    }

    let clienteNombre = dto.clienteNombre || existing.clienteNombre;
    let clienteRtn = dto.clienteRtn !== undefined ? dto.clienteRtn : existing.clienteRtn;
    let clienteTelefono = dto.clienteTelefono !== undefined ? dto.clienteTelefono : existing.clienteTelefono;
    let clienteEmail = dto.clienteEmail !== undefined ? dto.clienteEmail : existing.clienteEmail;
    let clienteDireccion = dto.clienteDireccion !== undefined ? dto.clienteDireccion : existing.clienteDireccion;

    if (dto.clienteId) {
      const cliente = await this.prisma.cliente.findFirst({
        where: { id: dto.clienteId, tenantId },
      });
      if (cliente) {
        clienteNombre = cliente.nombre;
        clienteRtn = cliente.rtn || clienteRtn;
        clienteTelefono = cliente.telefono || clienteTelefono;
        clienteEmail = cliente.email || clienteEmail;
        clienteDireccion = cliente.direccion || clienteDireccion;
      }
    }

    return this.prisma.$transaction(async (tx) => {
      // Eliminar detalles previos
      await tx.detalleCotizacion.deleteMany({ where: { cotizacionId: id } });

      const porcentajeIsv = dto.porcentajeIsv !== undefined ? dto.porcentajeIsv : Number(existing.porcentajeIsv);
      const parsedDetails = await this.processLineItems(tx, tenantId, dto.detalles, porcentajeIsv);

      const subtotalTotal = parsedDetails.reduce((sum, item) => sum + item.subtotal, 0);
      const descuentoLineas = parsedDetails.reduce((sum, item) => sum + item.descuentoMonto, 0);

      const descGenVal = dto.descuentoGeneral !== undefined ? dto.descuentoGeneral : Number(existing.descuentoGeneral);
      const tipoDescGen = dto.tipoDescuentoGeneral || existing.tipoDescuentoGeneral;
      let descuentoGeneralMonto = 0;

      if (tipoDescGen === 'PORCENTAJE') {
        descuentoGeneralMonto = Math.round(subtotalTotal * (descGenVal / 100) * 100) / 100;
      } else {
        descuentoGeneralMonto = Math.min(subtotalTotal, descGenVal);
      }

      const descuentoTotal = descuentoLineas + descuentoGeneralMonto;
      const isvTotal = parsedDetails.reduce((sum, item) => sum + item.isv, 0);
      const total = Math.round((subtotalTotal - descuentoGeneralMonto + isvTotal) * 100) / 100;

      const diasVal = dto.diasValidez || existing.diasValidez;
      const fechaValidez = dto.fechaValidez
        ? new Date(dto.fechaValidez)
        : new Date(Date.now() + diasVal * 24 * 60 * 60 * 1000);

      const updated = await tx.cotizacion.update({
        where: { id },
        data: {
          clienteId: dto.clienteId || null,
          clienteNombre,
          clienteRtn,
          clienteTelefono,
          clienteEmail,
          clienteDireccion,
          subtotal: subtotalTotal,
          porcentajeIsv,
          isv: isvTotal,
          descuento: descuentoTotal,
          descuentoGeneral: descuentoGeneralMonto,
          tipoDescuentoGeneral: tipoDescGen,
          total,
          fechaValidez,
          diasValidez: diasVal,
          condicionesPago: dto.condicionesPago || existing.condicionesPago,
          notas: dto.notas !== undefined ? dto.notas : existing.notas,
          detalles: {
            create: parsedDetails.map((d) => ({
              productoId: d.productoId,
              codigoProducto: d.codigoProducto,
              descripcionProducto: d.descripcionProducto,
              unidadMedida: d.unidadMedida,
              usaMedida: d.usaMedida,
              cantidad: d.cantidad,
              medida: d.medida,
              totalMedida: d.totalMedida,
              precioLista: d.precioLista,
              precioUnitario: d.precioUnitario,
              descuento: d.descuentoMonto,
              tipoDescuento: d.tipoDescuento,
              exento: d.exento,
              subtotal: d.subtotal,
              isv: d.isv,
              totalLinea: d.totalLinea,
            })),
          },
        },
        include: {
          cliente: true,
          usuario: { select: { id: true, nombre: true } },
          detalles: { include: { producto: true } },
        },
      });

      const hoy = new Date();
      hoy.setHours(0, 0, 0, 0);
      return this.formatCotizacion(updated, hoy);
    });
  }

  async duplicate(tenantId: string, usuarioId: string, id: string) {
    const original = await this.prisma.cotizacion.findFirst({
      where: { id, tenantId },
      include: { detalles: true },
    });

    if (!original) {
      throw new NotFoundException('Cotización original no encontrada');
    }

    return this.prisma.$transaction(async (tx) => {
      const result = await tx.$queryRaw<[{ ultimo_numero: number }]>`
        INSERT INTO "secuencias_tenant" ("id", "tenant_id", "tipo", "ultimo_numero")
        VALUES (gen_random_uuid(), ${tenantId}, 'COTIZACION'::"TipoSecuencia", 1)
        ON CONFLICT ("tenant_id", "tipo")
        DO UPDATE SET "ultimo_numero" = "secuencias_tenant"."ultimo_numero" + 1
        RETURNING "ultimo_numero"
      `;

      const numeroCotizacion = result[0].ultimo_numero;
      const fechaValidez = new Date(Date.now() + original.diasValidez * 24 * 60 * 60 * 1000);

      const duplicada = await tx.cotizacion.create({
        data: {
          tenantId,
          numeroCotizacion,
          clienteId: original.clienteId,
          clienteNombre: original.clienteNombre,
          clienteRtn: original.clienteRtn,
          clienteTelefono: original.clienteTelefono,
          clienteEmail: original.clienteEmail,
          clienteDireccion: original.clienteDireccion,
          usuarioId,
          subtotal: original.subtotal,
          porcentajeIsv: original.porcentajeIsv,
          isv: original.isv,
          descuento: original.descuento,
          descuentoGeneral: original.descuentoGeneral,
          tipoDescuentoGeneral: original.tipoDescuentoGeneral,
          total: original.total,
          estado: 'BORRADOR',
          fechaValidez,
          diasValidez: original.diasValidez,
          condicionesPago: original.condicionesPago,
          notas: original.notas ? `Copia de COT-${original.numeroCotizacion.toString().padStart(4, '0')}. ${original.notas}` : `Copia de COT-${original.numeroCotizacion.toString().padStart(4, '0')}`,
          detalles: {
            create: original.detalles.map((d) => ({
              productoId: d.productoId,
              codigoProducto: d.codigoProducto,
              descripcionProducto: d.descripcionProducto,
              unidadMedida: d.unidadMedida,
              usaMedida: d.usaMedida,
              cantidad: d.cantidad,
              medida: d.medida,
              totalMedida: d.totalMedida,
              precioLista: d.precioLista,
              precioUnitario: d.precioUnitario,
              descuento: d.descuento,
              tipoDescuento: d.tipoDescuento,
              exento: d.exento,
              subtotal: d.subtotal,
              isv: d.isv,
              totalLinea: d.totalLinea,
            })),
          },
        },
        include: {
          cliente: true,
          usuario: { select: { id: true, nombre: true } },
          detalles: { include: { producto: true } },
        },
      });

      const hoy = new Date();
      hoy.setHours(0, 0, 0, 0);
      return this.formatCotizacion(duplicada, hoy);
    });
  }

  async updateEstado(tenantId: string, id: string, estado: any) {
    const c = await this.prisma.cotizacion.findFirst({
      where: { id, tenantId },
    });

    if (!c) {
      throw new NotFoundException('Cotización no encontrada');
    }

    const updated = await this.prisma.cotizacion.update({
      where: { id },
      data: { estado },
      include: {
        cliente: true,
        usuario: { select: { id: true, nombre: true } },
        detalles: { include: { producto: true } },
      },
    });

    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    return this.formatCotizacion(updated, hoy);
  }

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

      // Verificar y descontar stock por la cantidad solicitada
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
          notas: `Convertida de Cotización #COT-${cotizacion.numeroCotizacion.toString().padStart(4, '0')}`,
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
        mensaje: `Cotización #COT-${cotizacion.numeroCotizacion.toString().padStart(4, '0')} convertida con éxito a Venta #${venta.numeroVenta}`,
      };
    });
  }

  // --- Helper Methods ---

  private async processLineItems(
    tx: any,
    tenantId: string,
    items: any[],
    porcentajeIsv: number,
  ) {
    const result = [];

    for (const item of items) {
      const prod = await tx.producto.findFirst({
        where: { id: item.productoId, tenantId, activo: true },
      });

      if (!prod) {
        throw new NotFoundException(`Producto con ID ${item.productoId} no encontrado o inactivo`);
      }

      const usaMedida = Boolean(prod.usaMedida);
      const cantidad = Number(item.cantidad);
      const medida = usaMedida ? Number(item.medida || 1) : 1;
      const totalMedida = Math.round(cantidad * medida * 100) / 100;

      const precioLista = Number(prod.precioVenta);
      const precioUnitario = item.precioUnitario !== undefined ? Number(item.precioUnitario) : precioLista;

      const baseLineTotal = Math.round(totalMedida * precioUnitario * 100) / 100;

      const tipoDescuento = item.tipoDescuento || 'MONTO';
      let descuentoMonto = 0;

      if (tipoDescuento === 'PORCENTAJE') {
        descuentoMonto = Math.round(baseLineTotal * (Number(item.descuento || 0) / 100) * 100) / 100;
      } else {
        descuentoMonto = Math.min(baseLineTotal, Number(item.descuento || 0));
      }

      const subtotal = Math.max(0, baseLineTotal - descuentoMonto);
      const exento = Boolean(item.exento);
      const isv = exento ? 0 : Math.round(subtotal * (porcentajeIsv / 100) * 100) / 100;
      const totalLinea = Math.round((subtotal + isv) * 100) / 100;

      result.push({
        productoId: prod.id,
        codigoProducto: prod.codigo,
        descripcionProducto: prod.nombre,
        unidadMedida: prod.unidadMedida,
        usaMedida,
        cantidad,
        medida,
        totalMedida,
        precioLista,
        precioUnitario,
        descuentoMonto,
        tipoDescuento,
        exento,
        subtotal,
        isv,
        totalLinea,
      });
    }

    return result;
  }

  private formatCotizacion(c: any, hoy: Date) {
    const fechaVal = new Date(c.fechaValidez);
    fechaVal.setHours(0, 0, 0, 0);
    const diferenciaDias = Math.ceil((fechaVal.getTime() - hoy.getTime()) / (1000 * 60 * 60 * 24));

    return {
      ...c,
      subtotal: Number(c.subtotal),
      porcentajeIsv: Number(c.porcentajeIsv),
      isv: Number(c.isv),
      descuento: Number(c.descuento),
      descuentoGeneral: Number(c.descuentoGeneral),
      total: Number(c.total),
      porVencerHoy: diferenciaDias === 0 && c.estado !== 'CONVERTIDA' && c.estado !== 'RECHAZADA',
      vencida: diferenciaDias < 0 && c.estado !== 'CONVERTIDA',
      clienteNombre: c.clienteNombre || c.cliente?.nombre || 'Consumidor Final',
      clienteRtn: c.clienteRtn || c.cliente?.rtn || null,
      clienteTelefono: c.clienteTelefono || c.cliente?.telefono || null,
      clienteEmail: c.clienteEmail || c.cliente?.email || null,
      clienteDireccion: c.clienteDireccion || c.cliente?.direccion || null,
      usuarioNombre: c.usuario?.nombre || 'Usuario Sistema',
      detalles: (c.detalles || []).map((d: any) => ({
        id: d.id,
        productoId: d.productoId,
        productoNombre: d.descripcionProducto || d.producto?.nombre || '',
        productoCodigo: d.codigoProducto || d.producto?.codigo || '',
        unidadMedida: d.unidadMedida || d.producto?.unidadMedida || 'UNIDAD',
        usaMedida: Boolean(d.usaMedida),
        cantidad: Number(d.cantidad),
        medida: Number(d.medida),
        totalMedida: Number(d.totalMedida),
        precioLista: Number(d.precioLista),
        precioUnitario: Number(d.precioUnitario),
        precioModificado: Number(d.precioUnitario) !== Number(d.precioLista),
        descuento: Number(d.descuento),
        tipoDescuento: d.tipoDescuento || 'MONTO',
        exento: Boolean(d.exento),
        subtotal: Number(d.subtotal),
        isv: Number(d.isv),
        totalLinea: Number(d.totalLinea || d.subtotal + d.isv),
      })),
    };
  }
}
