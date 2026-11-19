import { ConflictException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { idSolicitud, query, validarSolicitud, type Tx } from '../operaciones/ledger';
import { withSupportIdentity } from './support-context';

/**
 * A-02 (evaluación de producción del 2026-11-16): altas idempotentes de clientes y cotizaciones.
 *
 * Reutiliza el contrato de las demás altas de Jowa (`solicitudId` UUID v4 opcional, misma clave y mismo contenido →
 * mismo registro, misma clave con otro contenido → 409) sin cambiar el esquema:
 * - El identificador del registro se deriva de la empresa, del tipo de operación y de la clave (`idSolicitud`, el mismo
 *   derivador de ventas, devoluciones e ítems de levantamiento). La clave primaria garantiza en PostgreSQL que un mismo
 *   reintento no crea dos filas, también con peticiones simultáneas. Dos empresas, o dos operaciones distintas de la
 *   misma empresa, con la misma clave obtienen identificadores distintos y no se ven entre sí.
 * - La huella del contenido y el usuario se guardan en `auditoria_operaciones` en la misma transacción que el alta
 *   (como `PRODUCTO_CREAR`). Solo se consulta cuando el registro ya existe, es decir, en un reintento.
 * Sin `solicitudId` el alta se comporta exactamente como antes.
 */
export type OperacionAlta = 'CLIENTE_CREAR' | 'COTIZACION_CREAR' | 'COTIZACION_DUPLICAR';

export const MENSAJE_CLAVE_REUTILIZADA = 'La clave de solicitud ya se usó con otros datos: inicie la operación de nuevo';

/** Identificador del registro que crea la solicitud `solicitudId` de la operación `operacion` en la empresa. */
export function idAlta(tenantId: string, operacion: OperacionAlta, solicitudId: string): string {
  return idSolicitud(tenantId, `${operacion}:${validarSolicitud(solicitudId)}`);
}

/** JSON con claves ordenadas en todos los niveles; las propiedades `undefined` se omiten (como en `JSON.stringify`). */
function jsonEstable(valor: unknown): string {
  if (valor === null || typeof valor !== 'object') return JSON.stringify(valor ?? null);
  if (Array.isArray(valor)) return `[${valor.map((v) => (v === undefined ? 'null' : jsonEstable(v))).join(',')}]`;
  const objeto = valor as Record<string, unknown>;
  return `{${Object.keys(objeto).filter((k) => objeto[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${jsonEstable(objeto[k])}`).join(',')}}`;
}

/** Huella del contenido de la solicitud, sin la clave. El tipo de operación forma parte de la huella. */
export function huellaAlta(operacion: OperacionAlta, contenido: Record<string, unknown>): string {
  const { solicitudId: _clave, ...resto } = contenido;
  return createHash('sha256').update(jsonEstable({ operacion, contenido: resto })).digest('hex');
}

/** Registra la huella del alta en la misma transacción que crea el registro (con la identidad de soporte, como `audit`). */
export async function registrarAlta(tx: Tx, tenantId: string, usuarioId: string, operacion: OperacionAlta, entidadId: string, solicitudId: string, solicitudHash: string, datos: Record<string, unknown> = {}) {
  await query(tx, 'INSERT INTO auditoria_operaciones (id,tenant_id,usuario_id,operacion,entidad_id,datos) VALUES (gen_random_uuid()::text,$1,$2,$3,$4,$5::jsonb) RETURNING id',
    tenantId, usuarioId, operacion, entidadId, JSON.stringify(withSupportIdentity({ ...datos, solicitudId, solicitudHash })));
}

/**
 * Busca un alta anterior con la misma clave en la misma empresa y operación. Devuelve su identificador si el reintento
 * coincide (mismo usuario y mismo contenido), `null` si la clave no se ha usado y 409 si se usó con otros datos.
 */
export async function altaPrevia(db: Tx, tenantId: string, usuarioId: string, operacion: OperacionAlta, solicitudId: string, solicitudHash: string): Promise<string | null> {
  const entidadId = idAlta(tenantId, operacion, solicitudId);
  const [previa] = await query<{ usuario_id: string; datos: any }>(db,
    'SELECT usuario_id, datos FROM auditoria_operaciones WHERE tenant_id=$1 AND operacion=$2 AND entidad_id=$3 ORDER BY created_at ASC LIMIT 1',
    tenantId, operacion, entidadId);
  if (!previa) return null;
  if (previa.usuario_id !== usuarioId || previa.datos?.solicitudId !== solicitudId || previa.datos?.solicitudHash !== solicitudHash) {
    throw new ConflictException(MENSAJE_CLAVE_REUTILIZADA);
  }
  return entidadId;
}

/** Violación de la clave primaria `id` (dos peticiones simultáneas con la misma clave). */
export function esChoqueDeId(error: any): boolean {
  if (error?.code !== 'P2002') return false;
  const objetivo = JSON.stringify(error?.meta?.target ?? '') + String(error?.meta?.constraint ?? '');
  return /"id"|\bid\b|_pkey/.test(objetivo);
}
