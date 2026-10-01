import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateLevantamientoDto, UpdateLevantamientoDto } from './dto/create-levantamiento.dto';
import { CreateLevantamientoItemDto, UpdateLevantamientoItemDto } from './dto/create-levantamiento-item.dto';

@Injectable()
export class LevantamientosService {
  constructor(private readonly prisma: PrismaService) {}

  // --- LEVANTAMIENTOS ---

  async findAll(tenantId: string) {
    const levantamientos = await this.prisma.levantamiento.findMany({
      where: { tenantId },
      include: {
        _count: {
          select: { items: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return levantamientos.map((l) => ({
      id: l.id,
      nombre: l.nombre,
      descripcion: l.descripcion,
      estado: l.estado,
      createdBy: l.createdBy,
      createdAt: l.createdAt,
      updatedAt: l.updatedAt,
      totalItems: l._count.items,
    }));
  }

  async findOne(tenantId: string, id: string) {
    const levantamiento = await this.prisma.levantamiento.findFirst({
      where: { id, tenantId },
      include: {
        items: {
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!levantamiento) {
      throw new NotFoundException(`Levantamiento con ID "${id}" no encontrado`);
    }

    return {
      id: levantamiento.id,
      nombre: levantamiento.nombre,
      descripcion: levantamiento.descripcion,
      estado: levantamiento.estado,
      createdBy: levantamiento.createdBy,
      createdAt: levantamiento.createdAt,
      updatedAt: levantamiento.updatedAt,
      items: levantamiento.items.map((item) => ({
        id: item.id,
        levantamientoId: item.levantamientoId,
        descripcion: item.descripcion,
        cantidad: Number(item.cantidad),
        unidad: item.unidad,
        codigo: item.codigo,
        marca: item.marca,
        categoria: item.categoria,
        notas: item.notas,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
      })),
    };
  }

  async create(tenantId: string, userId: string, dto: CreateLevantamientoDto) {
    return this.prisma.levantamiento.create({
      data: {
        tenantId,
        nombre: dto.nombre,
        descripcion: dto.descripcion,
        estado: dto.estado ?? 'BORRADOR',
        createdBy: userId,
      },
    });
  }

  async update(tenantId: string, id: string, dto: UpdateLevantamientoDto) {
    const exists = await this.prisma.levantamiento.findFirst({
      where: { id, tenantId },
    });

    if (!exists) {
      throw new NotFoundException(`Levantamiento con ID "${id}" no encontrado`);
    }

    return this.prisma.levantamiento.update({
      where: { id, tenantId },
      data: {
        ...(dto.nombre !== undefined && { nombre: dto.nombre }),
        ...(dto.descripcion !== undefined && { descripcion: dto.descripcion }),
        ...(dto.estado !== undefined && { estado: dto.estado }),
      },
    });
  }

  async remove(tenantId: string, id: string) {
    const exists = await this.prisma.levantamiento.findFirst({
      where: { id, tenantId },
    });

    if (!exists) {
      throw new NotFoundException(`Levantamiento con ID "${id}" no encontrado`);
    }

    await this.prisma.levantamiento.delete({
      where: { id, tenantId },
    });

    return { success: true, message: 'Levantamiento eliminado correctamente' };
  }

  // --- ITEMS ---

  async findItems(tenantId: string, levantamientoId: string) {
    // Validar que el levantamiento pertenece al tenant
    await this.findOne(tenantId, levantamientoId);

    const items = await this.prisma.levantamientoItem.findMany({
      where: { levantamientoId },
      orderBy: { createdAt: 'desc' },
    });

    return items.map((item) => ({
      id: item.id,
      levantamientoId: item.levantamientoId,
      descripcion: item.descripcion,
      cantidad: Number(item.cantidad),
      unidad: item.unidad,
      codigo: item.codigo,
      marca: item.marca,
      categoria: item.categoria,
      notas: item.notas,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    }));
  }

  async createItem(tenantId: string, levantamientoId: string, dto: CreateLevantamientoItemDto) {
    // Validar que el levantamiento pertenece al tenant
    await this.findOne(tenantId, levantamientoId);

    const item = await this.prisma.levantamientoItem.create({
      data: {
        levantamientoId,
        descripcion: dto.descripcion,
        cantidad: dto.cantidad,
        unidad: dto.unidad ?? 'unidad',
        codigo: dto.codigo,
        marca: dto.marca,
        categoria: dto.categoria,
        notas: dto.notas,
      },
    });

    return {
      id: item.id,
      levantamientoId: item.levantamientoId,
      descripcion: item.descripcion,
      cantidad: Number(item.cantidad),
      unidad: item.unidad,
      codigo: item.codigo,
      marca: item.marca,
      categoria: item.categoria,
      notas: item.notas,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    };
  }

  async updateItem(
    tenantId: string,
    levantamientoId: string,
    itemId: string,
    dto: UpdateLevantamientoItemDto,
  ) {
    // Validar que el levantamiento pertenece al tenant
    await this.findOne(tenantId, levantamientoId);

    const itemExists = await this.prisma.levantamientoItem.findFirst({
      where: { id: itemId, levantamientoId },
    });

    if (!itemExists) {
      throw new NotFoundException(`Item con ID "${itemId}" no encontrado en este levantamiento`);
    }

    const item = await this.prisma.levantamientoItem.update({
      where: { id: itemId, levantamientoId },
      data: {
        ...(dto.descripcion !== undefined && { descripcion: dto.descripcion }),
        ...(dto.cantidad !== undefined && { cantidad: dto.cantidad }),
        ...(dto.unidad !== undefined && { unidad: dto.unidad }),
        ...(dto.codigo !== undefined && { codigo: dto.codigo }),
        ...(dto.marca !== undefined && { marca: dto.marca }),
        ...(dto.categoria !== undefined && { categoria: dto.categoria }),
        ...(dto.notas !== undefined && { notas: dto.notas }),
      },
    });

    return {
      id: item.id,
      levantamientoId: item.levantamientoId,
      descripcion: item.descripcion,
      cantidad: Number(item.cantidad),
      unidad: item.unidad,
      codigo: item.codigo,
      marca: item.marca,
      categoria: item.categoria,
      notas: item.notas,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    };
  }

  async removeItem(tenantId: string, levantamientoId: string, itemId: string) {
    // Validar que el levantamiento pertenece al tenant
    await this.findOne(tenantId, levantamientoId);

    const itemExists = await this.prisma.levantamientoItem.findFirst({
      where: { id: itemId, levantamientoId },
    });

    if (!itemExists) {
      throw new NotFoundException(`Item con ID "${itemId}" no encontrado en este levantamiento`);
    }

    await this.prisma.levantamientoItem.delete({
      where: { id: itemId, levantamientoId },
    });

    return { success: true, message: 'Item eliminado correctamente' };
  }
}
