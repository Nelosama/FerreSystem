import { TenantsService } from './tenants.service';

describe('Persistencia de configuración por empresa', () => {
  const records = new Map<string, any>();
  const prisma = { tenant: {
    findUnique: vi.fn(async ({ where }) => records.get(where.id)),
    update: vi.fn(async ({ where, data }) => {
      const record = { ...records.get(where.id), ...data };
      records.set(where.id, record);
      return record;
    }),
  } };
  const service = new TenantsService(prisma as any);
  beforeEach(() => {
    records.clear(); vi.clearAllMocks();
    for (const id of ['A', 'B']) records.set(id, { id, nombreComercial: id, modoNavegacion: 'SIDEBAR', configuracion: {}, modulos: [] });
  });
  it('persiste navegación, apariencia, moneda e impuesto cero y los recupera sin modificar otra empresa', async () => {
    const configuracion = { templateVersion: 'v2', v2Mode: 'dark', estiloUI: 'MODERNO', fuenteTitulos: 'Poppins', fuenteCuerpo: 'Inter', rubro: 'FERRETERIA', moneda: { simbolo: '$', codigo: 'USD' }, impuesto: { nombre: 'ISV', tasa: 0 } };
    await service.updateTenantBranding('A', { modoNavegacion: 'TOPNAV', logoUrl: null, configuracion });
    expect(await service.getTenantSettings('A')).toMatchObject({ modoNavegacion: 'TOPNAV', ...configuracion, logoUrl: null });
    expect(await service.getTenantSettings('B')).toMatchObject({ modoNavegacion: 'SIDEBAR', configuracion: {} });
    expect(prisma.tenant.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'A' } }));
  });
  it.each([
    { impuesto: { nombre: 'ISV', tasa: -1 } }, { impuesto: { nombre: 'ISV', tasa: 101 } },
    { moneda: { simbolo: '$', codigo: 'invalid' } }, { templateVersion: 'unknown' },
    { id: 'B' }, { modulosHabilitados: ['pos'] }, { modoNavegacion: 'TOPNAV' },
  ])('rechaza configuración inválida o campos administrados por plataforma: %j', async configuracion => {
    await expect(service.updateTenantBranding('A', { configuracion })).rejects.toThrow();
    expect(prisma.tenant.update).not.toHaveBeenCalled();
  });
  it('rechaza modo de navegación desconocido', async () => {
    await expect(service.updateTenantBranding('A', { modoNavegacion: 'unknown' as any })).rejects.toThrow();
    expect(prisma.tenant.update).not.toHaveBeenCalled();
  });
});
