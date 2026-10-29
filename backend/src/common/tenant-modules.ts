// Mirrors the public module keys. Legacy subscriptions allow missing records;
// an explicit disabled record is authoritative for optional modules.
export const CORE_TENANT_MODULES: string[] = [];
export const DEFAULT_TENANT_MODULES = ['pos', 'cotizaciones', 'inventario', 'levantamiento', 'ordenes_compra', 'garantias', 'clientes', 'usuarios', 'comisiones_venta', 'arqueo_caja', 'reportes', 'configuracion'];
// Módulos sin operaciones reales (sin modelo de negocio operativo ni endpoints). Quedan ocultos para todos los negocios,
// incluidos los que tengan un registro habilitado de una época anterior: esos registros no se borran, solo dejan de
// tener efecto. Super Admin no puede encenderlos. Para reactivar uno: implementar sus operaciones con persistencia y
// pruebas, y quitarlo de esta lista y de PENDING_MODULES del frontend (una prueba comprueba que ambas listas coinciden).
export const MODULOS_NO_IMPLEMENTADOS = ['apartados', 'transferencias_sucursal', 'pedidos_especiales', 'listas_precio'];
// Opt-in: without an explicit enabled record the module stays off, so existing tenants are not affected.
export const OPT_IN_TENANT_MODULES = ['contabilidad'];
/** Catálogo que el Super Admin puede encender o apagar: los módulos predeterminados más los de activación explícita. */
export const CONFIGURABLE_TENANT_MODULES = [...DEFAULT_TENANT_MODULES, ...OPT_IN_TENANT_MODULES];
export function moduleEnabled(moduleKey: string, record?: { enabled: boolean } | null) {
  if (MODULOS_NO_IMPLEMENTADOS.includes(moduleKey)) return false;
  if (CORE_TENANT_MODULES.includes(moduleKey)) return true;
  if (OPT_IN_TENANT_MODULES.includes(moduleKey)) return record?.enabled === true;
  return !record || record.enabled;
}
export function enabledTenantModules(records: { moduleKey: string; enabled: boolean }[]) {
  return CONFIGURABLE_TENANT_MODULES.filter(key => moduleEnabled(key, records.find(record => record.moduleKey === key)));
}

// Only operational dependencies; security, authentication and tenant settings reads are internal.
export const TENANT_MODULE_DEPENDENCIES: Record<string, string[]> = {
  pos: ['inventario', 'arqueo_caja', 'clientes'],
  cotizaciones: ['inventario', 'clientes'],
  levantamiento: ['inventario'],
  ordenes_compra: ['inventario'],
  comisiones_venta: ['pos', 'usuarios'],
};
export function moduleDependencyErrors(enabled: string[]) {
  return Object.entries(TENANT_MODULE_DEPENDENCIES).flatMap(([key, dependencies]) =>
    enabled.includes(key) ? dependencies.filter(dependency => !enabled.includes(dependency)).map(dependency => `${key} → ${dependency}`) : []);
}
