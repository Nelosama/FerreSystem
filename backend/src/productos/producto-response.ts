import type { JwtValidatedPayload } from '../auth/jwt.strategy';

// P1 (PR #134): costo, margen y costo vigente son datos comerciales de ADMIN.
// BODEGUERO registra y cuenta, pero no los recibe en respuestas de productos (listado, detalle, importación).
// The JWT strategy reloads role/permissions from the active user in this tenant.
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
    stockMinimo, stockBajo, stockFisico, unidadMedida, usaMedida, activo, imagenUrl, marca, version, pendienteConfiguracion, precioAprobado,
  } = p;
  return {
    id, codigo, codigoBarras, codigoFabricante, nombre, descripcion,
    categoriaId, precioVenta, stockActual, stockReservado, stockDisponible,
    stockMinimo, stockBajo, stockFisico, unidadMedida, usaMedida, activo, imagenUrl, marca, version, pendienteConfiguracion, precioAprobado,
    ...(p.categoria !== undefined ? {
      categoria: p.categoria ? { id: p.categoria.id, nombre: p.categoria.nombre } : null,
    } : {}),
  };
}
