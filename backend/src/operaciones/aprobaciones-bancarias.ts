import { BadRequestException, ConflictException } from '@nestjs/common';
import { id, query, type Tx } from './ledger';

// Autorizaciones bancarias de tarjeta y transferencia. Una venta o un abono con tarjeta/transferencia
// solo se confirma si lleva una referencia. Se guarda en la misma transacción que la operación: si la
// operación falla, la autorización tampoco queda registrada. Unicidad por empresa, método, terminal y
// referencia: una misma autorización no sirve para cobrar dos veces.

export const METODOS_ELECTRONICOS = ['TARJETA', 'TRANSFERENCIA'] as const;
export const esMetodoElectronico = (metodo: string) => (METODOS_ELECTRONICOS as readonly string[]).includes(metodo);

export interface AutorizacionBancaria { referencia?: string | null; terminal?: string | null }
export interface AutorizacionNormalizada { metodo: string; terminal: string; referencia: string }

// Valida y normaliza. Efectivo y crédito no llevan autorización; tarjeta y transferencia la exigen.
export function normalizarAutorizacion(metodo: string, pago: AutorizacionBancaria | null | undefined): AutorizacionNormalizada | null {
  if (!esMetodoElectronico(metodo)) {
    if (pago && (pago.referencia || pago.terminal)) throw new BadRequestException('Solo los pagos con tarjeta o transferencia llevan autorización bancaria');
    return null;
  }
  const referencia = (pago?.referencia ?? '').trim().toUpperCase();
  if (!/^[A-Z0-9-]{3,40}$/.test(referencia)) {
    throw new BadRequestException('Registre la autorización bancaria antes de confirmar el pago (3 a 40 letras o números)');
  }
  const terminal = metodo === 'TARJETA' ? (pago?.terminal ?? '').trim().toUpperCase() : '';
  if (metodo === 'TARJETA' && !/^[A-Z0-9-]{1,40}$/.test(terminal)) {
    throw new BadRequestException('Indique la terminal del POS bancario que aprobó el pago');
  }
  return { metodo, terminal, referencia };
}

// Registra la autorización. La comprobación previa se hace bajo lockTenant, así que no hay carrera.
export async function registrarAprobacion(tx: Tx, tenantId: string, usuarioId: string, aut: AutorizacionNormalizada,
  monto: number, origen: 'VENTA' | 'ABONO', origenId: string) {
  const [existente] = await query(tx,
    'SELECT origen, origen_id FROM aprobaciones_bancarias WHERE tenant_id=$1 AND metodo=$2 AND terminal=$3 AND referencia=$4',
    tenantId, aut.metodo, aut.terminal, aut.referencia);
  if (existente) throw new ConflictException('Esta autorización bancaria ya fue registrada en otra operación');
  const [fila] = await query(tx,
    'INSERT INTO aprobaciones_bancarias (id,tenant_id,metodo,terminal,referencia,monto,origen,origen_id,usuario_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id',
    id(), tenantId, aut.metodo, aut.terminal, aut.referencia, monto, origen, origenId, usuarioId);
  return fila.id as string;
}
