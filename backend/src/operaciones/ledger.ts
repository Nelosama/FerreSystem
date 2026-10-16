import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { withSupportIdentity } from '../common/support-context';
import type { Prisma } from '@prisma/client';
import { createHash, randomUUID } from 'node:crypto';
import { aCentavos } from '../common/redondeo-monetario';

export type Tx = Prisma.TransactionClient;
export const id = () => randomUUID();
/**
 * Identificador interno de una solicitud idempotente, derivado de la empresa y de la solicitud.
 * Los registros cuyo identificador era la propia solicitud usan este valor, de modo que dos empresas puedan
 * usar el mismo UUID sin chocar y sin que una respuesta delate que otra empresa ya lo usó.
 *
 * Los 12 últimos dígitos son una etiqueta de los 20 primeros: así un identificador interno se reconoce
 * (`esIdInterno`) y no puede presentarse como solicitud nueva. Un UUID v4 aleatorio de un cliente coincide
 * por azar con probabilidad 2^-48.
 */
const etiquetaInterna = (cuerpo20: string) => createHash('sha256').update(`ferresystem:id-interno:v1:${cuerpo20}`).digest('hex').slice(0, 12);
function derivar(tenantId: string, solicitudId: string): string {
  const h = createHash('sha256').update(`ferresystem:solicitud:v1:${tenantId}:${solicitudId}`).digest('hex');
  const variante = ((parseInt(h.slice(16, 18), 16) & 0x3f) | 0x80).toString(16).padStart(2, '0');
  const cuerpo = `${h.slice(0, 8)}${h.slice(8, 12)}4${h.slice(13, 16)}${variante}${h.slice(18, 20)}`;
  const crudo = `${cuerpo}${etiquetaInterna(cuerpo)}`;
  return `${crudo.slice(0, 8)}-${crudo.slice(8, 12)}-${crudo.slice(12, 16)}-${crudo.slice(16, 20)}-${crudo.slice(20, 32)}`;
}
export function esIdInterno(valor: unknown): boolean {
  if (typeof valor !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(valor)) return false;
  const plano = valor.replaceAll('-', '');
  return etiquetaInterna(plano.slice(0, 20)) === plano.slice(20);
}
/** Una solicitud nueva nunca puede ser un identificador interno (P3 de CENTINELA). */
export function validarSolicitud(solicitudId: string): string {
  if (esIdInterno(solicitudId)) throw new BadRequestException('Identificador de solicitud no válido: genere uno nuevo');
  return solicitudId;
}
/** Identificador interno para crear o reconocer el registro de una solicitud de esta empresa. */
export function idSolicitud(tenantId: string, solicitudId: string): string {
  return derivar(tenantId, validarSolicitud(solicitudId));
}
/**
 * Para buscar por solicitud: el identificador derivado y el crudo. El crudo solo corresponde a registros
 * anteriores al cambio. Siempre con filtro de empresa.
 */
export const candidatosSolicitud = (tenantId: string, solicitudId: string): [string, string] => [idSolicitud(tenantId, solicitudId), solicitudId];
/**
 * Para rutas de recurso (`/solicitudes-devolucion/:id`): acepta la solicitud original o el identificador
 * del recurso que devolvió la lista. El resultado se usa con `IN ($derivado, $crudo)` y filtro de empresa.
 */
export const idRecurso = (tenantId: string, valor: string): string => (esIdInterno(valor) ? valor : derivar(tenantId, valor));
export const fingerprint = (data: unknown) => createHash('sha256').update(JSON.stringify(data)).digest('hex');
export const money = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
export function decimal(value: unknown, label: string, positive = false) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || (positive && n <= 0) || n > 9999999999.99 || Math.abs(n - Number(n.toFixed(2))) > 0.0000001) {
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
  const result = await (tx as any).$queryRawUnsafe(sql, ...args);
  return result as T[];
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
  // Comparación exacta en centavos: el máximo permitido es el porcentaje (en centésimas de punto) aplicado al subtotal.
  const subtotalCentavos = aCentavos(subtotal, 'Subtotal');
  const descuentoCentavos = aCentavos(descuento, 'Descuento');
  if (descuentoCentavos > subtotalCentavos) throw new BadRequestException('Descuento mayor al subtotal');
  if(descuentoCentavos>0 && user.rol!=='ADMIN' && user.permisos_configurados && !user.permisos?.includes('pos.aplicar_descuento'))throw new ForbiddenException('No tiene permiso para aplicar descuentos');
  const limit = user.rol === 'ADMIN' ? 100 : Number(user.descuento_maximo || 0);
  const numerador = BigInt(subtotalCentavos) * BigInt(Math.round(limit * 100));
  const maximoCentavos = Number((numerador * 2n + 10000n) / 20000n);
  if (descuentoCentavos > maximoCentavos) throw new ForbiddenException('Descuento requiere autorización administrativa');
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
