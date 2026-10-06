import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateProveedorDto, UpdateProveedorDto } from './dto/proveedor.dto';

@Injectable()
export class ProveedoresService {
  constructor(private readonly prisma: PrismaService) {}

  create(tenantId: string, dto: CreateProveedorDto) {
    return this.prisma.proveedor.create({ data: {
      tenantId,
      nombre: dto.nombre,
      contacto: dto.contacto,
      telefono: dto.telefono,
      email: dto.email,
    } });
  }

  findAll(tenantId: string) {
    return this.prisma.proveedor.findMany({ where: { tenantId, activo: true }, orderBy: { nombre: 'asc' } });
  }

  async findById(tenantId: string, id: string) {
    const proveedor = await this.prisma.proveedor.findFirst({ where: { id, tenantId, activo: true } });
    if (!proveedor) throw new NotFoundException('Proveedor no encontrado');
    return proveedor;
  }

  async update(tenantId: string, id: string, dto: UpdateProveedorDto) {
    await this.findById(tenantId, id);
    return this.prisma.proveedor.update({ where: { id }, data: {
      nombre: dto.nombre,
      contacto: dto.contacto,
      telefono: dto.telefono,
      email: dto.email,
    } });
  }

  async deactivate(tenantId: string, id: string) {
    await this.findById(tenantId, id);
    return this.prisma.proveedor.update({ where: { id }, data: { activo: false } });
  }
}
