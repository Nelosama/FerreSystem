// Mirrors the public module keys. Legacy subscriptions allow missing records;
// an explicit disabled record is authoritative for optional modules.
export const CORE_TENANT_MODULES = ['clientes', 'arqueo_caja', 'configuracion'];
export const DEFAULT_TENANT_MODULES = ['pos', 'cotizaciones', 'pedidos_especiales', 'apartados', 'inventario', 'levantamiento', 'ordenes_compra', 'transferencias_sucursal', 'garantias', 'clientes', 'listas_precio', 'usuarios', 'comisiones_venta', 'arqueo_caja', 'reportes', 'configuracion'];
// Opt-in: without an explicit enabled record the module stays off, so existing tenants are not affected.
export const OPT_IN_TENANT_MODULES = ['contabilidad'];
export function moduleEnabled(moduleKey: string, record?: { enabled: boolean } | null) {
  if (CORE_TENANT_MODULES.includes(moduleKey)) return true;
  if (OPT_IN_TENANT_MODULES.includes(moduleKey)) return record?.enabled === true;
  return !record || record.enabled;
}
export function enabledTenantModules(records: { moduleKey: string; enabled: boolean }[]) {
  return [...DEFAULT_TENANT_MODULES, ...OPT_IN_TENANT_MODULES].filter(key => moduleEnabled(key, records.find(record => record.moduleKey === key)));
}
