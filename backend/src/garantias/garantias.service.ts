import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { audit, authorizedActor, lockTenant } from '../operaciones/ledger';
import { diaCalendario, sumarDias } from '../common/zona-horaria';
import { ActualizarCoberturaDto, CrearCoberturaDto } from './dto/garantias.dto';

/** Fecha de calendario YYYY-MM-DD a Date UTC de medianoche (columna DATE). */
const aFechaColumna = (dia: string) => new Date(`${dia}T00:00:00.000Z`);
const aDia = (fecha: Date) => fecha.toISOString().slice(0, 10);

@Injectable()
export class GarantiasService {
  constructor(private prisma: PrismaService) {}

  /** Factura por número, con sus líneas y la cobertura de cada una. Solo lectura. */
  async buscarFactura(tenantId: string, numero: string) {
    const n = Number(numero);
    if (!Number.isSafeInteger(n) || n < 1) throw new BadRequestException('Número de factura inválido');
    const venta = await this.prisma.venta.findFirst({
      where: { tenantId, numeroVenta: n },
      include: {
        cliente: { select: { nombre: true } },
        detalles: { include: { producto: { select: { nombre: true, codigo: true } } }, orderBy: { id: 'asc' } },
      },
    });
    if (!venta) throw new NotFoundException('Factura no encontrada');

    const coberturas = await this.prisma.coberturaGarantia.findMany({
      where: { tenantId, detalleVentaId: { in: venta.detalles.map((d) => d.id) } },
    });
    const porDetalle = new Map(coberturas.map((c) => [c.detalleVentaId, c]));
    const hoy = diaCalendario(new Date());

    return {
      id: venta.id,
      numeroVenta: venta.numeroVenta,
      fechaVenta: diaCalendario(venta.createdAt),
      estado: venta.estado,
      cliente: venta.clienteNombre || venta.cliente?.nombre || 'Consumidor final',
      items: venta.detalles.map((d) => {
        const c = porDetalle.get(d.id);
        return {
          detalleVentaId: d.id,
          productoId: d.productoId,
          codigo: d.producto.codigo,
          nombre: d.producto.nombre,
          cantidad: Number(d.cantidad),
          cobertura: c ? this.formato(c, hoy) : null,
        };
      }),
    };
  }

  /** Crea la cobertura de una línea de factura. Solo administrador. Idempotente por solicitudId. */
  async crear(tenantId: string, usuarioId: string, dto: CrearCoberturaDto) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        await lockTenant(tx, tenantId);
        await authorizedActor(tx, tenantId, usuarioId, ['ADMIN']);

        // Reintento con la misma solicitud: devuelve el registro original sin duplicar nada.
        const previa = await tx.coberturaGarantia.findFirst({ where: { tenantId, solicitudId: dto.solicitudId } });
        if (previa) {
          if (previa.detalleVentaId !== dto.detalleVentaId || previa.diasGarantia !== dto.diasGarantia) {
            throw new ConflictException({ code: 'SOLICITUD_REUTILIZADA', message: 'Esa solicitud ya se usó para otra garantía' });
          }
          return this.formato(previa, diaCalendario(new Date()));
        }

        const venta = await tx.venta.findFirst({ where: { id: dto.ventaId, tenantId } });
        if (!venta) throw new NotFoundException('Factura no encontrada');
        if (venta.estado !== 'COMPLETADA') throw new BadRequestException('Solo se puede garantizar una factura completada');

        // La línea debe pertenecer a esta factura: el producto sale de la línea, nunca del cliente.
        const detalle = await tx.detalleVenta.findFirst({ where: { id: dto.detalleVentaId, ventaId: venta.id } });
        if (!detalle) throw new BadRequestException('El producto no pertenece a esta factura');

        const existente = await tx.coberturaGarantia.findFirst({ where: { tenantId, detalleVentaId: detalle.id } });
        if (existente) {
          throw new ConflictException({
            code: 'GARANTIA_DUPLICADA',
            message: 'Esta línea ya tiene una garantía registrada',
            coberturaId: existente.id,
          });
        }

        // Vencimiento desde la fecha de la factura en el día de negocio, no desde la fecha actual.
        const fechaVenta = diaCalendario(venta.createdAt);
        const fechaVencimiento = sumarDias(fechaVenta, dto.diasGarantia);
        const numeroSerie = dto.numeroSerie?.trim().toUpperCase() || null;

