export type Rol = 'ADMIN' | 'CAJERO' | 'BODEGUERO' | 'VENDEDOR';

export interface TenantInfo {
  id: string;
  nombreComercial: string;
  sucursal?: string;
  logoUrl?: string | null;
  colorPrimario: string;
}

export interface UserInfo {
  id: string;
  nombre: string;
  email: string;
  rol: Rol;
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
