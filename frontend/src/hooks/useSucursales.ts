import { useTenant } from '../context/TenantContext';
export interface Sucursal { id: string; nombre: string; }
// Una etiqueta local no equivale a cambiar el ámbito de datos autorizado por el servidor.
export function useSucursales(): Sucursal[] {
  const { tenant } = useTenant();
  return [{ id: tenant.id, nombre: tenant.sucursal || 'Sucursal Principal' }];
}