        const creada = await tx.coberturaGarantia.create({
          data: {
            tenantId,
            ventaId: venta.id,
            detalleVentaId: detalle.id,
            productoId: detalle.productoId,
            numeroSerie,
            fechaVenta: aFechaColumna(fechaVenta),
            diasGarantia: dto.diasGarantia,
            fechaVencimiento: aFechaColumna(fechaVencimiento),
            solicitudId: dto.solicitudId,
            creadoPor: usuarioId,
          },
        });
        await audit(tx, tenantId, usuarioId, 'GARANTIA_CREAR', creada.id, {
          ventaId: venta.id,
          detalleVentaId: detalle.id,
          productoId: detalle.productoId,
          diasGarantia: dto.diasGarantia,
          fechaVenta,
          fechaVencimiento,
        });
        return this.formato(creada, diaCalendario(new Date()));
      });
    } catch (error: any) {
      // Carrera entre dos solicitudes distintas para la misma línea: la base la rechaza.
      if (error?.code === 'P2002') {
        throw new ConflictException({ code: 'GARANTIA_DUPLICADA', message: 'Esta línea ya tiene una garantía registrada' });
      }
      throw error;
    }
  }

  /** Coberturas de la empresa, más recientes primero. Vigencia calculada con el día de negocio. */
  async listar(tenantId: string, q?: string) {
    const termino = q?.trim();
    const numero = termino && /^\d+$/.test(termino) ? Number(termino) : undefined;
    const filas = await this.prisma.coberturaGarantia.findMany({
      where: {
        tenantId,
        ...(termino
          ? {
              OR: [
                { numeroSerie: { contains: termino.toUpperCase() } },
                ...(numero !== undefined ? [{ ventaId: { in: await this.ventasPorNumero(tenantId, numero) } }] : []),
              ],
            }
          : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    const hoy = diaCalendario(new Date());
    const ventas = await this.prisma.venta.findMany({
      where: { tenantId, id: { in: filas.map((f) => f.ventaId) } },
      select: { id: true, numeroVenta: true, clienteNombre: true },
    });
    const productos = await this.prisma.producto.findMany({
      where: { tenantId, id: { in: filas.map((f) => f.productoId) } },
      select: { id: true, nombre: true, codigo: true },
    });
    const venta = new Map(ventas.map((v) => [v.id, v]));
    const producto = new Map(productos.map((p) => [p.id, p]));
    // Responsables por nombre (trazabilidad): solo usuarios de la misma empresa.
    const idsUsuario = [...new Set(filas.flatMap((f) => [f.creadoPor, f.actualizadoPor]).filter((x): x is string => !!x))];
    const usuarios = idsUsuario.length
      ? await this.prisma.usuario.findMany({ where: { tenantId, id: { in: idsUsuario } }, select: { id: true, nombre: true } })
      : [];
    const nombreDe = new Map(usuarios.map((u) => [u.id, u.nombre]));
    return filas.map((f) => ({
      ...this.formato(f, hoy),
      numeroVenta: venta.get(f.ventaId)?.numeroVenta ?? null,
      cliente: venta.get(f.ventaId)?.clienteNombre ?? null,
      producto: producto.get(f.productoId) ?? null,
      creadoPorNombre: nombreDe.get(f.creadoPor) ?? null,
      actualizadoPorNombre: f.actualizadoPor ? nombreDe.get(f.actualizadoPor) ?? null : null,
    }));
  }

  /** Cambia los días de una cobertura existente. Recalcula el vencimiento desde la fecha de venta. Solo administrador. */
  async actualizarDias(tenantId: string, usuarioId: string, id: string, dto: ActualizarCoberturaDto) {
    return this.prisma.$transaction(async (tx) => {
      await lockTenant(tx, tenantId);
      await authorizedActor(tx, tenantId, usuarioId, ['ADMIN']);
      const actual = await tx.coberturaGarantia.findFirst({ where: { id, tenantId } });
      if (!actual) throw new NotFoundException('Garantía no encontrada');

      const fechaVenta = aDia(actual.fechaVenta);
      const nuevoVencimiento = sumarDias(fechaVenta, dto.diasGarantia);
      const actualizada = await tx.coberturaGarantia.update({
        where: { id },
        data: {
          diasGarantia: dto.diasGarantia,
          fechaVencimiento: aFechaColumna(nuevoVencimiento),
          actualizadoPor: usuarioId,
        },
      });
      await audit(tx, tenantId, usuarioId, 'GARANTIA_EDITAR', id, {
        anterior: { diasGarantia: actual.diasGarantia, fechaVencimiento: aDia(actual.fechaVencimiento) },
        nuevo: { diasGarantia: dto.diasGarantia, fechaVencimiento: nuevoVencimiento },
      });
      return this.formato(actualizada, diaCalendario(new Date()));
    });
  }

  private async ventasPorNumero(tenantId: string, numero: number) {
    const ventas = await this.prisma.venta.findMany({ where: { tenantId, numeroVenta: numero }, select: { id: true } });
    return ventas.map((v) => v.id);
  }

  /** Formato de salida. El estado se calcula con el día de negocio; no se guarda. */
  private formato(c: { id: string; ventaId: string; detalleVentaId: string; productoId: string; numeroSerie: string | null; fechaVenta: Date; diasGarantia: number; fechaVencimiento: Date; creadoPor: string; actualizadoPor: string | null; updatedAt: Date }, hoy: string) {
    const vencimiento = aDia(c.fechaVencimiento);
    return {
      id: c.id,
      ventaId: c.ventaId,
      detalleVentaId: c.detalleVentaId,
      productoId: c.productoId,
      numeroSerie: c.numeroSerie,
      fechaInicio: aDia(c.fechaVenta),
      diasGarantia: c.diasGarantia,
      fechaVencimiento: vencimiento,
      estado: vencimiento >= hoy ? 'VIGENTE' : 'VENCIDA',
      creadoPor: c.creadoPor,
      actualizadoPor: c.actualizadoPor,
      actualizadoAt: c.updatedAt,
    };
  }
}
