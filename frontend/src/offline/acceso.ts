import type { OperacionLocal } from './journal';
import type { VentanaLocal } from './ventana';

// Acceso al diario de contingencia según la sesión (P1-3 y P1-4 de AUDITORIA_OFFLINE_ALMACENAMIENTO_20261104).
// El almacén local es uno por navegador: este módulo decide qué operaciones puede ver, reimprimir o exportar la sesión.
// No borra, no reescribe ni oculta de forma irreversible: lo que no es visible sigue en IndexedDB y se sincroniza igual.

export interface SesionDiario { usuarioId: string; rol: string; tenantId: string }

/** Operación tal como se guarda desde esta versión: con la empresa que la emitió (las anteriores no la tienen). */
export type OperacionConEmpresa = OperacionLocal & { tenantId?: string };

/** Roles que pueden abrir el diario de contingencia. VENDEDOR y los demás no reciben ventana en el servidor. */
export const ROLES_DIARIO = ['ADMIN', 'CAJERO'] as const;

export const puedeAbrirDiario = (rol: string | undefined) => !!rol && (ROLES_DIARIO as readonly string[]).includes(rol);

/**
 * Empresa de una operación. Desde esta versión se guarda en el registro. Para registros anteriores se deduce solo con
 * evidencia: la ventana local que la emitió. Si no hay evidencia devuelve `undefined` (empresa desconocida).
 */
export function empresaDeOperacion(op: OperacionConEmpresa, ventana: Pick<VentanaLocal, 'ventanaId' | 'tenantId'> | null | undefined): string | undefined {
  if (typeof op.tenantId === 'string' && op.tenantId) return op.tenantId;
  if (ventana?.tenantId && op.ventanaId === ventana.ventanaId) return ventana.tenantId;
  return undefined;
}

/**
 * ¿Puede la sesión ver y reimprimir la operación?
 * - CAJERO: solo las suyas. El id de usuario es único en todo el sistema, así que también identifica su empresa;
 *   si el registro declara otra empresa, prevalece la empresa y no se muestra.
 * - ADMIN: las de su empresa y las suyas. Las de empresa desconocida de otros usuarios no se muestran (no hay evidencia).
 * - Cualquier otro rol: ninguna.
 */
export function puedeVerOperacion(op: OperacionConEmpresa, sesion: SesionDiario, ventana?: Pick<VentanaLocal, 'ventanaId' | 'tenantId'> | null): boolean {
  if (!puedeAbrirDiario(sesion.rol) || !sesion.tenantId || !sesion.usuarioId) return false;
  const empresa = empresaDeOperacion(op, ventana);
  if (empresa !== undefined && empresa !== sesion.tenantId) return false;
  if (op.cajeroId === sesion.usuarioId) return true;
  return sesion.rol === 'ADMIN' && empresa === sesion.tenantId;
}

export interface DiarioVisible { visibles: OperacionLocal[]; noVisibles: number }

/** Separa lo visible para la sesión del resto. Del resto solo se informa la cantidad: sin nombres, RTN ni importes. */
export function diarioVisible(ops: OperacionLocal[], sesion: SesionDiario | null, ventana?: Pick<VentanaLocal, 'ventanaId' | 'tenantId'> | null): DiarioVisible {
  if (!sesion) return { visibles: [], noVisibles: ops.length };
  const visibles = ops.filter((op) => puedeVerOperacion(op, sesion, ventana));
  return { visibles, noVisibles: ops.length - visibles.length };
}

/** Exportación del diario limitada a lo visible. No incluye tokens ni credenciales. */
export function exportarDiarioVisible(visibles: OperacionLocal[], dispositivo: unknown, sesion: SesionDiario, ahora = new Date()): string {
  return JSON.stringify({
    version: 1, exportadoAt: ahora.toISOString(), alcance: { tenantId: sesion.tenantId, usuarioId: sesion.usuarioId, rol: sesion.rol },
    dispositivo: dispositivo ?? null, operaciones: visibles,
  }, null, 2);
}
