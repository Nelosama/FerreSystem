// Pendientes del inicio: respuesta de GET /dashboard/pendientes (backend/src/dashboard/pendientes.ts).
// El servidor decide qué indicadores ve cada usuario (rol, permisos y módulos); aquí solo se validan y presentan.

export type ClavePendiente =
  | 'contingencia_revision'
  | 'precios_pendientes'
  | 'entregas_pendientes'
  | 'cotizaciones_vencen_hoy'
  | 'stock_bajo_minimo';

export interface IndicadorPendiente {
  clave: ClavePendiente;
  cantidad: number;
  ruta: string;
  alcance: 'NEGOCIO' | 'PROPIAS';
}

export const CLAVES_PENDIENTES: readonly ClavePendiente[] = [
  'contingencia_revision', 'precios_pendientes', 'entregas_pendientes', 'cotizaciones_vencen_hoy', 'stock_bajo_minimo',
];

/** Rutas que el servidor puede indicar para cada clave. Una ruta inesperada invalida el indicador. */
const RUTAS: Record<ClavePendiente, string> = {
  contingencia_revision: '/contingencia-admin',
  precios_pendientes: '/precios',
  entregas_pendientes: '/entregas',
  cotizaciones_vencen_hoy: '/cotizaciones',
  stock_bajo_minimo: '/inventario',
};

/**
 * Valida la respuesta. Si no tiene la forma esperada lanza un error: el inicio lo muestra como fallo,
 * nunca como «sin pendientes». Un indicador individual malformado se descarta (no se inventa un cero).
 */
export function normalizarPendientes(raw: unknown): IndicadorPendiente[] {
  const lista = (raw as { indicadores?: unknown } | null)?.indicadores;
  if (!Array.isArray(lista)) throw new Error('Respuesta de pendientes no válida');
  const vistos = new Set<string>();
  const resultado: IndicadorPendiente[] = [];
  for (const item of lista) {
    const { clave, cantidad, ruta, alcance } = (item ?? {}) as Record<string, unknown>;
    if (!CLAVES_PENDIENTES.includes(clave as ClavePendiente) || vistos.has(clave as string)) continue;
    if (typeof cantidad !== 'number' || !Number.isInteger(cantidad) || cantidad < 0) continue;
    if (ruta !== RUTAS[clave as ClavePendiente]) continue;
    vistos.add(clave as string);
    resultado.push({ clave: clave as ClavePendiente, cantidad, ruta, alcance: alcance === 'PROPIAS' ? 'PROPIAS' : 'NEGOCIO' });
  }
  return resultado;
}

export type EstadoPendientes =
  | { tipo: 'cargando' }
  | { tipo: 'error' }
  | { tipo: 'sin_indicadores' }
  | { tipo: 'al_dia'; indicadores: IndicadorPendiente[] }
  | { tipo: 'con_pendientes'; activos: IndicadorPendiente[]; alDia: IndicadorPendiente[] };

/**
 * Carga, error y ausencia de pendientes son estados distintos. Con un dato válido previo, un fallo posterior
 * conserva las cifras (el indicador de sincronización avisa); sin dato válido, nunca se muestra un cero.
 */
export function estadoPendientes(datos: IndicadorPendiente[] | null, fallo: boolean): EstadoPendientes {
  if (!datos) return fallo ? { tipo: 'error' } : { tipo: 'cargando' };
  if (datos.length === 0) return { tipo: 'sin_indicadores' };
  const activos = datos.filter(i => i.cantidad > 0);
  if (activos.length === 0) return { tipo: 'al_dia', indicadores: datos };
  return { tipo: 'con_pendientes', activos, alDia: datos.filter(i => i.cantidad === 0) };
}
