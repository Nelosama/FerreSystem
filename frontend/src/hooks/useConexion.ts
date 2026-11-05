import { useEffect, useState } from 'react';
import { contarVentasPorEnviar } from '../offline/journal';
import { useTenant } from '../context/TenantContext';

export interface EstadoConexion { enLinea: boolean; ventasPorEnviar: number; estadoLectura: 'cargando' | 'disponible' | 'error' }

/** Red y pendientes de la sesión. El último conteo nunca se comparte entre empresas, usuarios o roles. */
export function useConexion(): EstadoConexion {
  const { user, tenant, authStatus } = useTenant();
  const usuarioId = user?.id;
  const rol = user?.rol;
  const tenantId = tenant?.id;
  const autorizada = authStatus === 'ready' || authStatus === 'offline';
  const identidad = autorizada && usuarioId && tenantId && rol ? JSON.stringify([tenantId, usuarioId, rol]) : '';
  const [enLinea, setEnLinea] = useState(() => typeof navigator === 'undefined' ? true : navigator.onLine);
  const [lectura, setLectura] = useState<{ identidad: string; ventasPorEnviar: number; estadoLectura: EstadoConexion['estadoLectura'] }>({ identidad: '', ventasPorEnviar: 0, estadoLectura: 'cargando' });
  useEffect(() => {
    let vigente = true;
    let consulta = 0;
    const contar = () => {
      if (!identidad || !usuarioId || !tenantId || !rol) return;
      const actual = ++consulta;
      void contarVentasPorEnviar({ usuarioId, tenantId, rol }).then(n => {
        if (vigente && actual === consulta) setLectura({ identidad, ventasPorEnviar: n, estadoLectura: 'disponible' });
      }, () => {
        if (vigente && actual === consulta) setLectura(anterior => ({ identidad, ventasPorEnviar: anterior.identidad === identidad ? anterior.ventasPorEnviar : 0, estadoLectura: 'error' }));
      });
    };
    const enLineaAhora = () => { setEnLinea(true); contar(); };
    const sinRed = () => { setEnLinea(false); contar(); };
    contar();
    const intervalo = window.setInterval(contar, 30_000);
    window.addEventListener('online', enLineaAhora);
    window.addEventListener('offline', sinRed);
    return () => { vigente = false; window.clearInterval(intervalo); window.removeEventListener('online', enLineaAhora); window.removeEventListener('offline', sinRed); };
  }, [identidad, usuarioId, tenantId, rol]);
  if (!identidad || lectura.identidad !== identidad) return { enLinea, ventasPorEnviar: 0, estadoLectura: !user ? 'disponible' : 'cargando' };
  return { enLinea, ventasPorEnviar: lectura.ventasPorEnviar, estadoLectura: lectura.estadoLectura };
}
