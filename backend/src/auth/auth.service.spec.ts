import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';

describe('AuthService', () => {
  let service: AuthService;

  const mockPrisma = {
    usuario: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    authTempPassword: { findUnique: vi.fn().mockResolvedValue(null), deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
    superAdmin: {
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      findUnique: vi.fn(),
    },
    sesionAuth: { create: vi.fn().mockResolvedValue({}), findUnique: vi.fn(), updateMany: vi.fn().mockResolvedValue({ count: 1 }) }, $queryRaw: vi.fn().mockResolvedValue([{ segundos: 0 }]), $executeRaw: vi.fn().mockResolvedValue(0),
  };

  const mockJwtService = {
    sign: vi.fn().mockReturnValue('mock-jwt-token'),
    verify: vi.fn(),
    decode: vi.fn().mockReturnValue({ exp: 4102444800 }),
  };

  const mockConfigService = {
    get: vi.fn((key: string, defaultVal: any) => defaultVal),
  };

  const mockResponse = {
    cookie: vi.fn(),
    clearCookie: vi.fn(),
    setHeader: vi.fn(),
  } as any;

  beforeEach(async () => {
    mockPrisma.superAdmin.findUnique.mockReset();
    mockConfigService.get.mockImplementation((key, defaultVal) => defaultVal);
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: JwtService, useValue: mockJwtService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('debe estar definido', () => {
    expect(service).toBeDefined();
  });

  it.each(['superAdmin', 'usuario'] as const)('no expone detalles del error de %s en logs ni respuesta de login', async (model) => {
    const marker = 'synthetic-private-credential-marker';
    const failure = Object.assign(new Error(`postgresql://user:${marker}@db.invalid/db`), {
      code: marker, meta: { code: marker },
    });
    mockPrisma.superAdmin.findUnique.mockResolvedValue(null);
    if (model === 'superAdmin') mockPrisma.superAdmin.findUnique.mockRejectedValueOnce(failure);
    else mockPrisma.usuario.findMany.mockRejectedValueOnce(failure);
    const log = vi.spyOn((service as any).logger, 'error').mockImplementation(() => undefined);
    try {
      await service.login({ usuario: 'security@test.invalid', password: marker }, mockResponse);
      expect.fail('Debe responder con error');
    } catch (error: any) {
      expect(error.getStatus()).toBe(500);
      expect(error.getResponse()).toMatchObject({ code: 'N/A', error: 'DatabaseQueryError' });
      expect(JSON.stringify(error.getResponse())).not.toContain(marker);
    }
    expect(log).toHaveBeenCalled();
    expect(JSON.stringify(log.mock.calls)).not.toContain(marker);
    expect(mockResponse.cookie).not.toHaveBeenCalled();
    log.mockRestore();
  });

  it('los registros del login no contienen el correo, ni en un acceso correcto ni en uno fallido', async () => {
    const correo = 'persona.privada@cliente.invalid';
    const logger = (service as any).logger;
    const espias = (['log', 'warn', 'error'] as const).map(nivel => vi.spyOn(logger, nivel).mockImplementation(() => undefined));
    mockPrisma.superAdmin.findUnique.mockResolvedValue(null);
    mockPrisma.usuario.findMany.mockResolvedValueOnce([]);
    await expect(service.login({ email: correo, password: 'incorrecta' }, mockResponse)).rejects.toThrow(UnauthorizedException);
    const passwordHash = await bcrypt.hash('correcta', 4);
    mockPrisma.usuario.findMany.mockResolvedValueOnce([{ id: 'u-1', tenantId: 't-1', email: correo, passwordHash, activo: true, rol: 'ADMIN', tenant: { id: 't-1', estado: 'ACTIVO' } }]);
    await service.login({ email: correo, password: 'correcta' }, mockResponse);
    const registrado = JSON.stringify(espias.flatMap(e => e.mock.calls));
    expect(registrado.length).toBeGreaterThan(50);
    expect(registrado).not.toContain(correo);
    expect(registrado).not.toContain('persona.privada');
    espias.forEach(e => e.mockRestore());
  });

  describe('login unificado de Super Admin', () => {
    it('autentica Super Admin desde el mismo servicio y emite el tipo de sesión correcto', async () => {
      const passwordHash = await bcrypt.hash('super-admin-test-password', 4);
      mockPrisma.superAdmin.findUnique.mockResolvedValue({
        id: 'sa-1',
        nombre: 'Platform Admin',
        email: 'admin@example.com',
        activo: true,
        passwordHash,
      });

      const result = await service.login(
        { usuario: ' ADMIN@example.com ', password: 'super-admin-test-password' },
        mockResponse,
      );

      expect(result.type).toBe('super_admin');
      expect(result.superAdmin.id).toBe('sa-1');
      expect(mockJwtService.sign).toHaveBeenCalledWith(
        { sub: 'sa-1', email: 'admin@example.com', rol: 'SUPER_ADMIN', type: 'super_admin', sid: expect.any(String) },
        expect.any(Object),
      );
      expect(mockResponse.cookie).toHaveBeenCalledWith(
        'superAdminRefreshToken',
        'mock-jwt-token',
        expect.objectContaining({ path: '/api/admin/auth', httpOnly: true }),
      );
      expect(mockPrisma.usuario.findMany).not.toHaveBeenCalled();
    });

    it('no intenta autenticación tenant si falla la contraseña de un email Super Admin existente', async () => {
      const passwordHash = await bcrypt.hash('correct-super-admin-password', 4);
      mockPrisma.superAdmin.findUnique.mockResolvedValue({
        id: 'sa-1',
        email: 'admin@example.com',
        activo: true,
        passwordHash,
      });

      await expect(
        service.login({ email: 'admin@example.com', password: 'incorrect-password' }, mockResponse),
      ).rejects.toThrow(UnauthorizedException);
      expect(mockPrisma.usuario.findMany).not.toHaveBeenCalled();
    });
  });

  describe('login de usuario tenant', () => {
    it('debe autenticar correctamente con email y clave válidos', async () => {
      const passwordHash = await bcrypt.hash('Ferre2026!', 10);
      const mockUser = {
        id: 'u-1',
        tenantId: 'tenant-1',
        nombre: 'Carlos Ramos',
        email: 'cajero@lamundial.hn',
        passwordHash,
        rol: 'ADMIN',
        activo: true,
        tenant: {
          id: 'tenant-1',
          nombreComercial: 'LA MUNDIAL',
          logoUrl: null,
          colorPrimario: '#EA580C',
          estado: 'ACTIVO',
        },
      };

      mockPrisma.usuario.findMany.mockResolvedValue([mockUser]);

      const res = await service.login(
        { usuario: 'cajero@lamundial.hn', password: 'Ferre2026!' },
        mockResponse,
      );

      expect(res.accessToken).toBe('mock-jwt-token');
      expect(res.type).toBe('tenant');
      expect(res.user.id).toBe('u-1');
      expect(res.tenant.id).toBe('tenant-1');
      expect(mockResponse.cookie).toHaveBeenCalledWith(
        'refreshToken',
        'mock-jwt-token',
        expect.objectContaining({ path: '/', httpOnly: true, sameSite: 'strict' }),
      );
    });

    it('debe rechazar un usuario con contraseña incorrecta', async () => {
      const passwordHash = await bcrypt.hash('Ferre2026!', 10);
      const mockUser = {
        id: 'u-1',
        tenantId: 'tenant-1',
        email: 'cajero@lamundial.hn',
        passwordHash,
        activo: true,
        tenant: { estado: 'ACTIVO' },
      };

      mockPrisma.usuario.findMany.mockResolvedValue([mockUser]);

      await expect(
        service.login(
          { usuario: 'cajero@lamundial.hn', password: 'PasswordErroneo!' },
          mockResponse,
        ),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('debe rechazar un usuario inactivo', async () => {
      const passwordHash = await bcrypt.hash('Ferre2026!', 10);
      const mockUser = {
        id: 'u-1',
        tenantId: 'tenant-1',
        email: 'inactivo@lamundial.hn',
        passwordHash,
        activo: false,
        tenant: { estado: 'ACTIVO' },
      };

      mockPrisma.usuario.findMany.mockResolvedValue([mockUser]);

      await expect(
        service.login(
          { usuario: 'inactivo@lamundial.hn', password: 'Ferre2026!' },
          mockResponse,
        ),
      ).rejects.toThrow('Este usuario ha sido desactivado');
    });

    it('debe rechazar login si el tenant está suspendido', async () => {
      const passwordHash = await bcrypt.hash('Ferre2026!', 10);
      const mockUser = {
        id: 'u-1',
        tenantId: 'tenant-1',
        email: 'cajero@lamundial.hn',
        passwordHash,
        activo: true,
        tenant: { estado: 'SUSPENDIDO' },
      };

      mockPrisma.usuario.findMany.mockResolvedValue([mockUser]);

      await expect(
        service.login(
          { usuario: 'cajero@lamundial.hn', password: 'Ferre2026!' },
          mockResponse,
        ),
      ).rejects.toThrow('La suscripción de la ferretería se encuentra suspendida');
    });

    it('no selecciona una empresa mediante la contraseña si el correo pertenece a varias', async () => {
      mockPrisma.usuario.findMany.mockResolvedValueOnce([{ tenantId: 'A' }, { tenantId: 'B' }]);
      await expect(service.login({ email: 'usuario@empresa.com', password: 'ClaveTenant2!' }, mockResponse)).rejects.toThrow(UnauthorizedException);
      expect(mockPrisma.usuario.findMany).toHaveBeenCalledWith({ where: { email: 'usuario@empresa.com' }, take: 2, include: { tenant: true } });
      expect(mockPrisma.usuario.findFirst).not.toHaveBeenCalled();
    });

    it('determina la empresa y el rol solo con las credenciales, sin tenantId ni selector de rol', async () => {
      const passwordHash = await bcrypt.hash('ClaveTenant2!', 10);
      const userTenant2 = {
        id: 'u-2',
        tenantId: 'tenant-2',
        email: 'usuario@empresa.com',
        passwordHash,
        rol: 'ADMIN',
        activo: true,
        tenant: { id: 'tenant-2', estado: 'ACTIVO', nombreComercial: 'Ferretería 2' },
      };

      mockPrisma.usuario.findMany.mockResolvedValue([userTenant2]);

      const res = await service.login(
        { usuario: 'usuario@empresa.com', password: 'ClaveTenant2!' },
        mockResponse,
      );

      expect(mockPrisma.usuario.findMany).toHaveBeenCalledWith({
        where: { email: 'usuario@empresa.com' }, take: 2, include: { tenant: true },
      });
      expect(mockPrisma.usuario.findFirst).not.toHaveBeenCalled();
      expect(res.user.id).toBe('u-2');
      expect(res.user.rol).toBe('ADMIN');
      expect(res.tenant.id).toBe('tenant-2');
    });
  });

  describe('refresh y logout tenant', () => {
    it('refresca únicamente una sesión tenant activa', async () => {
      mockJwtService.verify.mockReturnValue({ sub: 'u-1', type: 'tenant', tenantId: 'tenant-1', typ: 'refresh', sid: 's-1', jti: 'jti-1' });
      // Fila bloqueada de la sesión: el jti presentado es el vigente, así que se rota.
      const tx = {
        $queryRaw: vi.fn().mockResolvedValue([{ sujeto_id: 'u-1', revoked_at: null, expires_at: new Date(Date.now() + 60_000), refresh_jti: 'jti-1', refresh_jti_anterior: null, refresh_rotado_at: null }]),
        $executeRaw: vi.fn().mockResolvedValue(1),
      };
      (mockPrisma as any).$transaction = vi.fn((fn: (t: typeof tx) => unknown) => fn(tx));
      mockPrisma.usuario.findUnique.mockResolvedValue({
        id: 'u-1',
        tenantId: 'tenant-1',
        rol: 'ADMIN',
        email: 'admin@tenant.test',
        activo: true,
        tenant: { estado: 'ACTIVO' },
      });

      await expect(service.refresh('tenant-refresh', mockResponse)).resolves.toEqual({
        accessToken: 'mock-jwt-token',
      });
      expect(mockJwtService.sign).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'tenant', tenantId: 'tenant-1' }),
        expect.any(Object),
      );
      // La cookie se sustituye por un refresh con un jti nuevo y sin alargar la sesión (≤ 60 s restantes).
      const firmaRefresh = mockJwtService.sign.mock.calls.find(([payload]: any[]) => payload.typ === 'refresh');
      expect(firmaRefresh[1].jwtid).toEqual(expect.any(String));
      expect(firmaRefresh[1].jwtid).not.toBe('jti-1');
      expect(firmaRefresh[1].expiresIn).toBeLessThanOrEqual(60);
      expect(mockResponse.cookie).toHaveBeenCalledWith('refreshToken', 'mock-jwt-token', expect.objectContaining({ httpOnly: true, path: '/' }));
    });

    it('rechaza un refresh Super Admin en el endpoint tenant y limpia solo su cookie', async () => {
      mockJwtService.verify.mockReturnValue({ sub: 'sa-1', type: 'super_admin', rol: 'SUPER_ADMIN' });

      await expect(service.refresh('super-admin-refresh', mockResponse)).rejects.toThrow(UnauthorizedException);
      expect(mockPrisma.usuario.findUnique).not.toHaveBeenCalled();
      expect(mockResponse.clearCookie).toHaveBeenCalledWith('refreshToken', expect.objectContaining({ path: '/', httpOnly: true, secure: false, sameSite: 'strict' }));
    });

    it('logout tenant elimina la cookie tenant', async () => {
      expect(await service.logout(mockResponse)).toMatchObject({ success: true });
      expect(mockResponse.clearCookie).toHaveBeenCalledWith('refreshToken', expect.objectContaining({ path: '/', httpOnly: true, secure: false, sameSite: 'strict' }));
    });
  });

  it('emite cookie segura cross-site en producción para frontend y API en dominios distintos', async () => {
    mockConfigService.get.mockImplementation((key, defaultVal) => key === 'NODE_ENV' ? 'production' : defaultVal);
    const passwordHash = await bcrypt.hash('test-password', 4);
    mockPrisma.usuario.findMany.mockResolvedValue([{ id: 'u-1', tenantId: 'tenant-1', email: 'test@example.test', passwordHash, activo: true, tenant: { id: 'tenant-1', estado: 'ACTIVO' } }]);
    await service.login({ email: 'test@example.test', password: 'test-password' }, mockResponse);
    expect(mockResponse.cookie).toHaveBeenCalledWith('refreshToken', 'mock-jwt-token', expect.objectContaining({ httpOnly: true, secure: true, sameSite: 'none', path: '/' }));
  });
});

describe('refresh: indisponibilidad de infraestructura', () => {
  it('no convierte una caída de BD en 401 ni elimina la cookie recuperable', async () => {
    const databaseError = new Error('DB temporalmente no disponible');
    const jwt = { verify: () => ({ sub: 'u', tenantId: 't', type: 'tenant', typ: 'refresh', sid: 's' }) } as any;
    const config = { get: (_key: string, fallback: any) => fallback } as any;
    // Caída al leer el usuario y caída durante la rotación: ninguna borra la cookie ni responde 401.
    for (const prisma of [
      { usuario: { findUnique: vi.fn().mockRejectedValue(databaseError) } },
      { usuario: { findUnique: vi.fn().mockResolvedValue({ id: 'u', tenantId: 't', activo: true, tenant: { estado: 'ACTIVO' } }) }, $transaction: vi.fn().mockRejectedValue(databaseError) },
    ]) {
      const service = new AuthService(prisma as any, jwt, config);
      const res = { clearCookie: vi.fn(), cookie: vi.fn() } as any;
      await expect(service.refresh('valid-refresh', res)).rejects.toBe(databaseError);
      expect(res.clearCookie).not.toHaveBeenCalled();
      expect(res.cookie).not.toHaveBeenCalled();
    }
  });
});
