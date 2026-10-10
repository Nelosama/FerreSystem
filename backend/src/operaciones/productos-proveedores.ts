import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { audit, authorizedActor, id, lockTenant, query, type Tx } from './ledger';
import type { ProductoProveedorDto } from './operaciones.dto';

// Relación producto–proveedor (tabla productos_proveedores). Consultar: ADMIN y BODEGUERO con inventario.ver.
// Cambiar: ADMIN y BODEGUERO con inventario.editar. Los costos reales siguen en costos_compra.
const ROLES_INVENTARIO = ['ADMIN', 'BODEGUERO'] as const;

async function productoDelTenant(db: Tx, tenantId: string, productoId: string) {
  const [producto] = await query(db, 'SELECT id FROM productos WHERE id=$1 AND tenant_id=$2', productoId, tenantId);
  if (!producto) throw new NotFoundException('Producto no encontrado');
}

export async function listarProveedoresProducto(prisma: PrismaService, tenantId: string, productoId: string) {
  await productoDelTenant(prisma as unknown as Tx, tenantId, productoId);
  const filas = await query(prisma as unknown as Tx,
    `SELECT pp.id, pp.proveedor_id, p.nombre AS proveedor_nombre, pp.codigo_proveedor, pp.es_preferido,
            pp.ultimo_costo, pp.ultima_compra_at, pp.updated_at
       FROM productos_proveedores pp JOIN proveedores p ON p.id = pp.proveedor_id
      WHERE pp.tenant_id=$1 AND pp.producto_id=$2
      ORDER BY pp.es_preferido DESC, p.nombre`,
    tenantId, productoId);
  // Los importes llegan como texto desde $queryRawUnsafe; se devuelven como número.
  return filas.map(fila => ({ ...fila, ultimo_costo: fila.ultimo_costo === null ? null : Number(fila.ultimo_costo) }));
}

// Llamado dentro de la transacción de recepción (recibir): el proveedor que surtió queda asociado y su
// último costo recibido queda como costo de referencia. El costo vigente del producto no cambia aquí.
export async function registrarCostoProveedor(tx: Tx, tenantId: string, userId: string, productoId: string,
  proveedorId: string, costo: number, fecha: Date) {
  await query(tx,
    `INSERT INTO productos_proveedores (id,tenant_id,producto_id,proveedor_id,es_preferido,ultimo_costo,ultima_compra_at,creado_por,actualizado_por,updated_at)
     VALUES ($1,$2,$3,$4,false,$5,$6,$7,$7,NOW())
     ON CONFLICT (tenant_id,producto_id,proveedor_id) DO UPDATE SET
       ultimo_costo=EXCLUDED.ultimo_costo, ultima_compra_at=EXCLUDED.ultima_compra_at,
       actualizado_por=EXCLUDED.actualizado_por, updated_at=NOW()
     RETURNING id`,
    id(), tenantId, productoId, proveedorId, costo, fecha, userId);
}

// Alta o cambio de la asociación. Reemplaza código del proveedor y preferencia; no toca el último costo.
// Idempotente: repetir la misma llamada no crea filas nuevas ni cambia el resultado.
export async function guardarVinculoProveedor(prisma: PrismaService, tenantId: string, userId: string,
  productoId: string, proveedorId: string, dto: ProductoProveedorDto) {
  return prisma.$transaction(async tx => {
    await lockTenant(tx, tenantId);
    await authorizedActor(tx, tenantId, userId, ROLES_INVENTARIO, 'inventario.editar');
    await productoDelTenant(tx, tenantId, productoId);
    const [proveedor] = await query(tx, 'SELECT id, activo FROM proveedores WHERE id=$1 AND tenant_id=$2', proveedorId, tenantId);
    if (!proveedor) throw new NotFoundException('Proveedor no encontrado');
    if (!proveedor.activo) throw new BadRequestException('El proveedor está inactivo');
    const codigo = dto.codigoProveedor?.trim() || null;
    const [anterior] = await query(tx,
      'SELECT codigo_proveedor, es_preferido FROM productos_proveedores WHERE tenant_id=$1 AND producto_id=$2 AND proveedor_id=$3',
      tenantId, productoId, proveedorId);
    // Un producto tiene como máximo un proveedor preferido: se quita el anterior antes de marcar el nuevo.
    if (dto.esPreferido) {
      await query(tx,
        'UPDATE productos_proveedores SET es_preferido=false, actualizado_por=$4, updated_at=NOW() WHERE tenant_id=$1 AND producto_id=$2 AND proveedor_id<>$3 AND es_preferido RETURNING id',
        tenantId, productoId, proveedorId, userId);
    }
    const [vinculo] = await query(tx,
      `INSERT INTO productos_proveedores (id,tenant_id,producto_id,proveedor_id,codigo_proveedor,es_preferido,creado_por,actualizado_por,updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$7,NOW())
       ON CONFLICT (tenant_id,producto_id,proveedor_id) DO UPDATE SET
         codigo_proveedor=EXCLUDED.codigo_proveedor, es_preferido=EXCLUDED.es_preferido,
         actualizado_por=EXCLUDED.actualizado_por, updated_at=NOW()
       RETURNING id`,
      id(), tenantId, productoId, proveedorId, codigo, dto.esPreferido, userId);
    await audit(tx, tenantId, userId, 'PRODUCTO_PROVEEDOR_GUARDAR', vinculo.id, {
      productoId, proveedorId, codigoProveedor: codigo, esPreferido: dto.esPreferido,
      anterior: anterior ? { codigoProveedor: anterior.codigo_proveedor, esPreferido: anterior.es_preferido } : null,
    });
    return listarProveedoresProducto(tx as unknown as PrismaService, tenantId, productoId);
  });
}

export async function eliminarVinculoProveedor(prisma: PrismaService, tenantId: string, userId: string,
  productoId: string, proveedorId: string) {
  return prisma.$transaction(async tx => {
    await lockTenant(tx, tenantId);
    await authorizedActor(tx, tenantId, userId, ROLES_INVENTARIO, 'inventario.editar');
    const [borrado] = await query(tx,
      'DELETE FROM productos_proveedores WHERE tenant_id=$1 AND producto_id=$2 AND proveedor_id=$3 RETURNING id, codigo_proveedor, es_preferido, ultimo_costo',
      tenantId, productoId, proveedorId);
    if (!borrado) throw new NotFoundException('El proveedor no está asociado a este producto');
    await audit(tx, tenantId, userId, 'PRODUCTO_PROVEEDOR_ELIMINAR', borrado.id, {
      productoId, proveedorId, codigoProveedor: borrado.codigo_proveedor, esPreferido: borrado.es_preferido,
      ultimoCosto: borrado.ultimo_costo === null ? null : Number(borrado.ultimo_costo),
    });
    return { success: true };
  });
}
