import { SuperAdminService } from './super-admin.service';
import * as bcrypt from 'bcrypt';

describe('SuperAdminService', () => {
  const admin = {
    id: 'sa-1',
    nombre: 'Platform Admin',
    email: 'admin@example.com',
    activo: true,
  };

  let service: SuperAdminService;
  let prisma: any;
  let jwt: any;
  let config: any;
  let response: any;

  beforeEach(() => {
    prisma = {
      superAdmin: { findUnique: vi.fn() },
      $transaction: vi.fn(),
    };
    jwt = {
      sign: vi.fn().mockReturnValue('signed-token'),
      verify: vi.fn(),
    };
    config = {
      get: vi.fn((key: string, fallback: unknown) => key === 'NODE_ENV' ? 'production' : fallback),
    };
    response = { cookie: vi.fn(), clearCookie: vi.fn() };
    service = new SuperAdminService(prisma, jwt, config);
  });

  it('verifies the stored bcrypt hash and issues a super-admin JWT and cross-site cookie', async () => {
    const passwordHash = await bcrypt.hash('correct horse battery', 4);
    prisma.superAdmin.findUnique.mockResolvedValue({ ...admin, passwordHash });

    const result = await service.login(
      { email: ' ADMIN@example.com ', password: 'correct horse battery' },
      response,
    );

    expect(result.accessToken).toBe('signed-token');
    expect(jwt.sign).toHaveBeenCalledWith(
      { sub: admin.id, email: admin.email, rol: 'SUPER_ADMIN', type: 'super_admin' },
      expect.any(Object),
    );
    expect(response.cookie).toHaveBeenCalledWith(
      'superAdminRefreshToken',
      'signed-token',
      expect.objectContaining({ httpOnly: true, secure: true, sameSite: 'none', path: '/api/admin/auth' }),
    );
  });

  it('refreshes only active super-admin sessions', async () => {
    jwt.verify.mockReturnValue({ sub: admin.id, rol: 'SUPER_ADMIN', type: 'super_admin' });
    prisma.superAdmin.findUnique.mockResolvedValue(admin);

    await expect(service.refresh('refresh-token', response)).resolves.toEqual({ accessToken: 'signed-token' });
    expect(jwt.sign).toHaveBeenCalledWith(
      { sub: admin.id, email: admin.email, rol: 'SUPER_ADMIN', type: 'super_admin' },
      expect.any(Object),
    );
  });

  it('rejects tenant refresh tokens on the Super Admin refresh endpoint', async () => {
    jwt.verify.mockReturnValue({ sub: 'u-1', type: 'tenant', tenantId: 'tenant-A', rol: 'ADMIN' });

    await expect(service.refresh('tenant-refresh', response)).rejects.toThrow('Refresh token de Super Admin inválido');
    expect(prisma.superAdmin.findUnique).not.toHaveBeenCalled();
    expect(response.clearCookie).toHaveBeenCalledWith('superAdminRefreshToken', { path: '/api/admin/auth' });
  });

  it('logout clears only the Super Admin refresh cookie', () => {
    expect(service.logout(response)).toMatchObject({ success: true });
    expect(response.clearCookie).toHaveBeenCalledWith('superAdminRefreshToken', { path: '/api/admin/auth' });
  });

  it('creates the tenant, initial sequences, modules, and admin in one transaction', async () => {
    const tenant = {
      id: 'tenant-1',
      nombreComercial: 'Ferreteria Uno',
      email: 'admin@ferreteria.test',
      telefono: null,
      plan: 'Plan Pro',
      estado: 'ACTIVO',
      colorPrimario: '#EA580C',
      modoNavegacion: 'SIDEBAR',
      createdAt: new Date(),
    };
    const tx = {
      tenant: { create: vi.fn().mockResolvedValue(tenant) },
      secuenciaTenant: { createMany: vi.fn().mockResolvedValue({ count: 2 }) },
      tenantModule: { createMany: vi.fn().mockResolvedValue({ count: 14 }) },
      usuario: {
        create: vi.fn(async ({ data }) => ({ id: 'user-1', ...data })),
      },
    };
    prisma.$transaction.mockImplementation((callback: (tx: any) => unknown) => callback(tx));

    const result = await service.createTenant({
      nombreComercial: 'Ferreteria Uno',
      adminNombre: 'Tenant Admin',
      adminEmail: 'ADMIN@FERRETERIA.TEST',
      adminPassword: 'tenant password',
    });

    expect(prisma.$transaction).toHaveBeenCalledOnce();
    expect(tx.secuenciaTenant.createMany).toHaveBeenCalledWith({
      data: [
        { tenantId: tenant.id, tipo: 'VENTA', ultimoNumero: 0 },
        { tenantId: tenant.id, tipo: 'COTIZACION', ultimoNumero: 0 },
      ],
    });
    expect(tx.tenantModule.createMany).toHaveBeenCalledOnce();
    expect(result.adminUsuario).toMatchObject({ id: 'user-1', email: 'admin@ferreteria.test', rol: 'ADMIN' });
    expect(await bcrypt.compare('tenant password', tx.usuario.create.mock.calls[0][0].data.passwordHash)).toBe(true);
  });
});