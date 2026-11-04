import { useEffect, useState } from 'react';
import { contarVentasPorEnviar } from '../offline/journal';

export interface EstadoConexion { enLinea: boolean; ventasPorEnviar: number; estadoLectura: 'cargando' | 'disponible' | 'error' }

/** Estado de la red y ventas de contingencia guardadas en este equipo. Solo informa: no sincroniza. */
export function useConexion(): EstadoConexion {
  const [enLinea, setEnLinea] = useState(() => typeof navigator === 'undefined' ? true : navigator.onLine);
  const [ventasPorEnviar, setVentasPorEnviar] = useState(0);
  const [estadoLectura, setEstadoLectura] = useState<EstadoConexion['estadoLectura']>('cargando');
  useEffect(() => {
    let vigente = true;
    let consulta = 0;
    const contar = () => {
      const actual = ++consulta;
      void contarVentasPorEnviar().then(n => {
        if (vigente && actual === consulta) { setVentasPorEnviar(n); setEstadoLectura('disponible'); }
      }, () => {
        if (vigente && actual === consulta) setEstadoLectura('error');
      });
    };
    const enLineaAhora = () => { setEnLinea(true); contar(); };
    const sinRed = () => { setEnLinea(false); contar(); };
    contar();
    const intervalo = window.setInterval(contar, 30_000);
    window.addEventListener('online', enLineaAhora);
    window.addEventListener('offline', sinRed);
    return () => { vigente = false; window.clearInterval(intervalo); window.removeEventListener('online', enLineaAhora); window.removeEventListener('offline', sinRed); };
  }, []);
  return { enLinea, ventasPorEnviar, estadoLectura };
}
