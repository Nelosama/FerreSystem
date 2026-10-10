import type { JwtValidatedPayload } from '../auth/jwt.strategy';

// Same effective inventory access as the product purchase-history endpoint.
// The JWT strategy reloads role/permissions from the active user in this tenant.
export function canReadProductFinancials(user?: JwtValidatedPayload): boolean {
  return user?.type === 'tenant' && !!user.tenantId && (
    user.rol === 'ADMIN' || (user.rol === 'BODEGUERO' && (
      !user.permisosConfigurados || !!user.permisos?.includes('inventario.ver')
    ))
  );
}

// Explicit public contract: newly added database fields are private by default.
export function publicProduct(p: any): any {
  if (Array.isArray(p)) return p.map(publicProduct);
  if (!p) return p;
  const {
    id, codigo, codigoBarras, codigoFabricante, nombre, descripcion,
    categoriaId, precioVenta, stockActual, stockReservado, stockDisponible,
    stockMinimo, stockBajo, stockFisico, unidadMedida, usaMedida, activo, imagenUrl, marca, version, pendienteConfiguracion,
  } = p;
  return {
    id, codigo, codigoBarras, codigoFabricante, nombre, descripcion,
    categoriaId, precioVenta, stockActual, stockReservado, stockDisponible,
    stockMinimo, stockBajo, stockFisico, unidadMedida, usaMedida, activo, imagenUrl, marca, version, pendienteConfiguracion,
    ...(p.categoria !== undefined ? {
      categoria: p.categoria ? { id: p.categoria.id, nombre: p.categoria.nombre } : null,
    } : {}),
  };
}
