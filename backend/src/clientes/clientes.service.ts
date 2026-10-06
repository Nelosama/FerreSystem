import { Injectable, NotFoundException, ServiceUnavailableException, Logger, BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { lockTenant } from '../operaciones/ledger';
import { PrismaService } from '../prisma/prisma.service';
import { CreateClienteDto, UpdateClienteDto } from './dto/create-cliente.dto';
import type { UpdateCreditoClienteDto } from './dto/cliente.dto';
import type { CreateAbonoClienteDto } from './dto/abono.dto';

@Injectable()
export class ClientesService {
  private readonly logger = new Logger(ClientesService.name);
  constructor(private prisma: PrismaService) {}

  async findAll(tenantId: string, search?: string, limit?: number) {
    const where: any = { tenantId, activo: true };
    const query = search?.trim();

    if (query) {
      where.OR = [
        { nombre: { contains: query, mode: 'insensitive' } },
        { codigo: { contains: query, mode: 'insensitive' } },
        { id: { contains: query, mode: 'insensitive' } },
        { rtn: { contains: query, mode: 'insensitive' } },
        { telefono: { contains: query, mode: 'insensitive' } },
      ];
      const numberMatch = query.match(/^(?:CLI[-\s]*)?0*(\d+)$/i);
      if (numberMatch) {
        const number = Number(numberMatch[1]);
        if (Number.isSafeInteger(number) && number > 0 && number <= 2147483647) {
          where.OR.push({ numeroCliente: number });
        }
      }
      // Aceptar teléfonos/RTN con o sin espacios, guiones y código de país.
      const digits = query.replace(/\D/g, '');
      if (digits && /^[\d\s()+.-]+$/.test(query)) {
        const matches = await this.prisma.$queryRaw<{ id: string }[]>`
          SELECT id FROM clientes WHERE tenant_id = ${tenantId} AND (
            regexp_replace(COALESCE(telefono, ''), '[^0-9]', '', 'g') LIKE ${'%' + digits + '%'}
            OR regexp_replace(COALESCE(rtn, ''), '[^0-9]', '', 'g') LIKE ${'%' + digits + '%'}
          ) ORDER BY nombre ASC LIMIT ${limit || 2147483647}
        `;
        where.OR.push({ id: { in: matches.map((cliente) => cliente.id) } });
      }
    }

    return this.prisma.cliente.findMany({
      where,
      orderBy: { nombre: 'asc' },
      ...(limit ? { take: limit } : {}),
    });
  }

  async findById(tenantId: string, id: string) {
    const cliente = await this.prisma.cliente.findFirst({
      where: { id, tenantId },
      include: {
        ventas: { where: { tenantId }, orderBy: { createdAt: 'desc' }, include: { detalles: true } },
        abonos: { where: { tenantId }, orderBy: { fecha: 'desc' }, include: { venta: { select: { id: true, numeroVenta: true, saldoCredito: true } } } },
      },
    });

    if (!cliente) {
      throw new NotFoundException('Cliente no encontrado');
    }

    return cliente;
  }

  async create(tenantId: string, dto: CreateClienteDto) {
    try {
      return await this.prisma.cliente.create({
        data: {
          tenantId,
          nombre: dto.nombre.trim(),
          rtn: dto.rtn?.trim() || null,
          telefono: dto.telefono?.trim() || null,
          email: dto.email?.trim() || null,
          direccion: dto.direccion?.trim() || null,
          tipo: dto.tipo || 'CONSUMIDOR_FINAL',
        },
      });
    } catch (error: any) {
      const target = JSON.stringify(error?.meta?.target || '');
      const column = String(error?.meta?.column || '');
      const databaseError = String(error?.meta?.database_error || '');
      const numberingUnavailable =
        (error?.code === 'P2002' && /numero_cliente|numeroCliente/.test(target)) ||
        (error?.code === 'P2022' && /numero_cliente|numeroCliente/.test(column)) ||
        (error?.code === 'P2004' && databaseError.includes('clientes_numero_cliente_positive'));
      if (numberingUnavailable) {
        this.logger.error(`Numeración de clientes no disponible (${error.code}). Verificar la migración 20261002000000_add_customer_numbers y el trigger clientes_assign_number.`);
        throw new ServiceUnavailableException('No se pudo asignar el número de cliente. El administrador debe revisar la migración de numeración en la base de datos.');
      }
      throw error;
    }
  }

  async update(tenantId: string, id: string, dto: UpdateClienteDto) {
    const existing = await this.prisma.cliente.findFirst({ where: { id, tenantId } });
    if (!existing) throw new NotFoundException('Cliente no encontrado');

    return this.prisma.cliente.update({
      where: { id, tenantId },
      data: {
        ...(dto.nombre !== undefined ? { nombre: dto.nombre.trim() } : {}),
        ...(dto.rtn !== undefined ? { rtn: dto.rtn?.trim() || null } : {}),
        ...(dto.telefono !== undefined ? { telefono: dto.telefono?.trim() || null } : {}),
        ...(dto.email !== undefined ? { email: dto.email?.trim() || null } : {}),
        ...(dto.direccion !== undefined ? { direccion: dto.direccion?.trim() || null } : {}),
        ...(dto.tipo !== undefined ? { tipo: dto.tipo } : {}),
      },
    });
  }

  async delete(tenantId: string, id: string) {
    return this.prisma.$transaction(async tx => {
      await lockTenant(tx,tenantId);
      const result = await tx.cliente.updateMany({where:{id,tenantId,activo:true},data:{activo:false}});
      if(!result.count) throw new NotFoundException('Cliente no encontrado o no pertenece a la organización');
      return {success:true,count:result.count};
    });
  }

  async updateCredit(tenantId: string, id: string, dto: UpdateCreditoClienteDto) {
    return this.prisma.$transaction(async tx => {
      await lockTenant(tx, tenantId);
      const cliente = await tx.cliente.findFirst({ where: { id, tenantId } });
      if (!cliente) throw new NotFoundException('Cliente no encontrado');
      if (dto.creditoHabilitado && dto.limiteCredito !== undefined && dto.limiteCredito !== null &&
          new Prisma.Decimal(dto.limiteCredito).lessThan(cliente.saldoPendiente)) {
        throw new BadRequestException('El límite de crédito no puede ser menor que el saldo pendiente');
      }
      return tx.cliente.update({ where: { id, tenantId }, data: {
        creditoHabilitado: dto.creditoHabilitado,
        ...(dto.limiteCredito !== undefined ? { limiteCredito: dto.limiteCredito } : {}),
      } });
    });
  }

  async search(tenantId: string, query: string) {
    const q = query?.trim();
    if (!q) return [];
    return this.prisma.cliente.findMany({
      where: { tenantId, activo: true, OR: [
        { codigo: { contains: q, mode: 'insensitive' } },
        { nombre: { contains: q, mode: 'insensitive' } },
      ] },
      select: { id: true, codigo: true, nombre: true, telefono: true, creditoHabilitado: true, limiteCredito: true, saldoPendiente: true },
      orderBy: { nombre: 'asc' }, take: 30,
    });
  }

  async addPayment(tenantId: string, clienteId: string, dto: CreateAbonoClienteDto) {
    return this.prisma.$transaction(async tx => {
      await lockTenant(tx, tenantId);
      const cliente = await tx.cliente.findFirst({ where: { id: clienteId, tenantId } });
      if (!cliente) throw new NotFoundException('Cliente no encontrado');
      const monto = new Prisma.Decimal(dto.monto);
      if (monto.greaterThan(cliente.saldoPendiente)) throw new BadRequestException('El abono supera el saldo pendiente del cliente');

      let venta: { id: string; saldoCredito: Prisma.Decimal | null } | null = null;
      if (dto.ventaId) {
        venta = await tx.venta.findFirst({ where: { id: dto.ventaId, tenantId, clienteId, tipoPago: 'CREDITO' }, select: { id: true, saldoCredito: true } });
        if (!venta) throw new NotFoundException('Venta a crédito no encontrada para este cliente');
        if (venta.saldoCredito === null || monto.greaterThan(venta.saldoCredito)) throw new BadRequestException('El abono supera el saldo de la venta');
      }

      const abono = await tx.abonoCliente.create({ data: {
        tenantId, clienteId, ventaId: venta?.id ?? null, monto,
        fecha: dto.fecha ? new Date(dto.fecha) : new Date(), metodo: dto.metodo, notas: dto.notas,
      } });
      await tx.cliente.update({ where: { id: cliente.id, tenantId }, data: { saldoPendiente: { decrement: monto } } });

      // Keep the existing CXC ledger in sync with this customer-facing payment record.
      if (venta) {
        const cuenta = await tx.cuentaOperativa.findFirst({ where: { tenantId, clienteId, tipo: 'CXC', documentoId: venta.id } });
        if (cuenta) {
          if (monto.greaterThan(cuenta.saldo)) throw new BadRequestException('El abono supera el saldo pendiente de la cuenta');
          await tx.cuentaOperativa.update({ where: { id: cuenta.id, tenantId }, data: { saldo: { decrement: monto } } });
        }
        await tx.venta.update({ where: { id: venta.id, tenantId, clienteId }, data: { saldoCredito: { decrement: monto } } });
      } else {
        let restante = monto;
        const cuentas = await tx.cuentaOperativa.findMany({ where: { tenantId, clienteId, tipo: 'CXC', saldo: { gt: 0 } }, orderBy: { createdAt: 'asc' } });
        for (const cuenta of cuentas) {
          if (restante.lessThanOrEqualTo(0)) break;
          const aplicado = Prisma.Decimal.min(restante, cuenta.saldo);
          await tx.cuentaOperativa.update({ where: { id: cuenta.id, tenantId }, data: { saldo: { decrement: aplicado } } });
          await tx.venta.updateMany({ where: { id: cuenta.documentoId, tenantId, clienteId }, data: { saldoCredito: { decrement: aplicado } } });
          restante = restante.sub(aplicado);
        }
        if (restante.greaterThan(0)) throw new BadRequestException('El saldo del cliente no coincide con sus cuentas por cobrar');
      }
      return abono;
    });
  }
}

