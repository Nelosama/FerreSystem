import { account, authorizedActor, audit, cashMovement, decimal, fingerprint, lockTenant, money, openCash, query, validateDiscount } from '../operaciones/ledger';
import { Injectable, BadRequestException, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class VentasService {
  constructor(private prisma: PrismaService) {}

  async findSolicitud(tenantId: string, usuarioId: string, solicitudId: string) {
    // Esperar a una escritura en curso; consultar nunca registra ni cobra una venta.
    return this.prisma.$transaction(async (tx) => {
      await lockTenant(tx, tenantId);
      await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtextextended(${'VENTA:' + solicitudId}, 0))`;
      const venta = await tx.venta.findFirst({
        where: { id: solicitudId, tenantId, usuarioId },
        include: { cliente: true, detalles: { include: { producto: true } } },
      });
      return venta
        ? { estado: 'REGISTRADA' as const, venta: this.formatVentaCreada(venta) }
        : { estado: 'NO_REGISTRADA' as const };
    }, { timeout: 30000 });
  }

  async findAll(tenantId: string, limit = 50, page = 0) {
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
      take: Math.min(Math.max(limit,1),500),
      skip: Math.max(page,0)*Math.min(Math.max(limit,1),500),
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
      clienteNombre?: string;
      clienteRtn?: string;
      vencimiento?: string;
      metodoPago?: any;
      descuento?: number;
      notas?: string;
      detalles: {
        productoId: string;
        cantidad: number;
        precioUnitario?: number;
        sinInventario?: boolean;
        proveedorId?: string;
        ordenCompraId?: string;
      }[];
    },
  ) {
    if (!dto.detalles || dto.detalles.length === 0) {
      throw new BadRequestException('La venta debe incluir al menos un producto');
    }

    if(new Set(dto.detalles.map(d=>d.productoId)).size!==dto.detalles.length) throw new BadRequestException('Agrupe las líneas del mismo producto');
    const descuento = decimal(dto.descuento || 0, 'Descuento');
    const requestHash = fingerprint({usuarioId,dto});

    // Transacción atómica completa: número correlativo, descuento de inventario y guardado
    return this.prisma.$transaction(async (tx) => {
      await lockTenant(tx,tenantId);
      const user = await authorizedActor(tx,tenantId,usuarioId,['ADMIN','CAJERO','VENDEDOR'],'pos.vender');
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
              (anterior.solicitudHash && anterior.solicitudHash !== requestHash) ||
              anterior.clienteId !== (dto.clienteId || null) ||
              anterior.metodoPago !== (dto.metodoPago || 'EFECTIVO') ||
              Number(anterior.descuento) !== descuento || anterior.notas !== (dto.notas || null) ||
              !mismosDetalles) {
            throw new ConflictException('La solicitud ya fue utilizada para otra venta');
          }
          return this.formatVentaCreada(anterior);
        }
      }

      const metodo = dto.metodoPago || 'EFECTIVO';
      if (!['EFECTIVO','TARJETA','TRANSFERENCIA','CREDITO'].includes(metodo)) throw new BadRequestException('Método de pago inválido');
      if (metodo === 'CREDITO' && !dto.clienteId) throw new BadRequestException('Seleccione un cliente registrado para vender a crédito');
      const caja = await openCash(tx,tenantId,usuarioId);
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
        costoUnitario: number;
        sinInventario: boolean;
        proveedorId: string | null;
        ordenCompraId: string | null;
      }[] = [];

      for (const item of dto.detalles) {
        decimal(item.cantidad, 'Cantidad', true);
        await query(tx, 'SELECT id FROM productos WHERE id=$1 AND tenant_id=$2 FOR UPDATE',item.productoId,tenantId);
        const prod = await tx.producto.findFirst({
          where: { id: item.productoId, tenantId, activo: true },
        });

        if (!prod) {
          throw new NotFoundException(`Producto con ID ${item.productoId} no encontrado o inactivo`);
        }

        const reservado=Number(prod.stockReservado||0);
        const stockDisponible = money(Number(prod.stockActual)-reservado);
        if (!item.sinInventario && stockDisponible < item.cantidad) {
          throw new BadRequestException(
            `Stock insuficiente para "${prod.nombre}". Disponible: ${stockDisponible}, Solicitado: ${item.cantidad}`,
          );
        }

        const precioUnitario = item.precioUnitario !== undefined ? item.precioUnitario : Number(prod.precioVenta);
        decimal(precioUnitario,'Precio unitario');
        if (user.rol !== 'ADMIN' && precioUnitario !== Number(prod.precioVenta)) throw new ConflictException('El precio cambió; actualice el catálogo o solicite al administrador');
        if (item.sinInventario) {
          const [provider] = await query(tx,'SELECT id FROM proveedores WHERE id=$1 AND tenant_id=$2',item.proveedorId || '',tenantId);
          if (!provider) throw new BadRequestException('Venta sin inventario requiere proveedor registrado');
          if(item.ordenCompraId){const [order]=await query(tx,'SELECT id FROM ordenes_compra WHERE id=$1 AND tenant_id=$2 AND proveedor_id=$3',item.ordenCompraId,tenantId,provider.id);if(!order)throw new BadRequestException('Compra no corresponde al proveedor');}
        } else if (item.proveedorId || item.ordenCompraId) throw new BadRequestException('Use venta sin inventario para vincular proveedor');
        const itemSubtotal = Math.round(precioUnitario * item.cantidad * 100) / 100;
        subtotalTotal += itemSubtotal;

        // Descontar inventario con precisión decimal exacta
        if (!item.sinInventario) {
        const descontado = await tx.producto.updateMany({
          where: { id: prod.id, tenantId, activo: true, stockActual: { gte: money(item.cantidad+reservado) }, stockReservado:reservado },
          data: { stockReservado: { increment: item.cantidad } },
        });
        if (descontado.count !== 1) {
          throw new BadRequestException(`Stock insuficiente para "${prod.nombre}" o producto inactivo`);
        }

        }

        detallesParaCrear.push({
          productoId: prod.id,
          cantidad: item.cantidad,
          precioUnitario,
          subtotal: itemSubtotal,
          costoUnitario: Number(prod.precioCosto),
          sinInventario: !!item.sinInventario,
          proveedorId: item.proveedorId || null,
          ordenCompraId: item.ordenCompraId || null,
        });
      }

      // 3. Cálculos fiscales de Honduras: ISV 15%
      subtotalTotal = money(subtotalTotal);
      validateDiscount(user,subtotalTotal,descuento);
      const baseGravable = money(subtotalTotal - descuento);
      const isv = Math.round(baseGravable * 0.15 * 100) / 100;
      const total = Math.round((baseGravable + isv) * 100) / 100;

      // 4. Crear la venta en base de datos
      const venta = await tx.venta.create({
        data: {
          ...(dto.solicitudId && { id: dto.solicitudId }),
          tenantId,
          reservaPendiente:detallesParaCrear.some(d=>!d.sinInventario),
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
          metodoPago: dto.metodoPago || 'EFECTIVO',
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

      if (metodo === 'CREDITO') await account(tx,tenantId,usuarioId,'CXC',venta.id,dto.clienteId!,total,dto.vencimiento);
      await cashMovement(tx,caja.id,usuarioId,'VENTA_POS',total,metodo,venta.id,`Venta ${numeroVenta}`);
      await audit(tx,tenantId,usuarioId,'VENTA_CREAR',venta.id,{total,metodo,cajaId:caja.id});
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
