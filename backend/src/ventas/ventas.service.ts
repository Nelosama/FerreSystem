import { type Tx, account, authorizedActor, audit, cashMovement, decimal, fingerprint, id as nuevoId, esIdInterno, idSolicitud, candidatosSolicitud, lockTenant, money, openCash, query, validateDiscount } from '../operaciones/ledger';
import { diaCalendario, sumarDias } from '../common/zona-horaria';
import { normalizarAutorizacion, registrarAprobacion } from '../operaciones/aprobaciones-bancarias';
import { aCentesimas, huellaCanonica, normalizarTexto } from '../common/huella-solicitud';
import { cent, registrarEventosCobro, ROLES_ENTREGA } from '../entregas/entregas-core';
import { Injectable, BadRequestException, NotFoundException, ConflictException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { calcularTotales, centavosADecimal } from '../common/dinero';
import { aCentavos } from '../common/redondeo-monetario';

/** Permiso explícito (no implícito por rol) para cobrar un precio distinto del vigente, con motivo y auditoría. */
export const PERMISO_EXCEPCION_PRECIO = 'pos.excepcion_precio';

/**
 * Facturado, cobrado y saldo pendiente de una venta. Al contado se cobra el total. En crédito el saldo lo mantienen
 * los abonos (operaciones: saldo_credito y cuenta CXC); cobrado = facturado − saldo. No inventa plazos ni vencimientos.
 */
export function cobroDeVenta(v: { total: unknown; tipoPago: string; saldoCredito: unknown }) {
  const totalFacturado = Number(v.total);
  if (v.tipoPago !== 'CREDITO') return { totalFacturado, totalCobrado: totalFacturado, saldoPendiente: 0 };
  const saldoPendiente = v.saldoCredito === null || v.saldoCredito === undefined ? totalFacturado : Number(v.saldoCredito);
  return { totalFacturado, totalCobrado: centavosADecimal(aCentavos(totalFacturado) - aCentavos(saldoPendiente)), saldoPendiente };
}

@Injectable()
export class VentasService {
  constructor(private prisma: PrismaService) {}

  async findSolicitud(tenantId: string, usuarioId: string, solicitudId: string) {
    // Esperar a una escritura en curso; consultar nunca registra ni cobra una venta.
    // Un identificador interno no es una solicitud: no se reconoce como venta registrada (P3).
    if (esIdInterno(solicitudId)) return { estado: 'NO_REGISTRADA' as const };
    return this.prisma.$transaction(async (tx) => {
      await lockTenant(tx, tenantId);
      await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtextextended(${'VENTA:' + tenantId + ':' + solicitudId}, 0))`;
      const venta = await tx.venta.findFirst({
        where: { id: { in: candidatosSolicitud(tenantId, solicitudId) }, tenantId, usuarioId },
        include: { cliente: true, detalles: { include: { producto: true } } },
      });
      if (!venta && await this.solicitudDescartada(tx, tenantId, solicitudId)) return { estado: 'DESCARTADA' as const };
      return venta
        ? { estado: 'REGISTRADA' as const, venta: this.formatVentaCreada(venta) }
        : { estado: 'NO_REGISTRADA' as const };
    }, { timeout: 30000 });
  }

  private async solicitudDescartada(tx: Tx, tenantId: string, solicitudId: string) {
    const [descarte] = await query(tx, "SELECT id FROM auditoria_operaciones WHERE tenant_id=$1 AND entidad_id=$2 AND operacion='VENTA_DESCARTAR' LIMIT 1", tenantId, idSolicitud(tenantId, solicitudId));
    return !!descarte;
  }

  async descartarSolicitud(tenantId: string, usuarioId: string, solicitudId: string) {
    return this.prisma.$transaction(async tx => {
      await lockTenant(tx, tenantId);
      await authorizedActor(tx, tenantId, usuarioId, ['ADMIN', 'CAJERO', 'VENDEDOR'], 'pos.vender');
      await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtextextended(${'VENTA:' + tenantId + ':' + solicitudId}, 0))`;
      // Buscar sin filtrar por usuario: nunca invalidar una venta de otro actor con la misma solicitud.
      const venta = await tx.venta.findFirst({ where: { tenantId, id: { in: candidatosSolicitud(tenantId, solicitudId) } }, include: { cliente: true, detalles: { include: { producto: true } } } });
      if (venta) {
        if (venta.usuarioId !== usuarioId) throw new ConflictException('La solicitud pertenece a otra operación');
        return { estado: 'REGISTRADA' as const, venta: this.formatVentaCreada(venta) };
      }
      // La auditoría es también la marca durable de descarte. El mismo bloqueo protege create,
      // consulta y descarte; una petición retrasada nunca podrá confirmar esta identidad después.
      if (!await this.solicitudDescartada(tx, tenantId, solicitudId)) {
        await audit(tx, tenantId, usuarioId, 'VENTA_DESCARTAR', idSolicitud(tenantId, solicitudId), { solicitudId, motivo: 'Descarte de venta no confirmada' });
      }
      return { estado: 'DESCARTADA' as const };
    }, { timeout: 30000 });
  }

  async findAll(tenantId: string, limit = 50, page = 0, usuarioId?: string) {
    const ventas = await this.prisma.venta.findMany({
      where: { tenantId, ...(usuarioId ? { usuarioId } : {}) },
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
      take: Math.min(Math.max(limit,1),500),
      skip: Math.max(page,0)*Math.min(Math.max(limit,1),500),
    });

    return ventas.map((v) => ({
      ...v,
      ...cobroDeVenta(v),
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

  async findById(tenantId: string, id: string, usuarioId?: string) {
    const v = await this.prisma.venta.findFirst({
      where: { id, tenantId, ...(usuarioId ? { usuarioId } : {}) },
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
      ...cobroDeVenta(v),
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
      clienteNombre?: string;
      clienteRtn?: string;
      vencimiento?: string;
      metodoPago?: any;
      pagoElectronico?: { referencia?: string | null; terminal?: string | null };
      tipoPago?: 'CONTADO' | 'CREDITO';
      descuento?: number;
      notas?: string;
      excepcionPrecio?: { motivo: string };
      detalles: {
        productoId: string;
        cantidad: number;
        precioUnitario?: number;
        sinInventario?: boolean;
        proveedorId?: string;
        ordenCompraId?: string;
        modoEntrega?: 'MOSTRADOR' | 'BODEGA';
      }[];
    },
  ) {
    // DEF-03: toda venta nueva exige solicitudId (reintentos seguros). Las ventas anteriores sin él siguen consultables.
    if (!dto.solicitudId) throw new BadRequestException('solicitudId es obligatorio: genere un UUID v4 al abrir la venta y reutilícelo en los reintentos');
    if (!dto.detalles || dto.detalles.length === 0) {
      throw new BadRequestException('La venta debe incluir al menos un producto');
    }

    if(new Set(dto.detalles.map(d=>d.productoId)).size!==dto.detalles.length) throw new BadRequestException('Agrupe las líneas del mismo producto');
    const tipoPago = dto.tipoPago || (dto.metodoPago === 'CREDITO' ? 'CREDITO' : 'CONTADO');
    if (dto.tipoPago && dto.metodoPago && ((dto.tipoPago === 'CREDITO') !== (dto.metodoPago === 'CREDITO'))) {
      throw new BadRequestException('El tipo de pago y el método de pago no coinciden');
    }
    const metodo = dto.metodoPago || (tipoPago === 'CREDITO' ? 'CREDITO' : 'EFECTIVO');
    // Tarjeta y transferencia exigen la autorización bancaria antes de confirmar la venta (sin integración bancaria).
    const autorizacion = normalizarAutorizacion(metodo, dto.pagoElectronico);
    const descuento = decimal(dto.descuento || 0, 'Descuento');
    // Huella canónica (v2): mismo contenido, misma huella, sin importar orden de claves o líneas. Las ventas
    // anteriores conservan su huella heredada y se comparan con ella.
    const huellaHeredada = fingerprint({usuarioId,dto});
    let requestHash: string;
    try {
      requestHash = 'v2:' + huellaCanonica({
        v: 2, usuarioId,
        clienteId: dto.clienteId ?? null,
        clienteNombre: normalizarTexto(dto.clienteNombre),
        clienteRtn: normalizarTexto(dto.clienteRtn),
        vencimiento: dto.vencimiento ?? null,
        metodo, tipoPago,
        descuentoCentesimas: aCentesimas(descuento, 'El descuento'),
        notas: normalizarTexto(dto.notas),
        detalles: dto.detalles.map((d) => ({
          productoId: d.productoId,
          cantidadCentesimas: aCentesimas(d.cantidad, 'La cantidad', true),
          precioCentesimas: d.precioUnitario === undefined ? null : aCentesimas(d.precioUnitario, 'El precio'),
          sinInventario: !!d.sinInventario,
          proveedorId: d.proveedorId ?? null,
          ordenCompraId: d.ordenCompraId ?? null,
          modoEntrega: d.sinInventario ? 'SIN_INVENTARIO' : (d.modoEntrega ?? 'BODEGA'),
        })).sort((a, b) => (a.productoId < b.productoId ? -1 : a.productoId > b.productoId ? 1 : 0)),
      });
    } catch (error) {
      throw new BadRequestException((error as Error).message);
    }

    // Transacción atómica completa: número correlativo, descuento de inventario y guardado
    return this.prisma.$transaction(async (tx) => {
      await lockTenant(tx,tenantId);
      const user = await authorizedActor(tx,tenantId,usuarioId,['ADMIN','CAJERO','VENDEDOR'],'pos.vender');
      // Un reintento conserva el ID de la venta; el bloqueo dura hasta commit/rollback.
      if (dto.solicitudId) {
        await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtextextended(${'VENTA:' + tenantId + ':' + dto.solicitudId}, 0))`;
        // Identificador derivado por empresa; el crudo solo cuenta si la venta es de esta empresa (ventas anteriores al cambio).
        const incluir = { cliente: true, detalles: { include: { producto: true } } } as const;
        const [derivado, crudo] = candidatosSolicitud(tenantId, dto.solicitudId);
        let anterior = await tx.venta.findUnique({ where: { id: derivado }, include: incluir });
        if (!anterior) {
          const heredada = await tx.venta.findUnique({ where: { id: crudo }, include: incluir });
          if (heredada && heredada.tenantId === tenantId) anterior = heredada;
        }
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
              (anterior.solicitudHash && anterior.solicitudHash !== (anterior.solicitudHash.startsWith('v2:') ? requestHash : huellaHeredada)) ||
              anterior.clienteId !== (dto.clienteId || null) ||
              anterior.metodoPago !== metodo || anterior.tipoPago !== tipoPago ||
              Number(anterior.descuento) !== descuento || anterior.notas !== (dto.notas || null) ||
              !mismosDetalles) {
            throw new ConflictException('La solicitud ya fue utilizada para otra venta');
          }
          return this.formatVentaCreada(anterior);
        }
      }

      if (await this.solicitudDescartada(tx, tenantId, dto.solicitudId)) throw new ConflictException('La venta fue descartada; inicie una venta nueva');

      if (!['EFECTIVO','TARJETA','TRANSFERENCIA','CREDITO'].includes(metodo)) throw new BadRequestException('Método de pago inválido');
      if (tipoPago === 'CREDITO' && !dto.clienteId) throw new BadRequestException('Seleccione un cliente registrado para vender a crédito');
      const caja = await openCash(tx,tenantId,usuarioId);
      let clienteCredito: any = null;
      if (dto.clienteId) {
        clienteCredito = await tx.cliente.findFirst({ where: { id: dto.clienteId, tenantId } });
        if (!clienteCredito || !clienteCredito.activo) throw new NotFoundException('Cliente seleccionado no existe o está inactivo');
        if (tipoPago === 'CREDITO' && !clienteCredito.creditoHabilitado) {
          throw new BadRequestException('El cliente no tiene habilitado el crédito');
        }
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
      const detallesParaCrear: {
        productoId: string;
        cantidad: number;
        precioUnitario: number;
        subtotal: number;
        costoUnitario: number;
        sinInventario: boolean;
        proveedorId: string | null;
        ordenCompraId: string | null;
        modo: 'MOSTRADOR' | 'BODEGA' | 'SIN_INVENTARIO';
        stockAntes: number;
      }[] = [];

      // Líneas cobradas a un precio distinto del vigente con excepción administrativa explícita (se auditan).
      const excepcionesPrecio: { productoId: string; producto: string; precioVigente: number; precioCobrado: number }[] = [];
      for (const item of dto.detalles) {
        decimal(item.cantidad, 'Cantidad', true);
        await query(tx, 'SELECT id FROM productos WHERE id=$1 AND tenant_id=$2 FOR UPDATE',item.productoId,tenantId);
        const prod = await tx.producto.findFirst({
          where: { id: item.productoId, tenantId, activo: true },
        });

        if (!prod) {
          throw new NotFoundException(`Producto con ID ${item.productoId} no encontrado o inactivo`);
        }
        // Defensa en profundidad: aprobación y precio positivo, ambos obligatorios para vender (contrato precioAprobado con KARDEX).
        if (!prod.precioAprobado || Number(prod.precioVenta) <= 0) {
          throw new BadRequestException(`"${prod.nombre}" no tiene precio aprobado por el administrador; no se puede vender`);
        }
        if (item.sinInventario && item.modoEntrega) throw new BadRequestException('La venta sin inventario no admite modo de entrega');
        const modo: 'MOSTRADOR' | 'BODEGA' | 'SIN_INVENTARIO' = item.sinInventario ? 'SIN_INVENTARIO' : (item.modoEntrega ?? 'BODEGA');
        // La entrega inmediata en el POS es una entrega física: mismas reglas que /entregas (solo ADMIN y BODEGUERO).
        if (modo === 'MOSTRADOR' && !(ROLES_ENTREGA as readonly string[]).includes(user.rol)) {
          throw new ForbiddenException('Su rol no registra entregas físicas. Use «Cobrar y dejar en bodega»: bodega o administración entregará la mercancía.');
        }

        const reservado=Number(prod.stockReservado||0);
        const stockDisponible = money(Number(prod.stockActual)-reservado);
        if (!item.sinInventario && stockDisponible < item.cantidad) {
          throw new BadRequestException(
            modo === 'MOSTRADOR'
              ? `No hay existencias disponibles de "${prod.nombre}" para entregar ahora (disponible: ${stockDisponible}). Si la mercancía está pendiente de entregar, use Cobrar y dejar en bodega.`
              : `Stock insuficiente para "${prod.nombre}". Disponible: ${stockDisponible}, Solicitado: ${item.cantidad}`,
          );
        }

        const precioUnitario = item.precioUnitario !== undefined ? item.precioUnitario : Number(prod.precioVenta);
        decimal(precioUnitario,'Precio unitario');
        if (!(precioUnitario > 0)) throw new BadRequestException('El precio unitario debe ser mayor que cero');
        // Ningún rol registra en silencio un precio distinto del vigente (tampoco ADMIN). La única salida es una
        // excepción administrativa explícita: rol ADMIN + permiso «pos.excepcion_precio» asignado + motivo, y queda auditada.
        if (precioUnitario !== Number(prod.precioVenta)) {
          if (!dto.excepcionPrecio) throw new ConflictException('El precio cambió; actualice el catálogo o solicite al administrador');
          if (user.rol !== 'ADMIN' || !(user.permisos ?? []).includes(PERMISO_EXCEPCION_PRECIO)) {
            throw new ForbiddenException('Cobrar un precio distinto del vigente requiere el permiso explícito de excepción de precio');
          }
          excepcionesPrecio.push({ productoId: prod.id, producto: prod.nombre, precioVigente: Number(prod.precioVenta), precioCobrado: precioUnitario });
        }
        if (item.sinInventario) {
          const [provider] = await query(tx,'SELECT id FROM proveedores WHERE id=$1 AND tenant_id=$2',item.proveedorId || '',tenantId);
          if (!provider) throw new BadRequestException('Venta sin inventario requiere proveedor registrado');
          if(item.ordenCompraId){const [order]=await query(tx,'SELECT id FROM ordenes_compra WHERE id=$1 AND tenant_id=$2 AND proveedor_id=$3',item.ordenCompraId,tenantId,provider.id);if(!order)throw new BadRequestException('Compra no corresponde al proveedor');}
        } else if (item.proveedorId || item.ordenCompraId) throw new BadRequestException('Use venta sin inventario para vincular proveedor');

        // Descontar inventario con precisión decimal exacta
        if (!item.sinInventario) {
        // MOSTRADOR descuenta existencias al cobrar (entrega inmediata); BODEGA las reserva para entrega posterior.
        const descontado = await tx.producto.updateMany({
          where: { id: prod.id, tenantId, activo: true, stockActual: { gte: money(item.cantidad+reservado) }, stockReservado:reservado },
          data: modo === 'MOSTRADOR' ? { stockActual: { decrement: item.cantidad } } : { stockReservado: { increment: item.cantidad } },
        });
        if (descontado.count !== 1) {
          throw new BadRequestException(`Stock insuficiente para "${prod.nombre}" o producto inactivo`);
        }

        }

        detallesParaCrear.push({
          productoId: prod.id,
          cantidad: item.cantidad,
          precioUnitario,
          subtotal: 0,
          costoUnitario: Number(prod.precioCosto),
          sinInventario: !!item.sinInventario,
          proveedorId: item.proveedorId || null,
          ordenCompraId: item.ordenCompraId || null,
          modo,
          stockAntes: cent(prod.stockActual),
        });
      }

      // 3. Cálculos fiscales de Honduras: ISV 15%
      // Mismo cálculo que el POS offline (common/dinero.ts): líneas en centavos, mitad hacia arriba, ISV 15% sobre la base.
      const monetarias = detallesParaCrear.map((d) => ({ precioCentavos: aCentavos(d.precioUnitario, 'Precio unitario'), cantidadCentesimas: aCentavos(d.cantidad, 'Cantidad') }));
      const subtotalCentavos = calcularTotales(monetarias, 0).subtotal;
      validateDiscount(user, centavosADecimal(subtotalCentavos), descuento);
      const totales = calcularTotales(monetarias, aCentavos(descuento, 'Descuento'));
      detallesParaCrear.forEach((d, i) => { d.subtotal = centavosADecimal(totales.lineas[i]); });
      const subtotalTotal = centavosADecimal(totales.subtotal);
      const isv = centavosADecimal(totales.isv);
      const total = centavosADecimal(totales.total);
      if (!(total > 0)) throw new BadRequestException('La venta debe tener un importe mayor que cero');

      if (tipoPago === 'CREDITO' && clienteCredito.limiteCredito !== null) {
        const nuevoSaldo = money(Number(clienteCredito.saldoPendiente) + total);
        if (nuevoSaldo > Number(clienteCredito.limiteCredito)) {
          throw new BadRequestException('La venta supera el límite de crédito disponible del cliente');
        }
      }

      // 4. Crear la venta en base de datos
      const venta = await tx.venta.create({
        data: {
          ...(dto.solicitudId && { id: idSolicitud(tenantId, dto.solicitudId) }),
          tenantId,
          reservaPendiente:detallesParaCrear.some(d=>d.modo==='BODEGA'),
          numeroVenta,
          clienteId: dto.clienteId || null,
          usuarioId,
          cajaId: caja.id,
          clienteNombre: dto.clienteNombre?.trim() || null,
          clienteRtn: dto.clienteRtn?.trim() || null,
          solicitudHash: requestHash,
          subtotal: subtotalTotal,
          isv,
          descuento,
          total,
          metodoPago: metodo,
          tipoPago,
          saldoCredito: tipoPago === 'CREDITO' ? total : null,
          estado: 'COMPLETADA',
          notas: dto.notas || null,
          detalles: {
            create: detallesParaCrear.map((d) => ({
              productoId: d.productoId,
              cantidad: d.cantidad,
              precioUnitario: d.precioUnitario,
              subtotal: d.subtotal,
              costoUnitario: d.costoUnitario,
              sinInventario: d.sinInventario,
              proveedorId: d.proveedorId,
              ordenCompraId: d.ordenCompraId,
              tenantId,
              modoEntrega: d.modo,
              cantidadEntregada: d.modo === 'MOSTRADOR' ? d.cantidad : 0,
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

      if (tipoPago === 'CREDITO') {
        const updated = await tx.cliente.updateMany({
          where: { id: dto.clienteId, tenantId, activo: true, creditoHabilitado: true },
          data: { saldoPendiente: { increment: total } },
        });
        if (updated.count !== 1) throw new BadRequestException('El cliente no tiene habilitado el crédito');
        // Decisión aprobada: el vencimiento de una factura nueva sale del plazo de crédito del cliente y se conserva
        // aunque después cambie el plazo. Sin plazo configurado se mantiene el vencimiento indicado (compatibilidad).
        const vencimiento = clienteCredito?.plazoCreditoDias ? sumarDias(diaCalendario(new Date()), clienteCredito.plazoCreditoDias) : dto.vencimiento;
        await account(tx,tenantId,usuarioId,'CXC',venta.id,dto.clienteId!,total,vencimiento);
      }
      if (autorizacion) await registrarAprobacion(tx,tenantId,usuarioId,autorizacion,Number(total),'VENTA',venta.id);
      // Eventos de cobro y, si hubo entrega inmediata, de entrega con su movimiento de inventario.
      const porProducto = new Map(detallesParaCrear.map((d) => [d.productoId, d]));
      await registrarEventosCobro(tx, {
        tenantId, usuarioId, ventaId: venta.id, origen: 'ONLINE', solicitud: dto.solicitudId ?? nuevoId(),
        lineas: venta.detalles.map((d) => ({
          detalleId: d.id, productoId: d.productoId, cantidadCentesimas: cent(d.cantidad),
          modo: d.modoEntrega as 'MOSTRADOR' | 'BODEGA' | 'SIN_INVENTARIO', stockAntes: porProducto.get(d.productoId)!.stockAntes,
        })),
      });
      await cashMovement(tx,caja.id,usuarioId,'VENTA_POS',total,metodo,venta.id,`Venta ${numeroVenta}`);
      await audit(tx,tenantId,usuarioId,'VENTA_CREAR',venta.id,{total,metodo,cajaId:caja.id,aprobacion:autorizacion});
      if (excepcionesPrecio.length) await audit(tx,tenantId,usuarioId,'VENTA_EXCEPCION_PRECIO',venta.id,{motivo:dto.excepcionPrecio!.motivo.trim(),lineas:excepcionesPrecio});
      return this.formatVentaCreada(venta);
    },{timeout:30000});
  }
  private formatVentaCreada(venta: any) {
    return {
      ...venta,
      subtotal: Number(venta.subtotal),
      isv: Number(venta.isv),
      descuento: Number(venta.descuento),
      total: Number(venta.total),
      saldoCredito: venta.saldoCredito === null ? null : Number(venta.saldoCredito),
      ...cobroDeVenta(venta),
      detalles: venta.detalles.map((d) => ({
        id: d.id,
        productoId: d.productoId,
        productoNombre: d.producto.nombre,
        productoCodigo: d.producto.codigo,
        cantidad: Number(d.cantidad),
        precioUnitario: Number(d.precioUnitario),
        subtotal: Number(d.subtotal),
        modoEntrega: d.modoEntrega,
        cantidadEntregada: Number(d.cantidadEntregada),
      })),
    };
  }
}
