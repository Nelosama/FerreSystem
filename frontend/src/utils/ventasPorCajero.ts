export interface FilaCajeroResumen { usuario_id: string; usuario_nombre: string | null; metodo_pago: string; cantidad: number; total: number | string }
export interface VentasCajero { usuarioId: string; nombre: string | null; cantidad: number; totalCentavos: number; porMetodo: Record<string, number> }

const aCentavos = (valor: number | string) => Math.round(Number(valor || 0) * 100);

/** Agrupa las filas usuario×método de /operaciones/resumen por usuario, sumando en centavos. Mayor total primero. */
export function agruparVentasPorCajero(filas: FilaCajeroResumen[] | undefined): VentasCajero[] {
  const porUsuario = new Map<string, VentasCajero>();
  for (const f of filas ?? []) {
    const actual = porUsuario.get(f.usuario_id) ?? { usuarioId: f.usuario_id, nombre: f.usuario_nombre, cantidad: 0, totalCentavos: 0, porMetodo: {} };
    const centavos = aCentavos(f.total);
    actual.cantidad += Number(f.cantidad || 0);
    actual.totalCentavos += centavos;
    actual.porMetodo[f.metodo_pago] = (actual.porMetodo[f.metodo_pago] ?? 0) + centavos;
    porUsuario.set(f.usuario_id, actual);
  }
  return [...porUsuario.values()].sort((a, b) => b.totalCentavos - a.totalCentavos || (a.nombre ?? '').localeCompare(b.nombre ?? ''));
}
