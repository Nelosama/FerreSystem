import { CORE_TENANT_MODULES } from '../common/tenant-modules';

/**
 * Pendientes del inicio: qué indicadores puede ver cada usuario. Cada regla replica la autorización del
 * endpoint y la pantalla a la que conduce el contador, para que la cifra nunca muestre algo que el usuario
 * no podría abrir. Sin sucursal: ventas, productos, cotizaciones y operaciones no tienen sucursal en el esquema
 * (el catálogo `sucursales` es administrativo y no reasigna operaciones), así que el alcance es el negocio
 * completo, o las ventas propias cuando la regla de la pantalla lo exige.
 */
export type ClavePendiente =
  | 'contingencia_revision'
  | 'precios_pendientes'
  | 'entregas_pendientes'
  | 'cotizaciones_vencen_hoy'
  | 'stock_bajo_minimo';

export type AlcancePendiente = 'NEGOCIO' | 'PROPIAS';

interface ReglaPendiente {
  clave: ClavePendiente;
  ruta: string;
  roles: readonly string[];
  modulo: string;
  permiso?: string;
  /** Roles que solo ven sus propias ventas (mismo criterio que la pantalla de destino). */
  soloPropias?: readonly string[];
}

// Orden de prioridad: lo que bloquea dinero o ventas primero.
export const REGLAS_PENDIENTES: readonly ReglaPendiente[] = [
  // GET /contingencia/operaciones?soloRevision=true y /contingencia-admin: solo ADMIN, módulo POS.
  { clave: 'contingencia_revision', ruta: '/contingencia-admin', roles: ['ADMIN'], modulo: 'pos' },
  // PATCH /productos/:id/precios y /precios: solo ADMIN; la pantalla lee /productos (módulo inventario).
  { clave: 'precios_pendientes', ruta: '/precios', roles: ['ADMIN'], modulo: 'inventario', permiso: 'inventario.editar' },
  // GET /entregas/pendientes: ADMIN y BODEGUERO ven todas; CAJERO, las suyas.
  { clave: 'entregas_pendientes', ruta: '/entregas', roles: ['ADMIN', 'BODEGUERO', 'CAJERO'], modulo: 'pos', soloPropias: ['CAJERO'] },
  // GET /cotizaciones: ADMIN, CAJERO y VENDEDOR.
  { clave: 'cotizaciones_vencen_hoy', ruta: '/cotizaciones', roles: ['ADMIN', 'CAJERO', 'VENDEDOR'], modulo: 'cotizaciones' },
  // /inventario: ADMIN y BODEGUERO.
  { clave: 'stock_bajo_minimo', ruta: '/inventario', roles: ['ADMIN', 'BODEGUERO'], modulo: 'inventario' },
];

export const MODULOS_PENDIENTES = [...new Set(REGLAS_PENDIENTES.map((r) => r.modulo))];

export interface UsuarioPendientes {
  rol?: string;
  permisos?: string[];
  permisosConfigurados?: boolean;
}

/** Módulo habilitado con el mismo criterio que TenantModuleGuard: un registro deshabilitado explícito manda. */
export function moduloHabilitado(modulo: string, registros: { moduleKey: string; enabled: boolean }[]) {
  if (CORE_TENANT_MODULES.includes(modulo)) return true;
  return registros.find((r) => r.moduleKey === modulo)?.enabled !== false;
}

/** Permiso con el mismo criterio que RolesGuard: ADMIN no se restringe; sin permisos configurados, se respeta el rol. */
export function tienePermiso(usuario: UsuarioPendientes, permiso?: string) {
  if (!permiso || usuario.rol === 'ADMIN' || !usuario.permisosConfigurados) return true;
  return Array.isArray(usuario.permisos) && usuario.permisos.includes(permiso);
}

export function reglasAutorizadas(usuario: UsuarioPendientes, registros: { moduleKey: string; enabled: boolean }[]) {
  return REGLAS_PENDIENTES
    .filter((r) => !!usuario.rol && r.roles.includes(usuario.rol))
    .filter((r) => moduloHabilitado(r.modulo, registros))
    .filter((r) => tienePermiso(usuario, r.permiso))
    .map((r) => ({ ...r, alcance: (r.soloPropias?.includes(usuario.rol!) ? 'PROPIAS' : 'NEGOCIO') as AlcancePendiente }));
}
