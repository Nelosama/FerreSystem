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
  it('persiste navegación, apariencia, moneda e impuesto soportados y los recupera sin modificar otra empresa', async () => {
    const configuracion = { templateVersion: 'v2', v2Mode: 'dark', estiloUI: 'MODERNO', fuenteTitulos: 'Poppins', fuenteCuerpo: 'Inter', rubro: 'FERRETERIA', moneda: { simbolo: 'L.', codigo: 'HNL' }, impuesto: { nombre: 'ISV', tasa: 15 } };
    await service.updateTenantBranding('A', { modoNavegacion: 'TOPNAV', configuracion });
    expect(await service.getTenantSettings('A')).toMatchObject({ modoNavegacion: 'TOPNAV', ...configuracion });
    expect(await service.getTenantSettings('B')).toMatchObject({ modoNavegacion: 'SIDEBAR', configuracion: {} });
    expect(prisma.tenant.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'A' } }));
  });
  it('rechaza logoUrl externo: el logotipo solo se guarda como archivo privado', async () => {
    await expect(service.updateTenantBranding('A', { logoUrl: 'https://ejemplo.com/logo.png' })).rejects.toThrow('El logotipo se carga como archivo');
    expect(prisma.tenant.update).not.toHaveBeenCalled();
  });
  it('el rubro solo cambia con la ruta del SUPERADMIN', async () => {
    prisma.tenant.findUnique.mockResolvedValueOnce({ id: 'A', configuracion: { rubro: 'FERRETERIA' } });
    await expect(service.updateTenantBranding('A', { configuracion: { rubro: 'PULPERIA' } })).rejects.toThrow('solo lo configura el Super Admin');
    prisma.tenant.findUnique.mockResolvedValueOnce({ id: 'A', configuracion: { rubro: 'FERRETERIA' } });
    await service.updateTenantBranding('A', { configuracion: { rubro: 'PULPERIA' } }, { esSuperAdmin: true });
    expect(prisma.tenant.update).toHaveBeenCalledTimes(1);
  });
  it('no expone la clave interna del almacenamiento', async () => {
    records.set('A', { ...records.get('A'), logoStorageKey: 'tenants/A/logo', logoMime: 'image/png', logoBytes: 10, logoActualizadoAt: new Date('2026-10-15T00:00:00Z') });
    const settings = await service.getTenantSettings('A');
    expect(settings).not.toHaveProperty('logoStorageKey');
    expect(settings.logotipo).toMatchObject({ mime: 'image/png', bytes: 10 });
  });
  it.each([
    { moneda: { simbolo: '$', codigo: 'USD' } }, { impuesto: { nombre: 'ISV', tasa: 0 } }, { impuesto: { nombre: 'ISV', tasa: -1 } }, { impuesto: { nombre: 'ISV', tasa: 101 } },
    { moneda: { simbolo: '$', codigo: 'invalid' } }, { templateVersion: 'unknown' },
    { id: 'B' }, { modulosHabilitados: ['pos'] }, { modoNavegacion: 'TOPNAV' },
  ])('rechaza configuración inválida o campos administrados por plataforma: %j', async configuracion => {
    await expect(service.updateTenantBranding('A', { configuracion })).rejects.toThrow();
    expect(prisma.tenant.update).not.toHaveBeenCalled();
  });
  it('normaliza configuración vacía y fiscal heredada sin cambiar datos transaccionales', async () => {
    expect(await service.getTenantSettings('A')).toMatchObject({ templateVersion:'v1', v2Mode:'light', estiloUI:'INDUSTRIAL', fuenteTitulos:'Archivo', moneda:{ codigo:'HNL', simbolo:'L.' }, impuesto:{ nombre:'ISV', tasa:15 } });
    records.get('A').configuracion = { moneda:{ codigo:'USD', simbolo:'$' }, impuesto:{ nombre:'VAT', tasa:0 } };
    expect(await service.getTenantSettings('A')).toMatchObject({ moneda:{ codigo:'HNL', simbolo:'L.' }, impuesto:{ nombre:'ISV', tasa:15 } });
    expect(prisma.tenant.update).not.toHaveBeenCalled();
  });
  it('rechaza modo de navegación desconocido', async () => {
    await expect(service.updateTenantBranding('A', { modoNavegacion: 'unknown' as any })).rejects.toThrow();
    expect(prisma.tenant.update).not.toHaveBeenCalled();
  });
  it('FS-10: un administrador no cambia el rubro, pero reenviar el rubro vigente sí se acepta', async () => {
    records.set('A', { ...records.get('A'), configuracion: { rubro: 'FERRETERIA' } });
    await expect(service.updateTenantBranding('A', { configuracion: { rubro: 'PAPELERIA' } })).rejects.toThrow('solo lo configura el Super Admin');
    expect(records.get('A').configuracion.rubro).toBe('FERRETERIA');
    await expect(service.updateTenantBranding('A', { configuracion: { rubro: 'FERRETERIA', estiloUI: 'INDUSTRIAL' } })).resolves.toBeTruthy();
  });
});
