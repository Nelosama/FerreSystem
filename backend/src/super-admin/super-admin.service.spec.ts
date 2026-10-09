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

  it('refreshes only active super-admin sessions', async () => {
    jwt.verify.mockReturnValue({ sub: admin.id, rol: 'SUPER_ADMIN', type: 'super_admin' });
    prisma.superAdmin.findUnique.mockResolvedValue(admin);

    await expect(service.refresh('refresh-token', response)).resolves.toEqual({ accessToken: 'signed-token' });
    expect(jwt.sign).toHaveBeenCalledWith(
      { sub: admin.id, email: admin.email, rol: 'SUPER_ADMIN', type: 'super_admin' },
      expect.any(Object),
    );
  });

  it('sets a refresh cookie usable by the deployed admin API', async () => {
    prisma.superAdmin.findUnique.mockResolvedValue({ ...admin, passwordHash: await bcrypt.hash('test-password', 4) });
    await service.login({ email: admin.email, password: 'test-password' }, response);
    expect(response.cookie).toHaveBeenCalledWith('superAdminRefreshToken', 'signed-token', expect.objectContaining({
      path: '/api/admin/auth', sameSite: 'none', secure: true, httpOnly: true,
    }));
  });

  it('returns the actual users required by the portal without password hashes', async () => {
    const usuarios = [{ id: 'u1', nombre: 'Usuario', email: 'u@test.com', activo: true, createdAt: new Date() }];
    prisma.tenant = { findMany: vi.fn().mockResolvedValue([{ id: 't1', usuarios, modulos: [], _count: { usuarios: 1, productos: 0, ventas: 0 } }]) };
    expect((await service.listTenants())[0].usuarios).toEqual(usuarios);
    const select = prisma.tenant.findMany.mock.calls[0][0].include.usuarios.select;
    expect(select.passwordHash).toBeUndefined();
    expect(Object.keys(select).sort()).toEqual(['activo', 'createdAt', 'email', 'id', 'nombre', 'rol']);
  });

  it('issues support tokens with the actual tenant identity and role', async () => {
    prisma.superAdmin.findUnique.mockResolvedValue(admin);
    prisma.usuario = { findFirst: vi.fn().mockResolvedValue({ id: 'u1', tenantId: 't1', email: 'u@test.com', nombre: 'Cajero', rol: 'CAJERO', activo: true, tenant: { estado: 'ACTIVO' } }) };
    prisma.auditoriaOperacion = { create: vi.fn().mockResolvedValue({}) };
    const result = await service.supportToken(admin.id, 't1', 'u1');
    expect(prisma.auditoriaOperacion.create).toHaveBeenCalledWith({ data: expect.objectContaining({ tenantId: 't1', usuarioId: 'u1', operacion: 'SOPORTE_IMPERSONAR', datos: expect.objectContaining({ superAdminId: admin.id, readOnly: true }) }) });
    expect(prisma.usuario.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'u1', tenantId: 't1', activo: true } }));
    expect(jwt.sign).toHaveBeenCalledWith(expect.objectContaining({ sub: 'u1', tenantId: 't1', rol: 'CAJERO', type: 'tenant', impersonatedBy: admin.id, readOnly: true }), { expiresIn: '15m' });
    expect(result.user.rol).toBe('CAJERO');
  });

  it('FS SEC-012: no emite token de soporte si la auditoría falla', async () => {
    prisma.superAdmin.findUnique.mockResolvedValue(admin);
    prisma.usuario = { findFirst: vi.fn().mockResolvedValue({ id: 'u1', tenantId: 't1', email: 'u@test.com', rol: 'CAJERO', activo: true, tenant: { estado: 'ACTIVO' } }) };
    prisma.auditoriaOperacion = { create: vi.fn().mockRejectedValue(new Error('db')) };
    await expect(service.supportToken(admin.id, 't1', 'u1')).rejects.toThrow('db');
    expect(jwt.sign).not.toHaveBeenCalled();
  });

  it('rejects support for suspended companies and disabled superadmins', async () => {
    prisma.superAdmin.findUnique.mockResolvedValue({ ...admin, activo: false });
    await expect(service.supportToken(admin.id, 't1', 'u1')).rejects.toThrow('Super Admin no autorizado');
    prisma.superAdmin.findUnique.mockResolvedValue(admin);
    prisma.usuario = { findFirst: vi.fn().mockResolvedValue({ tenant: { estado: 'SUSPENDIDO' } }) };
    await expect(service.supportToken(admin.id, 't1', 'u1')).rejects.toThrow('no disponible para soporte');
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

  it('scopes administrator edits to the selected company and ADMIN role', async () => {
    const tx = { $queryRawUnsafe: vi.fn().mockResolvedValue([]), usuario: { findFirst: vi.fn().mockResolvedValue(null), update: vi.fn() } };
    prisma.$transaction.mockImplementation(callback => callback(tx));
    await expect(service.updateTenantAdmin('company-A', 'admin-of-B', { activo: false })).rejects.toThrow('Administrador no encontrado');
    expect(tx.usuario.findFirst).toHaveBeenCalledWith({ where: { id: 'admin-of-B', tenantId: 'company-A', rol: 'ADMIN' } });
    expect(tx.usuario.update).not.toHaveBeenCalled();
  });

  it('retains the last active administrator', async () => {
    const tx = { $queryRawUnsafe: vi.fn().mockResolvedValue([]), usuario: { findFirst: vi.fn().mockResolvedValue({ activo: true }), count: vi.fn().mockResolvedValue(1), update: vi.fn() } };
    prisma.$transaction.mockImplementation(callback => callback(tx));
    await expect(service.updateTenantAdmin('company-A', 'admin-A', { activo: false })).rejects.toThrow('al menos un administrador');
    expect(tx.usuario.update).not.toHaveBeenCalled();
  });

  it('hashes reset passwords and returns safe fields', async () => {
    const tx = { $queryRawUnsafe: vi.fn().mockResolvedValue([]), usuario: { findFirst: vi.fn().mockResolvedValue({ activo: true }), update: vi.fn().mockResolvedValue({ id: 'admin-A' }) } };
    prisma.$transaction.mockImplementation(callback => callback(tx));
    const result = await service.updateTenantAdmin('company-A', 'admin-A', { password: 'new-password-123' });
    const { data, select } = tx.usuario.update.mock.calls[0][0];
    expect(data.passwordHash).not.toBe('new-password-123');
    expect(await bcrypt.compare('new-password-123', data.passwordHash)).toBe(true);
    expect(select.passwordHash).toBeUndefined();
    expect(result).toEqual({ id: 'admin-A' });
  });
});
