/**
 * Type definitions for Prisma enums.
 * Used as fallback when @prisma/client types are not fully generated.
 */

export enum Rol {
  ADMIN = 'ADMIN',
  CAJERO = 'CAJERO',
  BODEGUERO = 'BODEGUERO',
  VENDEDOR = 'VENDEDOR',
}

export enum UnidadMedida {
  UNIDAD = 'UNIDAD',
  PIE = 'PIE',
  METRO = 'METRO',
  METRO_CUADRADO = 'METRO_CUADRADO',
  METRO_CUBICO = 'METRO_CUBICO',
  LIBRA = 'LIBRA',
  KG = 'KG',
  GALON = 'GALON',
  LITRO = 'LITRO',
  CAJA = 'CAJA',
  PAQUETE = 'PAQUETE',
  OTRO = 'OTRO',
}

export enum TipoCliente {
  CONSUMIDOR_FINAL = 'CONSUMIDOR_FINAL',
  MAYORISTA = 'MAYORISTA',
  CONTRATISTA = 'CONTRATISTA',
}

export enum MetodoPago {
  EFECTIVO = 'EFECTIVO',
  TARJETA = 'TARJETA',
  CREDITO = 'CREDITO',
  TRANSFERENCIA = 'TRANSFERENCIA',
}

export enum TipoPago {
  CONTADO = 'CONTADO',
  CREDITO = 'CREDITO',
}
