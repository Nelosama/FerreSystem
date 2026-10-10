import { Injectable, NotFoundException, ServiceUnavailableException, Logger, BadRequestException, GoneException } from '@nestjs/common';
import { decimal, lockTenant } from '../operaciones/ledger';
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
    if (dto.nombre !== undefined && (typeof dto.nombre !== 'string' || !dto.nombre.trim())) {
      throw new BadRequestException('El nombre del cliente es obligatorio');
    }
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

  /**
   * Búsqueda comercial para POS y cotizaciones (CAJERO y ADMIN). Usa el mismo criterio que la lista
   * del administrador, pero devuelve solo datos necesarios para atender al cliente: sin saldos,
   * límites de crédito, correo, dirección ni notas.
   */
  async search(tenantId: string, value?: string) {
    const clientes = await this.findAll(tenantId, value ?? '', 12);
    return clientes.map((cliente) => ({
      id: cliente.id,
      numeroCliente: cliente.numeroCliente,
      codigo: cliente.codigo,
      nombre: cliente.nombre,
      rtn: cliente.rtn,
      telefono: cliente.telefono,
      creditoHabilitado: cliente.creditoHabilitado,
    }));
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

  // Ruta heredada bloqueada: no era idempotente, no registraba caja, pagos_cuenta ni auditoría, y dejaba la CxC
  // sin su pago. Los abonos se registran con POST /operaciones/cuentas/:id/pagos (idempotente, con caja y auditoría).
  async addPayment(_tenantId: string, _id: string, _dto: CreateAbonoClienteDto) {
    throw new GoneException('Los abonos se registran desde Cuentas y abonos (POST /operaciones/cuentas/:id/pagos)');
  }
}

