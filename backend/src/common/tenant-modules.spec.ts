import { CONFIGURABLE_TENANT_MODULES, DEFAULT_TENANT_MODULES, MODULOS_NO_IMPLEMENTADOS, OPT_IN_TENANT_MODULES, enabledTenantModules, moduleEnabled } from './tenant-modules';

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

describe('Contabilidad: módulo de activación explícita', () => {
  it('no está en los módulos predeterminados y no se enciende sin registro', () => {
    expect(DEFAULT_TENANT_MODULES).not.toContain('contabilidad');
    expect(OPT_IN_TENANT_MODULES).toEqual(['contabilidad']);
    expect(enabledTenantModules([])).not.toContain('contabilidad');
    expect(moduleEnabled('contabilidad', undefined)).toBe(false);
    expect(moduleEnabled('contabilidad', null)).toBe(false);
  });

  it('solo un registro explícito enabled=true la enciende; deshabilitar otros módulos no la toca', () => {
    expect(enabledTenantModules([{ moduleKey: 'contabilidad', enabled: false }])).not.toContain('contabilidad');
    expect(enabledTenantModules([{ moduleKey: 'contabilidad', enabled: true }])).toContain('contabilidad');
    expect(enabledTenantModules([{ moduleKey: 'pos', enabled: false }])).not.toContain('contabilidad');
    // Los módulos heredados siguen encendidos sin registro (compatibilidad con empresas existentes).
    expect(moduleEnabled('pos', undefined)).toBe(true);
    expect(moduleEnabled('pos', { enabled: false })).toBe(false);
  });

  it('el Super Admin puede configurarla aunque no sea predeterminada', () => {
    expect(CONFIGURABLE_TENANT_MODULES).toContain('contabilidad');
    expect(CONFIGURABLE_TENANT_MODULES).toEqual([...DEFAULT_TENANT_MODULES, ...OPT_IN_TENANT_MODULES]);
  });
});

describe('Módulos sin implementación: ocultos aunque existan registros antiguos', () => {
  const NO_IMPLEMENTADOS = ['apartados', 'transferencias_sucursal', 'pedidos_especiales', 'listas_precio', 'comisiones_venta'];

  it('no son predeterminados ni configurables, y no aparecen en el catálogo del Super Admin', () => {
    expect(MODULOS_NO_IMPLEMENTADOS).toEqual(NO_IMPLEMENTADOS);
    for (const key of NO_IMPLEMENTADOS) {
      expect(DEFAULT_TENANT_MODULES).not.toContain(key);
      expect(CONFIGURABLE_TENANT_MODULES).not.toContain(key);
    }
  });

  it('un registro habilitado antiguo no los enciende; no se borra el registro', () => {
    for (const key of NO_IMPLEMENTADOS) {
      expect(moduleEnabled(key, { enabled: true })).toBe(false);
      expect(enabledTenantModules([{ moduleKey: key, enabled: true }])).not.toContain(key);
    }
  });

  it('los negocios nuevos no reciben registro para ellos: el catálogo predeterminado no los incluye', () => {
    expect(enabledTenantModules([])).toEqual(DEFAULT_TENANT_MODULES);
    expect(enabledTenantModules([])).not.toEqual(expect.arrayContaining(NO_IMPLEMENTADOS));
  });

  it('no desactivan otros módulos: pos, inventario y clientes siguen encendidos sin registro', () => {
    const activos = enabledTenantModules([{ moduleKey: 'apartados', enabled: true }]);
    for (const key of ['pos', 'inventario', 'clientes', 'cotizaciones', 'garantias', 'reportes']) expect(activos).toContain(key);
  });
});
