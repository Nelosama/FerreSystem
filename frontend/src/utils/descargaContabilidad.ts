import { api } from './api';
import { nombreExportacion, type FormatoDescarga } from './contabilidad';

/** Pide al servidor el archivo del reporte y lo descarga. Devuelve el nombre del archivo; los errores los maneja quien llama. */
export async function descargarReporte(reporte: string, formato: FormatoDescarga, periodo: { anio: number; mes: number }, direccion?: string, cuentaId?: string): Promise<string> {
  const alcance = reporte === 'catalogo' || reporte === 'periodos' ? `anio=${periodo.anio}` : `anio=${periodo.anio}&mes=${periodo.mes}`;
  const nombre = nombreExportacion(reporte, periodo.anio, periodo.mes, formato);
  const res = await api.get(`/contabilidad/exportar/${reporte}?${alcance}&formato=${formato}${direccion ? `&direccion=${direccion}` : ''}${cuentaId ? `&cuentaId=${encodeURIComponent(cuentaId)}` : ''}`, { responseType: 'blob' });
  const url = URL.createObjectURL(res.data as Blob);
  const a = document.createElement('a');
  a.href = url; a.download = nombre;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return nombre;
}
