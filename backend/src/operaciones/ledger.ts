import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { withSupportIdentity } from '../common/support-context';
import type { Prisma } from '@prisma/client';
import { createHash, randomUUID } from 'node:crypto';

export type Tx = Prisma.TransactionClient;
export const id = () => randomUUID();
export const fingerprint = (data: unknown) => createHash('sha256').update(JSON.stringify(data)).digest('hex');
export const money = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
export function decimal(value: unknown, label: string, positive = false) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || (positive && n <= 0) || n > 9999999999.99 || Math.abs(n * 100 - Math.round(n * 100)) > 0.00001) {
    throw new BadRequestException(`${label}: use un valor ${positive ? 'mayor a cero' : 'no negativo'} con hasta dos decimales`);
  }
  return n;
}
export function text(value: unknown, label: string) {
  if (typeof value !== 'string' || !value.trim() || value.length > 500) throw new BadRequestException(`${label} es requerido`);
  return value.trim();
}
export const methods = ['EFECTIVO', 'TARJETA', 'TRANSFERENCIA'] as const;
export function paymentMethod(value: string) {
  if (!(methods as readonly string[]).includes(value)) throw new BadRequestException('Método de pago inválido');
  return value;
}
export async function query<T = any>(tx: Tx, sql: string, ...args: any[]): Promise<T[]> {
  // SQL is always a constant controlled by the application; all user values are bound parameters.
  return tx.$queryRawUnsafe<T[]>(sql, ...args);
}
export async function lockTenant(tx: Tx, tenantId: string) {
  await query(tx, 'SELECT 1 FROM pg_advisory_xact_lock(hashtextextended($1, 0))', `OPERACION:${tenantId}`);
}
export async function audit(tx: Tx, tenantId: string, usuarioId: string, operacion: string, entidadId: string, datos: unknown) {
  await query(tx, 'INSERT INTO auditoria_operaciones (id,tenant_id,usuario_id,operacion,entidad_id,datos) VALUES ($1,$2,$3,$4,$5,$6::jsonb) RETURNING id', id(), tenantId, usuarioId, operacion, entidadId, JSON.stringify(withSupportIdentity(datos)));
}
export async function movement(tx: Tx, tenantId: string, usuarioId: string, productoId: string, tipo: string, anterior: number, nuevo: number, documentoId: string, motivo: string) {
  await query(tx, 'INSERT INTO movimientos_inventario (id,tenant_id,usuario_id,producto_id,tipo,anterior,nuevo,cantidad,documento_id,motivo) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id', id(), tenantId, usuarioId, productoId, tipo, anterior, nuevo, money(nuevo - anterior), documentoId, motivo);
}
export async function actor(tx: Tx, tenantId: string, usuarioId: string) {
  const [user] = await query(tx, 'SELECT u.rol, u.permisos, u.permisos_configurados, u.descuento_maximo FROM usuarios u JOIN tenants t ON t.id=u.tenant_id WHERE u.id=$1 AND u.tenant_id=$2 AND u.activo=true AND t.estado=\'ACTIVO\'', usuarioId, tenantId);
  if (!user) throw new ForbiddenException('Usuario o empresa no disponible');
  return user;
}
// Call after lockTenant so revocation and the mutation share the same ordering.
export async function authorizedActor(tx: Tx, tenantId: string, usuarioId: string, roles: readonly string[], permission?: string) {
  const user = await actor(tx, tenantId, usuarioId);
  if (!roles.includes(user.rol)) throw new ForbiddenException('Su rol de usuario no tiene autorización para acceder a esta función');
  if (permission && user.rol !== 'ADMIN' && user.permisos_configurados && !user.permisos?.includes(permission)) {
    throw new ForbiddenException('No tiene el permiso requerido para esta operación');
  }
  return user;
}
export function validateDiscount(user: any, subtotal: number, descuento: number) {
  decimal(descuento, 'Descuento');
  if (descuento > subtotal) throw new BadRequestException('Descuento mayor al subtotal');
  if(descuento>0 && user.rol!=='ADMIN' && user.permisos_configurados && !user.permisos?.includes('pos.aplicar_descuento'))throw new ForbiddenException('No tiene permiso para aplicar descuentos');
  const limit = user.rol === 'ADMIN' ? 100 : Number(user.descuento_maximo || 0);
  if (descuento > money(subtotal * limit / 100)) throw new ForbiddenException('Descuento requiere autorización administrativa');
}
export async function openCash(tx: Tx, tenantId: string, usuarioId: string) {
  const [caja] = await query(tx, 'SELECT * FROM cajas WHERE tenant_id=$1 AND usuario_id=$2 AND estado=\'ABIERTA\' FOR UPDATE', tenantId, usuarioId);
  if (!caja) throw new ConflictException('Abra su caja antes de registrar ventas o pagos');
  return caja;
}
export async function cashMovement(tx: Tx, cajaId: string, usuarioId: string, tipo: string, monto: number, metodo: string, referencia: string, concepto: string) {
  await query(tx, 'INSERT INTO movimientos_caja (id,caja_id,usuario_id,tipo,monto,metodo,referencia,concepto) VALUES ($1,$2,$3,$4::"TipoMovimientoCaja",$5,$6,$7,$8) RETURNING id', id(), cajaId, usuarioId, tipo, monto, metodo, referencia, concepto);
}
export async function account(tx: Tx, tenantId: string, usuarioId: string, tipo: 'CXC' | 'CXP', documentoId: string, entityId: string, total: number, vencimiento?: string) {
  const accountId = id();
  await query(tx, 'INSERT INTO cuentas_operativas (id,tenant_id,usuario_id,tipo,documento_id,cliente_id,proveedor_id,monto,saldo,vencimiento) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$8,$9::timestamp) RETURNING id', accountId, tenantId, usuarioId, tipo, documentoId, tipo === 'CXC' ? entityId : null, tipo === 'CXP' ? entityId : null, total, vencimiento || null);
  return accountId;
}
