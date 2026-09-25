// ============================================================
// FerreSystem — DTOs compartidos (interfaces de API)
// Definen la forma de los datos que viajan entre backend y frontend
// ============================================================

import {
  Rol,
  EstadoTenant,
  UnidadMedida,
  TipoCliente,
  MetodoPago,
  EstadoVenta,
  EstadoCotizacion,
} from './enums';

// ─── Auth ────────────────────────────────────────────────────

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  accessToken: string;
  user: UsuarioResumen;
  tenant: TenantResumen;
}

export interface SuperAdminLoginResponse {
  accessToken: string;
  superAdmin: {
    id: string;
    nombre: string;
    email: string;
  };
}

export interface RefreshResponse {
  accessToken: string;
}

export interface JwtPayloadTenant {
  sub: string;       // userId
  tenantId: string;
  rol: Rol;
  email: string;
  type: 'tenant';
}

export interface JwtPayloadSuperAdmin {
  sub: string;       // superAdminId
  rol: 'SUPER_ADMIN';
  email: string;
  type: 'super_admin';
}

export type JwtPayload = JwtPayloadTenant | JwtPayloadSuperAdmin;

// ─── Tenant ──────────────────────────────────────────────────

export interface TenantResumen {
  id: string;
  nombreComercial: string;
  logoUrl: string | null;
  colorPrimario: string;
  estado: EstadoTenant;
}

export interface TenantCompleto extends TenantResumen {
  direccion: string | null;
  telefono: string | null;
  email: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ActualizarTenantBranding {
  nombreComercial?: string;
  direccion?: string;
  telefono?: string;
  email?: string;
  colorPrimario?: string;
  // logoUrl se actualiza via upload separado
}

// ─── Usuario ─────────────────────────────────────────────────

export interface UsuarioResumen {
  id: string;
  nombre: string;
  email: string;
  rol: Rol;
  activo: boolean;
}

// ─── Categoría ───────────────────────────────────────────────

export interface CategoriaDto {
  id: string;
  nombre: string;
  descripcion: string | null;
}

export interface CrearCategoriaRequest {
  nombre: string;
  descripcion?: string;
}

// ─── Producto ────────────────────────────────────────────────

export interface ProductoResumen {
  id: string;
  codigo: string;
  codigoBarras: string | null;
  nombre: string;
  precioVenta: number;
  stockActual: number;
  stockMinimo: number;
  unidadMedida: UnidadMedida;
  activo: boolean;
  categoria: CategoriaDto | null;
  imagenUrl: string | null;
  stockBajo: boolean; // calculado: stockActual <= stockMinimo
}

export interface ProductoCompleto extends ProductoResumen {
  descripcion: string | null;
  precioCosto: number;
  createdAt: string;
  updatedAt: string;
}

export interface CrearProductoRequest {
  codigo: string;
  codigoBarras?: string;
  nombre: string;
  descripcion?: string;
  categoriaId?: string;
  precioVenta: number;
  precioCosto: number;
  stockActual: number;
  stockMinimo: number;
  unidadMedida: UnidadMedida;
}

export interface ActualizarProductoRequest extends Partial<CrearProductoRequest> {}

// ─── Cliente ─────────────────────────────────────────────────

export interface ClienteDto {
  id: string;
  nombre: string;
  rtn: string | null;
  telefono: string | null;
  email: string | null;
  direccion: string | null;
  tipo: TipoCliente;
}

export interface CrearClienteRequest {
  nombre: string;
  rtn?: string;
  telefono?: string;
  email?: string;
  direccion?: string;
  tipo: TipoCliente;
}

// ─── Venta ───────────────────────────────────────────────────

export interface DetalleVentaDto {
  id: string;
  productoId: string;
  productoNombre: string;
  productoCodigo: string;
  cantidad: number;
  precioUnitario: number;
  subtotal: number;
}

export interface VentaResumen {
  id: string;
  numeroVenta: number;
  clienteNombre: string | null;
  usuarioNombre: string;
  subtotal: number;
  isv: number;
  descuento: number;
  total: number;
  metodoPago: MetodoPago;
  estado: EstadoVenta;
  createdAt: string;
}

export interface VentaCompleta extends VentaResumen {
  clienteId: string | null;
  usuarioId: string;
  notas: string | null;
  detalles: DetalleVentaDto[];
}

export interface CrearVentaRequest {
  clienteId?: string;
  metodoPago: MetodoPago;
  descuento?: number;
  notas?: string;
  detalles: {
    productoId: string;
    cantidad: number;
    precioUnitario: number;
  }[];
}

// ─── Cotización ──────────────────────────────────────────────

export interface DetalleCotizacionDto {
  id: string;
  productoId: string;
  productoNombre: string;
  productoCodigo: string;
  cantidad: number;
  precioUnitario: number;
  subtotal: number;
}

export interface CotizacionResumen {
  id: string;
  numeroCotizacion: number;
  clienteNombre: string;
  usuarioNombre: string;
  subtotal: number;
  isv: number;
  descuento: number;
  total: number;
  estado: EstadoCotizacion;
  fechaValidez: string;
  createdAt: string;
}

export interface CotizacionCompleta extends CotizacionResumen {
  clienteId: string;
  usuarioId: string;
  notas: string | null;
  ventaId: string | null;
  detalles: DetalleCotizacionDto[];
  updatedAt: string;
}

export interface CrearCotizacionRequest {
  clienteId: string;
  fechaValidez: string;
  descuento?: number;
  notas?: string;
  detalles: {
    productoId: string;
    cantidad: number;
    precioUnitario: number;
  }[];
}

// ─── Dashboard ───────────────────────────────────────────────

export interface DashboardData {
  ventasDelDia: {
    total: number;
    cantidad: number;
    variacionPorcentaje: number | null; // vs ayer
  };
  alertasStock: {
    cantidad: number;
    productos: ProductoResumen[];
  };
  cotizacionesPendientes: {
    cantidad: number;
    porVencerHoy: number;
  };
  tendenciaSemanal: {
    dia: string;  // 'LUN', 'MAR', etc.
    fecha: string;
    total: number;
  }[];
  productosMasVendidos: {
    productoId: string;
    productoNombre: string;
    cantidadVendida: number;
    totalVentas: number;
  }[];
}

// ─── Paginación ──────────────────────────────────────────────

export interface PaginacionParams {
  page?: number;
  limit?: number;
  search?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface RespuestaPaginada<T> {
  data: T[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

// ─── Super Admin ─────────────────────────────────────────────

export interface CrearTenantRequest {
  nombreComercial: string;
  direccion?: string;
  telefono?: string;
  email?: string;
  // Datos del admin inicial del tenant
  adminNombre: string;
  adminEmail: string;
  adminPassword: string;
}

export interface TenantAdminResumen extends TenantCompleto {
  cantidadUsuarios: number;
  cantidadProductos: number;
  cantidadVentas: number;
}

// ─── Respuesta genérica de API ───────────────────────────────

export interface ApiResponse<T = void> {
  success: boolean;
  message?: string;
  data?: T;
}
