import { Injectable, NotFoundException, ServiceUnavailableException, ConflictException, Logger, BadRequestException } from '@nestjs/common';
import { decimal, lockTenant, money } from '../operaciones/ledger';
import { PrismaService } from '../prisma/prisma.service';
import { CreateClienteDto, UpdateClienteDto } from './dto/create-cliente.dto';
import { UpdateCreditoClienteDto } from './dto/cliente.dto';
import { CreateAbonoClienteDto } from './dto/abono.dto';

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
        { id: { contains: query, mode: 'insensitive' } },
        { codigo: { contains: query, mode: 'insensitive' } },
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
      // Aceptar teléfonos/RTN con o sin espacios, guiones y código de país (ej. 504 o +504).
      let digits = query.replace(/\D/g, '');
      if (digits.length > 8 && digits.startsWith('504')) {
        digits = digits.substring(3);
      }
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
        ventas: {
          where: { tenantId },
          orderBy: { createdAt: 'desc' },
          include: { detalles: { include: { producto: true } } },
        },
        abonos: { where: { tenantId }, orderBy: { fecha: 'desc' } },
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
    const result = await this.prisma.cliente.updateMany({
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
    if (!result.count) throw new NotFoundException('Cliente no encontrado');
    return this.prisma.cliente.findFirst({ where: { id, tenantId } });
  }

  async delete(tenantId: string, id: string) {
    const result = await this.prisma.cliente.updateMany({ where: { id, tenantId, activo: true }, data: { activo: false } });
    if (!result.count) throw new NotFoundException('Cliente no encontrado o ya está inactivo');
    return { success: true };
  }

  async search(tenantId: string, value?: string) {
    const query = value?.trim();
    if (!query) return [];
    const matches = await this.prisma.cliente.findMany({
      where: {
        tenantId,
        activo: true,
        OR: [
          { codigo: { contains: query, mode: 'insensitive' } },
          { nombre: { contains: query, mode: 'insensitive' } },
        ],
      },
      select: { id: true, codigo: true, nombre: true, creditoHabilitado: true },
      orderBy: { nombre: 'asc' },
      take: 30,
    });
    return matches;
  }

  async updateCredit(tenantId: string, id: string, dto: UpdateCreditoClienteDto) {
    return this.prisma.$transaction(async (tx) => {
      await lockTenant(tx, tenantId);
      const cliente = await tx.cliente.findFirst({ where: { id, tenantId } });
      if (!cliente) throw new NotFoundException('Cliente no encontrado');
      if (!cliente.activo) throw new BadRequestException('No se puede configurar crédito de un cliente inactivo');
      const limite = dto.limiteCredito === null || dto.limiteCredito === undefined
        ? dto.limiteCredito
        : decimal(dto.limiteCredito, 'Límite de crédito');
      if (limite !== undefined && limite !== null && limite < Number(cliente.saldoPendiente)) {
        throw new BadRequestException('El límite no puede ser menor al saldo pendiente del cliente');
      }
      await tx.cliente.updateMany({
        where: { id, tenantId },
        data: {
          creditoHabilitado: dto.creditoHabilitado,
          ...(dto.limiteCredito !== undefined ? { limiteCredito: limite } : {}),
        },
      });
      return tx.cliente.findFirst({ where: { id, tenantId } });
    });
  }

  async addPayment(tenantId: string, id: string, dto: CreateAbonoClienteDto) {
    const amount = decimal(dto.monto, 'Abono', true);
    const fecha = dto.fecha ? new Date(dto.fecha) : new Date();

    return this.prisma.$transaction(async (tx) => {
      await lockTenant(tx, tenantId);
      const cliente = await tx.cliente.findFirst({ where: { id, tenantId } });
      if (!cliente) throw new NotFoundException('Cliente no encontrado');
      if (amount > Number(cliente.saldoPendiente)) {
        throw new BadRequestException('El abono no puede superar el saldo pendiente del cliente');
      }

      const creditSales = dto.ventaId
        ? [await tx.venta.findFirst({
            where: { id: dto.ventaId, tenantId, clienteId: id, tipoPago: 'CREDITO' },
          })].filter(Boolean)
        : await tx.venta.findMany({
            where: { tenantId, clienteId: id, tipoPago: 'CREDITO', saldoCredito: { gt: 0 } },
            orderBy: { createdAt: 'asc' },
          });
      if (dto.ventaId && !creditSales.length) throw new NotFoundException('Venta a crédito no encontrada para este cliente');

      let remaining = amount;
      for (const sale of creditSales) {
        const balance = Number(sale.saldoCredito ?? sale.total);
        if (dto.ventaId && amount > balance) {
          throw new BadRequestException('El abono no puede superar el saldo pendiente de la venta');
        }
        const applied = Math.min(remaining, balance);
        if (applied <= 0) continue;
        const updatedSale = await tx.venta.updateMany({
          where: { id: sale.id, tenantId, clienteId: id, saldoCredito: { gte: applied } },
          data: { saldoCredito: { decrement: applied } },
        });
        if (updatedSale.count !== 1) throw new ConflictException('El saldo de la venta cambió; vuelva a intentar');
        const account = await tx.cuentaOperativa.findFirst({
          where: { tenantId, tipo: 'CXC', documentoId: sale.id },
          select: { id: true },
        });
        if (!account) throw new ConflictException('No se encontró la cuenta por cobrar de la venta');
        const updatedAccount = await tx.cuentaOperativa.updateMany({
          where: { id: account.id, tenantId, saldo: { gte: applied } },
          data: { saldo: { decrement: applied } },
        });
        if (updatedAccount.count !== 1) throw new ConflictException('El saldo de la cuenta por cobrar cambió; vuelva a intentar');
        remaining = money(remaining - applied);
        if (remaining <= 0) break;
      }
      if (remaining > 0) throw new BadRequestException('El abono supera el saldo pendiente de las ventas a crédito');

      const updated = await tx.cliente.updateMany({
        where: { id, tenantId, saldoPendiente: { gte: amount } },
        data: { saldoPendiente: { decrement: amount } },
      });
      if (updated.count !== 1) throw new ConflictException('El saldo del cliente cambió; vuelva a intentar');

      return tx.abonoCliente.create({
        data: {
          tenantId,
          clienteId: id,
          ventaId: dto.ventaId || null,
          monto: amount,
          fecha,
          metodo: dto.metodo?.trim() || null,
          notas: dto.notas?.trim() || null,
        },
      });
    });
  }
}

