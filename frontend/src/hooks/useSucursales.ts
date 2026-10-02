import { useMemo } from 'react';
import { useTenant } from '../context/TenantContext';

export interface Sucursal {
  id: string;
  nombre: string;
}

export function useSucursales(): Sucursal[] {
  const { tenant } = useTenant();

  return useMemo(() => {
    const defaultList: Sucursal[] = [
      { id: 'suc-1', nombre: 'Sucursal Centro (Principal)' },
      { id: 'suc-2', nombre: 'Sucursal San Pedro (Norte)' },
      { id: 'suc-3', nombre: 'Sucursal Choluteca (Sur)' },
    ];

    const saasTenantsRaw = localStorage.getItem('ferre_saas_tenants');
    if (saasTenantsRaw) {
      try {
        const saasTenants = JSON.parse(saasTenantsRaw);
        const match = saasTenants.find(
          (t: any) => t.id === tenant.id || t.nombreComercial === tenant.nombreComercial,
        );
        if (match && match.sucursalesList && match.sucursalesList.length > 0) {
          return match.sucursalesList.map((s: any) => ({
            id: s.id,
            nombre: s.nombre,
          }));
        }
      } catch (e) {
        // Fallback
      }
    }
    return defaultList;
  }, [tenant.id, tenant.nombreComercial]);
}
