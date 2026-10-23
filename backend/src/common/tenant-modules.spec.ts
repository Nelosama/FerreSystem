import { enabledTenantModules, DEFAULT_TENANT_MODULES } from './tenant-modules';

it('mantiene los módulos heredados sin registros y respeta deshabilitaciones explícitas', () => {
  expect(enabledTenantModules([])).toEqual(DEFAULT_TENANT_MODULES);
  const enabled = enabledTenantModules([{ moduleKey: 'pos', enabled: false }, { moduleKey: 'clientes', enabled: false }]);
  expect(enabled).not.toContain('pos');
  expect(enabled).toContain('inventario');
  expect(enabled).not.toContain('clientes');
});

it.each(DEFAULT_TENANT_MODULES)('%s se puede deshabilitar sin excepción CORE', key => {
  expect(enabledTenantModules([{ moduleKey: key, enabled: false }])).not.toContain(key);
  expect(enabledTenantModules([{ moduleKey: key, enabled: true }])).toContain(key);
});
