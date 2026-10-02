import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ProductosService {
  constructor(private prisma: PrismaService) {}

  async findAll(tenantId: string, search?: string, categoriaId?: string) {
    const where: any = {
      tenantId,
      activo: true,
    };

    if (categoriaId) {
      where.categoriaId = categoriaId;
    }

    if (search) {
      where.OR = [
        { nombre: { contains: search, mode: 'insensitive' } },
        { codigo: { contains: search, mode: 'insensitive' } },
        { codigoBarras: { contains: search, mode: 'insensitive' } },
      ];
    }

    const productos = await this.prisma.producto.findMany({
      where,
      include: {
        categoria: {
          select: { id: true, nombre: true },
        },
      },
      orderBy: { nombre: 'asc' },
    });

    return productos.map((p) => ({
      ...p,
      precioVenta: Number(p.precioVenta),
      precioCosto: Number(p.precioCosto),
      stockBajo: p.stockActual <= p.stockMinimo,
    }));
  }

  async findById(tenantId: string, id: string) {
    const p = await this.prisma.producto.findFirst({
      where: { id, tenantId },
      include: {
        categoria: true,
      },
    });

    if (!p) {
      throw new NotFoundException('Producto no encontrado');
    }

    return {
      ...p,
      precioVenta: Number(p.precioVenta),
      precioCosto: Number(p.precioCosto),
      stockBajo: p.stockActual <= p.stockMinimo,
    };
  }

  async getLowStock(tenantId: string) {
    // Filtrar productos cuyo stock actual sea menor o igual al mínimo
    const productos = await this.prisma.producto.findMany({
      where: {
        tenantId,
        activo: true,
      },
      include: {
        categoria: { select: { id: true, nombre: true } },
      },
      orderBy: { stockActual: 'asc' },
    });

    const lowStock = productos
      .filter((p) => p.stockActual <= p.stockMinimo)
      .map((p) => ({
        ...p,
        precioVenta: Number(p.precioVenta),
        precioCosto: Number(p.precioCosto),
        stockBajo: true,
      }));

    return lowStock;
  }

  async create(
    tenantId: string,
    dto: {
      codigo: string;
      codigoBarras?: string;
      nombre: string;
      descripcion?: string;
      categoriaId?: string;
      precioVenta: number;
      precioCosto: number;
      stockActual: number;
      stockMinimo: number;
      unidadMedida?: any;
    },
  ) {
    const existeCodigo = await this.prisma.producto.findUnique({
      where: {
        tenantId_codigo: {
          tenantId,
          codigo: dto.codigo.trim(),
        },
      },
    });

    if (existeCodigo) {
      throw new ConflictException(`Ya existe un producto con el código ${dto.codigo}`);
    }

    const p = await this.prisma.producto.create({
      data: {
        tenantId,
        codigo: dto.codigo.trim(),
        codigoBarras: dto.codigoBarras?.trim() || null,
        nombre: dto.nombre.trim(),
        descripcion: dto.descripcion,
        categoriaId: dto.categoriaId || null,
        precioVenta: dto.precioVenta,
        precioCosto: dto.precioCosto,
        stockActual: dto.stockActual,
        stockMinimo: dto.stockMinimo,
        unidadMedida: dto.unidadMedida || 'UNIDAD',
      },
      include: {
        categoria: { select: { id: true, nombre: true } },
      },
    });

    return {
      ...p,
      precioVenta: Number(p.precioVenta),
      precioCosto: Number(p.precioCosto),
      stockBajo: p.stockActual <= p.stockMinimo,
    };
  }

  async update(
    tenantId: string,
    id: string,
    dto: {
      codigo?: string;
      codigoBarras?: string;
      nombre?: string;
      descripcion?: string;
      categoriaId?: string;
      precioVenta?: number;
      precioCosto?: number;
      stockActual?: number;
      stockMinimo?: number;
      unidadMedida?: any;
    },
  ) {
    await this.findById(tenantId, id);

    const p = await this.prisma.producto.update({
      where: { id },
      data: {
        ...(dto.codigo && { codigo: dto.codigo.trim() }),
        ...(dto.codigoBarras !== undefined && { codigoBarras: dto.codigoBarras?.trim() || null }),
        ...(dto.nombre && { nombre: dto.nombre.trim() }),
        ...(dto.descripcion !== undefined && { descripcion: dto.descripcion }),
        ...(dto.categoriaId !== undefined && { categoriaId: dto.categoriaId || null }),
        ...(dto.precioVenta !== undefined && { precioVenta: dto.precioVenta }),
        ...(dto.precioCosto !== undefined && { precioCosto: dto.precioCosto }),
        ...(dto.stockActual !== undefined && { stockActual: dto.stockActual }),
        ...(dto.stockMinimo !== undefined && { stockMinimo: dto.stockMinimo }),
        ...(dto.unidadMedida && { unidadMedida: dto.unidadMedida }),
      },
      include: {
        categoria: { select: { id: true, nombre: true } },
      },
    });

    return {
      ...p,
      precioVenta: Number(p.precioVenta),
      precioCosto: Number(p.precioCosto),
      stockBajo: p.stockActual <= p.stockMinimo,
    };
  }

  async delete(tenantId: string, id: string) {
    await this.findById(tenantId, id);

    return this.prisma.producto.update({
      where: { id },
      data: { activo: false },
    });
  }
}
