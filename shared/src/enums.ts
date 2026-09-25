// ============================================================
// FerreSystem — Enums compartidos
// Usados por backend, frontend y mobile
// ============================================================

// --- Roles de usuario dentro de un tenant ---
export enum Rol {
  ADMIN = 'ADMIN',
  CAJERO = 'CAJERO',
  BODEGUERO = 'BODEGUERO',
  VENDEDOR = 'VENDEDOR',
}

// --- Estado del tenant ---
export enum EstadoTenant {
  ACTIVO = 'ACTIVO',
  SUSPENDIDO = 'SUSPENDIDO',
}

// --- Unidades de medida ---
export enum UnidadMedida {
  UNIDAD = 'UNIDAD',
  CAJA = 'CAJA',
  METRO = 'METRO',
  KG = 'KG',
  GALON = 'GALON',
  LIBRA = 'LIBRA',
}

// --- Tipo de cliente ---
export enum TipoCliente {
  CONSUMIDOR_FINAL = 'CONSUMIDOR_FINAL',
  MAYORISTA = 'MAYORISTA',
  CONTRATISTA = 'CONTRATISTA',
}

// --- Método de pago ---
export enum MetodoPago {
  EFECTIVO = 'EFECTIVO',
  TARJETA = 'TARJETA',
  CREDITO = 'CREDITO',
}

// --- Estado de venta ---
export enum EstadoVenta {
  COMPLETADA = 'COMPLETADA',
  ANULADA = 'ANULADA',
}

// --- Estado de cotización ---
export enum EstadoCotizacion {
  BORRADOR = 'BORRADOR',
  ENVIADA = 'ENVIADA',
  APROBADA = 'APROBADA',
  RECHAZADA = 'RECHAZADA',
  VENCIDA = 'VENCIDA',
  CONVERTIDA = 'CONVERTIDA',
}

// --- Tipo de secuencia ---
export enum TipoSecuencia {
  VENTA = 'VENTA',
  COTIZACION = 'COTIZACION',
}

// --- Tipo de token JWT ---
export enum TipoToken {
  TENANT = 'tenant',
  SUPER_ADMIN = 'super_admin',
}
