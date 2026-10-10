// Cálculos del panel administrativo móvil. Funciones puras: reciben datos ya cargados desde la API
// y no hacen red ni guardan estado. Fechas en día calendario (YYYY-MM-DD) del negocio.

export interface MetodoResumen { metodo_pago: string; cantidad: number; total: number | string }
export interface AlertaResumen { tipo: string; cantidad: number; saldo: number | string }
export interface ResumenOperativo { metodos?: MetodoResumen[]; alertas?: AlertaResumen[] }
export interface CuentaPorVencer {
  nombre: string | null; documento: string | null; saldo: number | string;
  vencimiento: string | null; vencida: boolean;
}
export interface ClienteConSaldo { id: string; nombre: string; saldoPendiente: number | string }
export interface ProductoBajoStock { id: string; codigo: string; nombre: string; stockActual: number | string; stockMinimo: number | string }
export interface SolicitudDevolucion { id: string; estado: string; numero_venta?: string | number | null; total_venta?: number | string | null }

const numero = (valor: unknown): number => {
  const n = Number(valor);
  return Number.isFinite(n) ? n : 0;
};

// Suma días a un día calendario YYYY-MM-DD con aritmética UTC (sin efecto de la zona del navegador).
export function sumarDiasCalendario(dia: string, dias: number): string {
  const [anio, mes, diaMes] = dia.split('-').map(Number);
  return new Date(Date.UTC(anio, mes - 1, diaMes + dias)).toISOString().slice(0, 10);
}

export function ventasDelDia(resumen: ResumenOperativo | null | undefined) {
  const porMetodo = (resumen?.metodos ?? [])
    .map(m => ({ metodo: m.metodo_pago, cantidad: numero(m.cantidad), total: numero(m.total) }))
    .sort((a, b) => b.total - a.total);
  return {
    cantidad: porMetodo.reduce((suma, m) => suma + m.cantidad, 0),
    total: porMetodo.reduce((suma, m) => suma + m.total, 0),
    porMetodo,
  };
}

// Cuentas con saldo que ya vencieron o vencen hasta `dias` después de `hoy` (inclusive), ordenadas por vencimiento.
export function cuentasPorVencer(cuentas: CuentaPorVencer[], hoy: string, dias = 7): CuentaPorVencer[] {
  const limite = sumarDiasCalendario(hoy, dias);
  return cuentas
    .filter(c => numero(c.saldo) > 0 && (c.vencida || (!!c.vencimiento && c.vencimiento.slice(0, 10) <= limite)))
    .sort((a, b) => (a.vencimiento ?? '').localeCompare(b.vencimiento ?? ''));
}

export function clientesConSaldo(clientes: ClienteConSaldo[], limite = 8) {
  return clientes
    .filter(c => numero(c.saldoPendiente) > 0)
    .sort((a, b) => numero(b.saldoPendiente) - numero(a.saldoPendiente))
    .slice(0, limite);
}

// Productos en o por debajo del mínimo; los de mayor faltante primero.
export function productosBajoStock(productos: ProductoBajoStock[], limite = 10) {
  return productos
    .filter(p => numero(p.stockActual) <= numero(p.stockMinimo))
    .sort((a, b) => (numero(b.stockMinimo) - numero(b.stockActual)) - (numero(a.stockMinimo) - numero(a.stockActual)))
    .slice(0, limite);
}

export const solicitudesPendientes = (solicitudes: SolicitudDevolucion[]) =>
  solicitudes.filter(s => s.estado === 'PENDIENTE');
