export const formatNumeroCliente = (numero?: number | null): string =>
  numero && Number.isInteger(numero) && numero > 0 ? `CLI-${String(numero).padStart(6, '0')}` : '—';
