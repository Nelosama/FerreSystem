// Mirrors the public module keys. Legacy subscriptions allow missing records;
// an explicit disabled record is authoritative for optional modules.
export const CORE_TENANT_MODULES = ['clientes', 'arqueo_caja', 'configuracion'];
export const DEFAULT_TENANT_MODULES = ['pos', 'cotizaciones', 'pedidos_especiales', 'apartados', 'inventario', 'levantamiento', 'ordenes_compra', 'transferencias_sucursal', 'garantias', 'clientes', 'listas_precio', 'usuarios', 'comisiones_venta', 'arqueo_caja', 'reportes', 'configuracion'];
export function enabledTenantModules(records: { moduleKey: string; enabled: boolean }[]) {
  return DEFAULT_TENANT_MODULES.filter(key => CORE_TENANT_MODULES.includes(key) || records.find(record => record.moduleKey === key)?.enabled !== false);
}
