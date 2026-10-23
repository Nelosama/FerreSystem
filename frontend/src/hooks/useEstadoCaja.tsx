import React, { createContext, useContext, useState } from 'react';
import { useAutoRefresh } from './useAutoRefresh';
import { api } from '../utils/api';
import { useTenant } from '../context/TenantContext';

/** Estado visible de la caja. Solo «abierta» o «cerrada» tras una respuesta válida del servidor. */
export type EstadoCaja = 'abierta' | 'cerrada' | 'sin_verificar';

interface LecturaCaja { clave: string; estado: 'abierta' | 'cerrada' }
interface ValorCaja { estado: EstadoCaja; fase: string }

// Mismos roles que GET /operaciones/caja.
const ROLES_CON_CAJA = ['ADMIN', 'CAJERO', 'VENDEDOR'];

// Null significa «fuera del proveedor»: la barra superior no muestra el estado.
const CajaContext = createContext<ValorCaja | null>(null);

/** Una sola consulta periódica por pantalla; la barra superior y el POS leen el mismo valor. */
export const CajaProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, tenant } = useTenant();
  const habilitado = !!user && ROLES_CON_CAJA.includes(user.rol) && (!tenant.modulosHabilitados || tenant.modulosHabilitados.includes('arqueo_caja'));
  // La lectura solo vale para el mismo usuario, negocio y sucursal: al cambiar cualquiera se descarta.
  const clave = `${tenant.id}|${user?.id ?? ''}|${tenant.sucursal ?? ''}`;
  const [lectura, setLectura] = useState<LecturaCaja | null>(null);
  const { sync } = useAutoRefresh<unknown>({
    load: signal => api.get('/operaciones/caja', { signal }).then(r => r.data),
    apply: datos => {
      if (!Array.isArray(datos)) return;
      setLectura({ clave, estado: datos.some((c: { estado?: string }) => c.estado === 'ABIERTA') ? 'abierta' : 'cerrada' });
    },
    intervalMs: 30_000,
    enabled: habilitado,
    deps: [clave],
  });

  if (!habilitado) return <CajaContext.Provider value={null}>{children}</CajaContext.Provider>;
  const vigente = lectura?.clave === clave && sync.phase !== 'error' && sync.phase !== 'offline';
  const valor: ValorCaja = { estado: vigente && lectura ? lectura.estado : 'sin_verificar', fase: sync.phase };
  return <CajaContext.Provider value={valor}>{children}</CajaContext.Provider>;
};

export function useEstadoCaja(): ValorCaja | null {
  return useContext(CajaContext);
}
