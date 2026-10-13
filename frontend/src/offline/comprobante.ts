import { formatearCentavos, formatearCentesimas, subtotalLinea } from './money';
import type { OperacionLocal } from './journal';

// Comprobante interno de una venta de contingencia. Se construye solo desde el registro local guardado:
// sirve igual para la primera impresión y para reimprimir desde el diario, y no crea ninguna operación.
export const TITULO_COMPROBANTE = 'COMPROBANTE INTERNO DE CONTINGENCIA';
export const AVISO_NO_FISCAL = 'NO ES FACTURA FISCAL. Documento temporal de contingencia; la factura se emite al sincronizar.';

export interface LineaComprobante {
  codigo: string;
  nombre: string;
  cantidad: string;
  precioUnitario: string;
  subtotal: string;
}

export interface ComprobanteContingencia {
  titulo: string;
  aviso: string;
  ferreteria: string;
  correlativo: string;
  fechaHora: string;
  cajero: string;
  cliente: string;
  lineas: LineaComprobante[];
  subtotal: string;
  isv: string;
  total: string;
  efectivo: string;
  cambio: string;
}

export function construirComprobante(operacion: OperacionLocal, ferreteria: string): ComprobanteContingencia {
  const fecha = new Date(operacion.ocurridoAtLocal);
  return {
    titulo: TITULO_COMPROBANTE,
    aviso: AVISO_NO_FISCAL,
    ferreteria: operacion.ferreteria || ferreteria || 'Ferretería',
    correlativo: operacion.correlativoLocal,
    fechaHora: Number.isNaN(fecha.getTime()) ? operacion.ocurridoAtLocal : fecha.toLocaleString('es-HN', { dateStyle: 'short', timeStyle: 'short' }),
    cajero: operacion.cajeroNombre,
    cliente: operacion.clienteNombre || 'Consumidor final',
    lineas: operacion.lineas.map((l) => ({
      codigo: l.codigo,
      nombre: l.nombre,
      cantidad: formatearCentesimas(l.cantidadCentesimas),
      precioUnitario: formatearCentavos(l.precioCentavos),
      subtotal: formatearCentavos(subtotalLinea(l.precioCentavos, l.cantidadCentesimas)),
    })),
    subtotal: formatearCentavos(operacion.subtotalCentavos),
    isv: formatearCentavos(operacion.isvCentavos),
    total: formatearCentavos(operacion.totalCentavos),
    efectivo: formatearCentavos(operacion.efectivoRecibidoCentavos),
    cambio: formatearCentavos(operacion.cambioCentavos),
  };
}
