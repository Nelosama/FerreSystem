import type { QuotationItem } from '../types';

export function filterCotizaciones(
  cotizaciones: QuotationItem[],
  filterEstado: string,
  searchTerm: string,
  sortBy: 'RECIENTE' | 'ANTIGUO' = 'RECIENTE'
): QuotationItem[] {
  return cotizaciones
    .filter((c) => {
      if (filterEstado !== 'TODOS') {
        if (filterEstado === 'ENVIADA' || filterEstado === 'EMITIDA') {
          if (c.estado !== 'ENVIADA' && c.estado !== 'EMITIDA') {
            return false;
          }
        } else if (c.estado !== filterEstado) {
          return false;
        }
      }

      const q = searchTerm.trim().toLowerCase();
      if (q) {
        const numStr = `cot-${c.numero.toString().padStart(4, '0')}`.toLowerCase();
        const matchNum = numStr.includes(q) || c.numero.toString().includes(q);
        const matchCliente = c.cliente?.toLowerCase().includes(q) ?? false;
        const matchRtn = c.rtn?.toLowerCase().includes(q) ?? false;
        const matchVendedor = c.usuarioNombre?.toLowerCase().includes(q) ?? false;

        return matchNum || matchCliente || matchRtn || matchVendedor;
      }

      return true;
    })
    .sort((a, b) => {
      if (sortBy === 'RECIENTE') {
        return b.numero - a.numero;
      }
      return a.numero - b.numero;
    });
}
