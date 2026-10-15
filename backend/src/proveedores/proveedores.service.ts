import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { audit, lockTenant } from '../operaciones/ledger';
import type { CreateProveedorDto, UpdateProveedorDto } from './dto/proveedor.dto';

const OPCIONALES = ['rtn', 'contacto', 'telefono', 'email', 'direccion'] as const;
const opcional = (valor: string | undefined) => (valor === undefined ? undefined : valor.trim() || null);
const resumen = (p: { nombre: string; rtn: string | null; contacto: string | null; telefono: string | null; email: string | null; direccion: string | null; activo: boolean }) =>
  ({ nombre: p.nombre, rtn: p.rtn, contacto: p.contacto, telefono: p.telefono, email: p.email, direccion: p.direccion, activo: p.activo });

@Injectable()
export class ProveedoresService {
  constructor(private readonly prisma: PrismaService) {}

  create(tenantId: string, dto: CreateProveedorDto) {
    const nombre = dto.nombre?.trim();
    if (!nombre) throw new BadRequestException('El nombre del proveedor es obligatorio');
    return this.prisma.proveedor.create({ data: {
      tenantId,
      nombre,
      ...Object.fromEntries(OPCIONALES.map((campo) => [campo, opcional(dto[campo]) ?? null])),
    } });
  }

  /** Activos por defecto; la administración puede listar también los desactivados para reactivarlos. */
  findAll(tenantId: string, incluirInactivos = false) {
    return this.prisma.proveedor.findMany({ where: { tenantId, ...(incluirInactivos ? {} : { activo: true }) }, orderBy: { nombre: 'asc' } });
  }

  async findById(tenantId: string, id: string) {
    const proveedor = await this.prisma.proveedor.findFirst({ where: { id, tenantId } });
    if (!proveedor) throw new NotFoundException('Proveedor no encontrado');
    return proveedor;
  }

  /** Edición y reactivación auditadas (PROVEEDOR_EDITAR / PROVEEDOR_REACTIVAR) en la misma transacción. */
  async update(tenantId: string, id: string, dto: UpdateProveedorDto, usuarioId: string) {
    if (dto.nombre !== undefined && !dto.nombre.trim()) throw new BadRequestException('El nombre del proveedor es obligatorio');
    if (dto.activo === false) throw new BadRequestException('Para desactivar el proveedor use la acción Desactivar');
    return this.prisma.$transaction(async (tx) => {
      await lockTenant(tx, tenantId);
      const anterior = await tx.proveedor.findFirst({ where: { id, tenantId } });
      if (!anterior) throw new NotFoundException('Proveedor no encontrado');
      const data = {
        ...(dto.nombre !== undefined ? { nombre: dto.nombre.trim() } : {}),
        ...Object.fromEntries(OPCIONALES.filter((campo) => dto[campo] !== undefined).map((campo) => [campo, opcional(dto[campo])])),
        ...(dto.activo === true ? { activo: true } : {}),
      };
      const actualizado = await tx.proveedor.update({ where: { id: anterior.id }, data });
      const reactivado = dto.activo === true && !anterior.activo;
      await audit(tx, tenantId, usuarioId, reactivado ? 'PROVEEDOR_REACTIVAR' : 'PROVEEDOR_EDITAR', id, { anterior: resumen(anterior), nuevo: resumen(actualizado) });
      return actualizado;
    });
  }

  /** Desactivación lógica e idempotente: se conservan compras, costos y cuentas por pagar del proveedor. */
  async deactivate(tenantId: string, id: string, usuarioId: string) {
    return this.prisma.$transaction(async (tx) => {
      await lockTenant(tx, tenantId);
      const anterior = await tx.proveedor.findFirst({ where: { id, tenantId } });
      if (!anterior) throw new NotFoundException('Proveedor no encontrado');
      if (!anterior.activo) return anterior;
      const actualizado = await tx.proveedor.update({ where: { id: anterior.id }, data: { activo: false } });
      await audit(tx, tenantId, usuarioId, 'PROVEEDOR_DESACTIVAR', id, { nombre: anterior.nombre });
      return actualizado;
    });
  }
}
