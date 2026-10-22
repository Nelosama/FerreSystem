// Mirrors the public module keys. Legacy subscriptions allow missing records;
// an explicit disabled record is authoritative for optional modules.
export const CORE_TENANT_MODULES: string[] = [];
export const DEFAULT_TENANT_MODULES = ['pos', 'cotizaciones', 'pedidos_especiales', 'apartados', 'inventario', 'levantamiento', 'ordenes_compra', 'transferencias_sucursal', 'garantias', 'clientes', 'listas_precio', 'usuarios', 'comisiones_venta', 'arqueo_caja', 'reportes', 'configuracion'];
export function enabledTenantModules(records: { moduleKey: string; enabled: boolean }[]) {
  return DEFAULT_TENANT_MODULES.filter(key => records.find(record => record.moduleKey === key)?.enabled !== false);
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
