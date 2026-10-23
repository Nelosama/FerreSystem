import type { NavigationItem } from '../config/navigation';
import type { UserInfo } from '../types';

/**
 * Accesos que la interfaz móvil del administrador no ofrece: ventas y facturación (POS, apartados, pedidos especiales),
 * cobros y pagos (cuentas), devoluciones y cierres de caja. La experiencia móvil es de consulta, supervisión e inventario.
 * Es una regla de presentación: la autorización real de cada ruta sigue siendo la del rol, los permisos y los módulos
 * (frontend y backend), y no cambia.
 */
export const ACCESOS_NO_MOVILES_ADMIN: ReadonlySet<string> = new Set([
  'pos', 'apartados', 'pedidos_especiales', 'devoluciones', 'arqueo_caja', 'cuentas',
]);

/** Quita los accesos operativos cuando un ADMIN usa la interfaz móvil; en cualquier otro caso devuelve la lista intacta. */
export function filtrarAccesosMovilAdmin<T extends Pick<NavigationItem, 'key'>>(items: T[], user: Pick<UserInfo, 'rol'> | null, movil: boolean): T[] {
  return movil && user?.rol === 'ADMIN' ? items.filter(item => !ACCESOS_NO_MOVILES_ADMIN.has(item.key)) : items;
}
