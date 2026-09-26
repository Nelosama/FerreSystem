export type Rol = 'SUPERADMIN' | 'ADMIN' | 'CAJERO' | 'BODEGUERO' | 'VENDEDOR';

export type Permiso =
  | 'pos.vender'
  | 'pos.anular_venta'
  | 'pos.aplicar_descuento'
  | 'inventario.ver'
  | 'inventario.editar'
  | 'cotizaciones.crear'
  | 'cotizaciones.aprobar'
  | 'cotizaciones.convertir_venta'
  | 'reportes.ver'
  | 'usuarios.gestionar'
  | 'configuracion.editar';

export interface TenantInfo {
  id: string;
  nombreComercial: string;
  sucursal?: string;
  logoUrl?: string | null;
  colorPrimario: string;
  direccion?: string;
  telefono?: string;
  email?: string;
}

export interface UserInfo {
  id: string;
  nombre: string;
  email: string;
  rol: Rol;
  permisos?: string[];
  descuentoMaximo?: number;
  activo?: boolean;
}

export interface ProductItem {
  id: string;
  codigo: string;
  codigoBarras?: string;
  nombre: string;
  descripcion?: string;
  categoria: string;
  precioVenta: number;
  precioCosto: number;
  stockActual: number;
  stockMinimo: number;
  unidadMedida: string;
  usaMedida?: boolean;
  activo?: boolean;
  stockBajo?: boolean;
}

export interface SaleItem {
  id: string;
  numeroVenta: number;
  cliente: string;
  total: number;
  isv: number;
  subtotal: number;
  metodoPago: 'EFECTIVO' | 'TARJETA' | 'CREDITO';
  fecha: string;
  itemsCount: number;
}

export interface QuotationDetailItem {
  id: string;
  productoId: string;
  codigoProducto: string;
  descripcionProducto: string;
  unidadMedida: string;
  usaMedida: boolean;
  cantidad: number;
  medida: number;
  totalMedida: number;
  precioLista: number;
  precioUnitario: number;
  precioModificado?: boolean;
  descuento: number;
  tipoDescuento: 'PORCENTAJE' | 'MONTO';
  exento: boolean;
  subtotal: number;
  isv: number;
  totalLinea: number;
}

export interface QuotationItem {
  id: string;
  numero: number;
  numeroCotizacion?: number;
  cliente: string;
  rtn?: string;
  telefono?: string;
  email?: string;
  direccion?: string;
  usuarioId?: string;
  usuarioNombre?: string;
  fechaEmision?: string;
  fechaValidez: string;
  diasValidez?: number;
  condicionesPago?: string;
  subtotal: number;
  descuentoGeneral?: number;
  tipoDescuentoGeneral?: 'PORCENTAJE' | 'MONTO';
  porcentajeIsv?: number;
  isv: number;
  descuento?: number;
  total: number;
  estado: 'BORRADOR' | 'EMITIDA' | 'ENVIADA' | 'APROBADA' | 'RECHAZADA' | 'VENCIDA' | 'CONVERTIDA';
  notas?: string;
  itemsCount: number;
  detalles?: QuotationDetailItem[];
  vencePronto?: boolean;
  porVencerHoy?: boolean;
  vencida?: boolean;
  createdAt?: string;
}
