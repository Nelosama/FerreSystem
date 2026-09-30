import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateClienteDto, UpdateClienteDto } from './dto/create-cliente.dto';

@Injectable()
export class ClientesService {
  constructor(private prisma: PrismaService) {}

  async findAll(tenantId: string, search?: string) {
    const where: any = { tenantId };

    if (search) {
      where.OR = [
        { nombre: { contains: search, mode: 'insensitive' } },
        { rtn: { contains: search, mode: 'insensitive' } },
        { telefono: { contains: search, mode: 'insensitive' } },
      ];
    }

    return this.prisma.cliente.findMany({
      where,
      orderBy: { nombre: 'asc' },
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
    return this.prisma.cliente.create({
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
    // Direct tenant-isolated operation for absolute multi-tenant safety
    const result = await this.prisma.cliente.deleteMany({
      where: {
        id,
        tenantId,
      },
    });

    if (result.count === 0) {
      throw new NotFoundException('Cliente no encontrado o no pertenece a la organización');
    }

    return { success: true, count: result.count };
  }
}
