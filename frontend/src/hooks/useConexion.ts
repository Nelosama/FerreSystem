import { useEffect, useState } from 'react';
import { contarVentasPorEnviar } from '../offline/journal';

export interface EstadoConexion { enLinea: boolean; ventasPorEnviar: number }

/** Estado de la red y ventas de contingencia guardadas en este equipo. Solo informa: no sincroniza. */
export function useConexion(): EstadoConexion {
  const [enLinea, setEnLinea] = useState(() => typeof navigator === 'undefined' ? true : navigator.onLine);
  const [ventasPorEnviar, setVentasPorEnviar] = useState(0);
  useEffect(() => {
    let vigente = true;
    const contar = () => { void contarVentasPorEnviar().then(n => { if (vigente) setVentasPorEnviar(n); }); };
    const enLineaAhora = () => { setEnLinea(true); contar(); };
    const sinRed = () => { setEnLinea(false); contar(); };
    contar();
    const intervalo = window.setInterval(contar, 30_000);
    window.addEventListener('online', enLineaAhora);
    window.addEventListener('offline', sinRed);
    return () => { vigente = false; window.clearInterval(intervalo); window.removeEventListener('online', enLineaAhora); window.removeEventListener('offline', sinRed); };
  }, []);
  return { enLinea, ventasPorEnviar };
}
