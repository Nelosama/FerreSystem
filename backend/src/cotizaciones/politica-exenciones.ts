import { ForbiddenException } from '@nestjs/common';
import { audit } from '../operaciones/ledger';

/**
 * Política provisional de exenciones de línea (T6, docs/AUDITORIA_EXENCIONES_T6.md).
 *
 * Qué es exento (D3) y quién puede autorizarlo (D5) son decisiones del contador y del dueño, y no existen todavía.
 * Mientras no se decidan, ninguna exención puede concederse: ni VENDEDOR, ni CAJERO, ni ADMIN, y tampoco al convertir una
 * cotización que ya la tenga. La operación concreta queda bloqueada; las ventas gravadas siguen igual.
 *
 * Cada intento bloqueado se registra en auditoría (usuario, empresa, documento y producto), también cuando la operación
 * después falla: el registro se escribe fuera de la transacción de la operación.
 */
export const EXENCIONES_HABILITADAS = false;
export const MOTIVO_EXENCION_BLOQUEADA = 'DECISION_FISCAL_PENDIENTE';
export const MENSAJE_EXENCION_BLOQUEADA = 'Las exenciones de línea están bloqueadas hasta la decisión fiscal del contador y del dueño. Venda la línea gravada.';

export type IntentoExencion = 'CREAR' | 'EDITAR' | 'CONVERTIR';

/** Lanza 403 si alguna línea pide exención y la política no la permite. `db` puede ser el cliente Prisma. */
export async function exigirSinExencion(
  db: any,
  tenantId: string,
  usuarioId: string,
  intento: IntentoExencion,
  documentoId: string | null,
  lineas: { productoId: string; exento?: boolean }[],
) {
  const exentas = (Array.isArray(lineas) ? lineas : []).filter((linea) => linea?.exento === true);
  if (EXENCIONES_HABILITADAS || exentas.length === 0) return;
  await audit(db, tenantId, usuarioId, 'EXENCION_BLOQUEADA', documentoId ?? 'NUEVA_COTIZACION', {
    intento,
    motivo: MOTIVO_EXENCION_BLOQUEADA,
    lineas: exentas.length,
    productoIds: exentas.map((linea) => linea.productoId),
  });
  throw new ForbiddenException(MENSAJE_EXENCION_BLOQUEADA);
}
