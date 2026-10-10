import { account, authorizedActor, audit, cashMovement, id, lockTenant, money, openCash, query, validateDiscount } from '../operaciones/ledger';
import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCotizacionDto } from './dto/create-cotizacion.dto';
import { diaCalendario, inicioDiaEnZona } from '../common/zona-horaria';
import { normalizarAutorizacion, registrarAprobacion } from '../operaciones/aprobaciones-bancarias';

/** Fecha de solo día (YYYY-MM-DD) se guarda como inicio del día en la zona del negocio. */
const SOLO_DIA = /^\d{4}-\d{2}-\d{2}$/;

function fechaValidezDesdeDto(valor: string): Date {
  return SOLO_DIA.test(valor) ? inicioDiaEnZona(valor) : new Date(valor);
}

/** Días calendario de `hasta` menos `desde` (ambos YYYY-MM-DD). */
function diasEntre(desde: string, hasta: string): number {
  return Math.round((Date.parse(`${hasta}T00:00:00Z`) - Date.parse(`${desde}T00:00:00Z`)) / (24 * 60 * 60 * 1000));
}

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
        if (descGenVal > 100) throw new BadRequestException('El descuento porcentual no puede superar 100%');
        descuentoGeneralMonto = Math.round(subtotalTotal * (descGenVal / 100) * 100) / 100;
      } else {
        descuentoGeneralMonto = Math.min(subtotalTotal, descGenVal);
      }

      const descuentoTotal = descuentoLineas + descuentoGeneralMonto;
      const isvTotal = money(parsedDetails.reduce((sum, item) => sum + item.isv, 0) * (subtotalTotal > 0 ? 1 - descuentoGeneralMonto/subtotalTotal : 0));
      const total = Math.round((subtotalTotal - descuentoGeneralMonto + isvTotal) * 100) / 100;

      const diasVal = dto.diasValidez || 15;
      const fechaValidez = dto.fechaValidez
        ? fechaValidezDesdeDto(dto.fechaValidez)
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
            return this.formatCotizacion(cotizacion, hoy);
    });
  }

  async update(tenantId: string, id: string, dto: CreateCotizacionDto) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM cotizaciones WHERE id = ${id} AND tenant_id = ${tenantId} FOR UPDATE`;
      const existing = await tx.cotizacion.findFirst({
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
        const cliente = await tx.cliente.findFirst({
          where: { id: dto.clienteId, tenantId },
        });
        if (!cliente) throw new NotFoundException('Cliente seleccionado no existe');
        if (cliente) {
          clienteNombre = cliente.nombre;
          clienteRtn = cliente.rtn || clienteRtn;
          clienteTelefono = cliente.telefono || clienteTelefono;
          clienteEmail = cliente.email || clienteEmail;
          clienteDireccion = cliente.direccion || clienteDireccion;
        }
      }

      // Eliminar detalles previos
      await tx.detalleCotizacion.deleteMany({ where: { cotizacionId: id } });

      const porcentajeIsv = dto.porcentajeIsv !== undefined ? dto.porcentajeIsv : Number(existing.porcentajeIsv);
      const parsedDetails = await this.processLineItems(tx, tenantId, dto.detalles, porcentajeIsv);

      const subtotalTotal = parsedDetails.reduce((sum, item) => sum + item.subtotal, 0);
      const descuentoLineas = parsedDetails.reduce((sum, item) => sum + item.descuentoMonto, 0);

      const descGenVal = dto.descuentoGeneral !== undefined ? dto.descuentoGeneral
        : existing.tipoDescuentoGeneral === 'PORCENTAJE'
          ? (Number(existing.subtotal) > 0 ? Number(existing.descuentoGeneral) / Number(existing.subtotal) * 100 : 0)
          : Number(existing.descuentoGeneral);
      const tipoDescGen = dto.tipoDescuentoGeneral || existing.tipoDescuentoGeneral;
      let descuentoGeneralMonto = 0;

      if (tipoDescGen === 'PORCENTAJE') {
        if (descGenVal > 100) throw new BadRequestException('El descuento porcentual no puede superar 100%');
        descuentoGeneralMonto = Math.round(subtotalTotal * (descGenVal / 100) * 100) / 100;
      } else {
        descuentoGeneralMonto = Math.min(subtotalTotal, descGenVal);
      }

      const descuentoTotal = descuentoLineas + descuentoGeneralMonto;
      const isvTotal = money(parsedDetails.reduce((sum, item) => sum + item.isv, 0) * (subtotalTotal > 0 ? 1 - descuentoGeneralMonto/subtotalTotal : 0));
      const total = Math.round((subtotalTotal - descuentoGeneralMonto + isvTotal) * 100) / 100;

      const diasVal = dto.diasValidez || existing.diasValidez;
      const fechaValidez = dto.fechaValidez
        ? fechaValidezDesdeDto(dto.fechaValidez)
        : new Date(Date.now() + diasVal * 24 * 60 * 60 * 1000);

      const updated = await tx.cotizacion.update({
        where: { id },
        data: {
          clienteId: dto.clienteId !== undefined ? dto.clienteId || null : existing.clienteId,
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
            return this.formatCotizacion(duplicada, hoy);
    });
  }

  async updateEstado(tenantId: string, id: string, estado: any) {
    if (!['BORRADOR', 'ENVIADA', 'APROBADA', 'RECHAZADA', 'VENCIDA'].includes(estado)) {
      throw new BadRequestException('Estado de cotización no permitido; use convertir para generar una venta');
    }
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM cotizaciones WHERE id = ${id} AND tenant_id = ${tenantId} FOR UPDATE`;
      const c = await tx.cotizacion.findFirst({
        where: { id, tenantId },
      });

      if (!c) {
        throw new NotFoundException('Cotización no encontrada');
      }

      if (c.estado === 'CONVERTIDA' || c.ventaId) {
        throw new BadRequestException('No se puede cambiar el estado de una cotización convertida');
      }
      const updated = await tx.cotizacion.update({
        where: { id },
        data: { estado },
        include: {
          cliente: true,
          usuario: { select: { id: true, nombre: true } },
          detalles: { include: { producto: true } },
        },
      });

      const hoy = new Date();
            return this.formatCotizacion(updated, hoy);
    });
  }

  async convertirAVenta(
    tenantId: string,
    usuarioId: string,
    cotizacionId: string,
    metodoPago: any = 'EFECTIVO',
    pagoElectronico?: { referencia?: string | null; terminal?: string | null },
  ) {
    return this.prisma.$transaction(async (tx) => {
      await lockTenant(tx,tenantId);
      const user=await authorizedActor(tx,tenantId,usuarioId,['ADMIN','CAJERO'],'cotizaciones.convertir_venta');
      if (!['EFECTIVO','TARJETA','TRANSFERENCIA','CREDITO'].includes(metodoPago)) throw new BadRequestException('Método de pago inválido');
      // Tarjeta y transferencia exigen autorización bancaria también al convertir una cotización.
      const autorizacion = normalizarAutorizacion(metodoPago, pagoElectronico);
      const caja=await openCash(tx,tenantId,usuarioId);
      const ventaId=id();
      // Obtener secuencial de venta
      const seqResult = await tx.$queryRaw<[{ ultimo_numero: number }]>`
        INSERT INTO "secuencias_tenant" ("id", "tenant_id", "tipo", "ultimo_numero")
        VALUES (gen_random_uuid(), ${tenantId}, 'VENTA'::"TipoSecuencia", 1)
        ON CONFLICT ("tenant_id", "tipo")
        DO UPDATE SET "ultimo_numero" = "secuencias_tenant"."ultimo_numero" + 1
        RETURNING "ultimo_numero"
      `;

      const numeroVenta = seqResult[0].ultimo_numero;

      await tx.$queryRaw`SELECT id FROM cotizaciones WHERE id = ${cotizacionId} AND tenant_id = ${tenantId} FOR UPDATE`;
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

      // fecha_validez es DATE: Prisma lo representa a medianoche UTC, sin zona horaria.
      // El día actual sí corresponde a la zona de negocio. Vigencia inclusiva hasta ese día.
      if (cotizacion.fechaValidez.toISOString().slice(0, 10) < diaCalendario(new Date())) {
        throw new BadRequestException('La cotización está vencida. Renueve su vigencia antes de convertirla en venta');
      }

      if (metodoPago === 'CREDITO' && !cotizacion.clienteId) throw new BadRequestException('Seleccione un cliente registrado para vender a crédito');
      // Crédito: mismas reglas que una venta directa (cliente activo, crédito habilitado y límite con el saldo actual).
      // lockTenant serializa esta conversión con las ventas de la empresa, así que el cupo no puede agotarse dos veces.
      const totalVenta = Number(cotizacion.total);
      if (metodoPago === 'CREDITO') {
        const clienteCredito = await tx.cliente.findFirst({ where: { id: cotizacion.clienteId!, tenantId } });
        if (!clienteCredito || !clienteCredito.activo) throw new NotFoundException('Cliente seleccionado no existe o está inactivo');
        if (!clienteCredito.creditoHabilitado) throw new BadRequestException('El cliente no tiene habilitado el crédito');
        if (clienteCredito.limiteCredito !== null && money(Number(clienteCredito.saldoPendiente) + totalVenta) > Number(clienteCredito.limiteCredito)) {
          throw new BadRequestException('La venta supera el límite de crédito disponible del cliente');
        }
      }
      if(new Set(cotizacion.detalles.map(d=>d.productoId)).size!==cotizacion.detalles.length) throw new BadRequestException('Agrupe las líneas del mismo producto antes de convertir la cotización');
      const bruto=money(cotizacion.detalles.reduce((sum,d)=>sum+Number(d.totalMedida)*Number(d.precioUnitario),0));
      validateDiscount(user,bruto,Number(cotizacion.descuento));
      if(user.rol !== 'ADMIN' && cotizacion.detalles.some(d=>Number(d.precioUnitario)!==Number(d.producto.precioVenta))) throw new BadRequestException('La cotización requiere validación del precio por administrador');
      // Verificar y descontar stock por la cantidad solicitada con precisión decimal
      for (const d of cotizacion.detalles) {
        await query(tx,'SELECT id FROM productos WHERE id=$1 AND tenant_id=$2 FOR UPDATE',d.productoId,tenantId);
        const reservado=Number(d.producto.stockReservado||0);
        const stockDisponible = money(Number(d.producto.stockActual)-reservado);
        const cantidadRequerida = Number(d.totalMedida);
        if (stockDisponible < cantidadRequerida) {
          throw new BadRequestException(
            `Stock insuficiente para "${d.producto.nombre}". Disponible: ${stockDisponible}, Requerido: ${cantidadRequerida}`,
          );
        }

        const descontado = await tx.producto.updateMany({
          where: { id: d.producto.id, tenantId, activo: true, stockActual: { gte: money(cantidadRequerida+reservado) },stockReservado:reservado },
          data: { stockReservado: { increment: cantidadRequerida } },
        });
        if (descontado.count !== 1) {
          throw new BadRequestException(`Stock insuficiente para "${d.producto.nombre}" o producto inactivo`);
        }
      }

      // Crear la venta
      const venta = await tx.venta.create({
        data: {
          id:ventaId,
          tenantId,
          numeroVenta,
          reservaPendiente:true,
          cajaId:caja.id,
          clienteNombre:cotizacion.clienteNombre,
          clienteRtn:cotizacion.clienteRtn,
          clienteId: cotizacion.clienteId,
          usuarioId,
          subtotal: bruto,
          isv: cotizacion.isv,
          descuento: cotizacion.descuento,
          total: cotizacion.total,
          metodoPago,
          tipoPago: metodoPago === 'CREDITO' ? 'CREDITO' : 'CONTADO',
          saldoCredito: metodoPago === 'CREDITO' ? totalVenta : null,
          estado: 'COMPLETADA',
          notas: `Convertida de Cotización #COT-${cotizacion.numeroCotizacion.toString().padStart(4, '0')}`,
          detalles: {
            create: cotizacion.detalles.map((d) => ({
              productoId: d.productoId,
              cantidad: d.totalMedida,
              precioUnitario: d.precioUnitario,
              subtotal: money(Number(d.totalMedida)*Number(d.precioUnitario)),
              costoUnitario:d.producto.precioCosto,
            })),
          },
        },
      });

      if(metodoPago==='CREDITO'){
        const saldoCliente=await tx.cliente.updateMany({where:{id:cotizacion.clienteId!,tenantId,activo:true,creditoHabilitado:true},data:{saldoPendiente:{increment:totalVenta}}});
        if(saldoCliente.count!==1)throw new BadRequestException('El cliente no tiene habilitado el crédito');
        await account(tx,tenantId,usuarioId,'CXC',venta.id,cotizacion.clienteId!,Number(venta.total));
      }
      if (autorizacion) await registrarAprobacion(tx,tenantId,usuarioId,autorizacion,Number(venta.total),'VENTA',venta.id);
      await cashMovement(tx,caja.id,usuarioId,'VENTA_POS',Number(venta.total),metodoPago,venta.id,'Venta desde cotización');
      await audit(tx,tenantId,usuarioId,'COTIZACION_VENDER',venta.id,{cotizacionId,total:Number(venta.total),aprobacion:autorizacion});
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
      if (totalMedida <= 0) throw new BadRequestException('La medida total debe ser al menos 0.01');

      const precioLista = Number(prod.precioVenta);
      const precioUnitario = item.precioUnitario !== undefined ? Number(item.precioUnitario) : precioLista;

      const baseLineTotal = Math.round(totalMedida * precioUnitario * 100) / 100;

      const tipoDescuento = item.tipoDescuento || 'MONTO';
      let descuentoMonto = 0;

      if (tipoDescuento === 'PORCENTAJE') {
        if (Number(item.descuento || 0) > 100) throw new BadRequestException('El descuento porcentual no puede superar 100%');
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
    // Vigencia por día calendario del negocio, no por la zona horaria del servidor.
    const diferenciaDias = diasEntre(diaCalendario(hoy), new Date(c.fechaValidez).toISOString().slice(0, 10));

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
