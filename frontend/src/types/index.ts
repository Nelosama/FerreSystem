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
  categoria: string;
  precioVenta: number;
  precioCosto: number;
  stockActual: number;
  stockMinimo: number;
  unidadMedida: string;
  stockBajo: boolean;
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

export interface QuotationItem {
  id: string;
  numeroCotizacion: number;
  cliente: string;
  total: number;
  estado: 'BORRADOR' | 'ENVIADA' | 'APROBADA' | 'RECHAZADA' | 'VENCIDA' | 'CONVERTIDA';
  fechaValidez: string;
  vencePronto: boolean;
}
