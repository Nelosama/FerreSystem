/**
 * Conceptos contables del motor de reglas.
 *
 * Un concepto NO es una cuenta: es el papel que juega una línea del asiento («ventas», «ISV por pagar»…).
 * El contador asocia cada concepto con una cuenta de su catálogo en el mapeo de cuentas; el motor nunca
 * conoce códigos de cuenta ni los inventa. Sin cuenta asociada, la propuesta queda «falta mapeo» y no se contabiliza.
 */
export const CONCEPTOS = [
  'CAJA_EFECTIVO',
  'TARJETA_POR_LIQUIDAR',
  'BANCO_TRANSFERENCIA',
  'CXC_CLIENTES',
  'CXP_PROVEEDORES',
  'VENTAS',
  'DESCUENTO_VENTAS',
  'DEVOLUCIONES_VENTAS',
  'ISV_POR_PAGAR',
  'ISV_CREDITO_FISCAL',
  'INVENTARIO',
  'COSTO_VENTA',
  'MERCADERIA_EN_TRANSITO',
] as const;
export type Concepto = (typeof CONCEPTOS)[number];

/** Métodos de cobro/pago que Jowa registra (`methods` de operaciones/ledger.ts). */
export const METODOS_COBRO = ['EFECTIVO', 'TARJETA', 'TRANSFERENCIA'] as const;
export type MetodoCobro = (typeof METODOS_COBRO)[number];

/**
 * Concepto que recibe o entrega el dinero según el método.
 * Que la tarjeta pase por «tarjetas por liquidar» y no directamente a banco es una propuesta pendiente de confirmar por el contador.
 */
export const CONCEPTO_DE_METODO: Readonly<Record<MetodoCobro, Concepto>> = {
  EFECTIVO: 'CAJA_EFECTIVO',
  TARJETA: 'TARJETA_POR_LIQUIDAR',
  TRANSFERENCIA: 'BANCO_TRANSFERENCIA',
};

export const esMetodoCobro = (valor: unknown): valor is MetodoCobro =>
  typeof valor === 'string' && (METODOS_COBRO as readonly string[]).includes(valor);
