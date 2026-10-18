import { useState } from 'react';
import { useAutoRefresh } from './useAutoRefresh';
import { api } from '../utils/api';
import { useTenant } from '../context/TenantContext';

export type EstadoCajaVisible = 'abierta' | 'cerrada' | 'desconocida';

// Mismos roles que GET /operaciones/caja. Sin red o con error se muestra «desconocida», nunca «cerrada».
const ROLES_CON_CAJA = ['ADMIN', 'CAJERO', 'VENDEDOR'];

export function useEstadoCaja(): EstadoCajaVisible | null {
  const { user, tenant } = useTenant();
  const habilitado = !!user && ROLES_CON_CAJA.includes(user.rol);
  const [estado, setEstado] = useState<'abierta' | 'cerrada'>('cerrada');
  const { sync } = useAutoRefresh<any[]>({
    load: signal => api.get('/operaciones/caja', { signal }).then(r => r.data),
    apply: datos => setEstado(Array.isArray(datos) && datos.some((c: any) => c.estado === 'ABIERTA') ? 'abierta' : 'cerrada'),
    intervalMs: 30_000,
    enabled: habilitado,
    deps: [tenant.id, user?.id],
  });
  if (!habilitado) return null;
  if (sync.phase === 'error' || sync.phase === 'offline') return 'desconocida';
  return estado;
}
