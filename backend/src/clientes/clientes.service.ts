import { Injectable, NotFoundException, ServiceUnavailableException, ConflictException, Logger } from '@nestjs/common';
import { lockTenant } from '../operaciones/ledger';
import { PrismaService } from '../prisma/prisma.service';
import { CreateClienteDto, UpdateClienteDto } from './dto/create-cliente.dto';

@Injectable()
export class ClientesService {
  private readonly logger = new Logger(ClientesService.name);
  constructor(private prisma: PrismaService) {}

  async findAll(tenantId: string, search?: string, limit?: number) {
    const where: any = { tenantId };
    const query = search?.trim();

    if (query) {
      where.OR = [
        { nombre: { contains: query, mode: 'insensitive' } },
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
    await this.findById(tenantId, id);

    return this.prisma.cliente.update({
      where: { id },
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
      const linked = await tx.venta.count({where:{tenantId,clienteId:id}});
      const quotes = await tx.cotizacion.count({where:{tenantId,clienteId:id}});
      if(linked || quotes) throw new ConflictException('El cliente tiene documentos; conserve su historial');
      const result = await tx.cliente.deleteMany({where:{id,tenantId}});
      if(!result.count) throw new NotFoundException('Cliente no encontrado o no pertenece a la organización');
      return {success:true,count:result.count};
    });
  }
}

