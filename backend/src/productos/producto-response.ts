import type { JwtValidatedPayload } from '../auth/jwt.strategy';

// Costos, márgenes y última compra: solo el administrador. El personal de bodega no los consulta.
export function canReadProductFinancials(user?: JwtValidatedPayload): boolean {
  return user?.type === 'tenant' && !!user.tenantId && user.rol === 'ADMIN';
}

// Explicit public contract: newly added database fields are private by default.
export function publicProduct(p: any): any {
  if (Array.isArray(p)) return p.map(publicProduct);
  if (!p) return p;
  const {
    id, codigo, codigoBarras, codigoFabricante, nombre, descripcion,
    categoriaId, precioVenta, stockActual, stockReservado, stockDisponible,
    stockMinimo, stockBajo, stockFisico, unidadMedida, usaMedida, activo, imagenUrl, marca, version, precioAprobado,
  } = p;
  return {
    id, codigo, codigoBarras, codigoFabricante, nombre, descripcion,
    categoriaId, precioVenta, stockActual, stockReservado, stockDisponible,
    stockMinimo, stockBajo, stockFisico, unidadMedida, usaMedida, activo, imagenUrl, marca, version,
    // Estado de aprobación (sí/no), sin costo, margen ni responsable: el personal sabe qué falta aprobar.
    precioAprobado,
    ...(p.categoria !== undefined ? {
      categoria: p.categoria ? { id: p.categoria.id, nombre: p.categoria.nombre } : null,
    } : {}),
  };
}
