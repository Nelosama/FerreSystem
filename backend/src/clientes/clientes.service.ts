import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

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

  async create(
    tenantId: string,
    dto: {
      nombre: string;
      rtn?: string;
      telefono?: string;
      email?: string;
      direccion?: string;
      tipo?: any;
    },
  ) {
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
}
