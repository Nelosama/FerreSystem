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
    },
    superAdmin: {
      findUnique: vi.fn(),
    },
  };

  const mockJwtService = {
    sign: vi.fn().mockReturnValue('mock-jwt-token'),
    verify: vi.fn(),
  };

  const mockConfigService = {
    get: vi.fn((key: string, defaultVal: any) => defaultVal),
  };

  const mockResponse = {
    cookie: vi.fn(),
    clearCookie: vi.fn(),
  } as any;

  beforeEach(async () => {
    mockPrisma.superAdmin.findUnique.mockReset();
    mockConfigService.get.mockImplementation((_key, defaultVal) => defaultVal);
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
        { email: ' ADMIN@example.com ', password: 'super-admin-test-password' },
        mockResponse,
      );

      expect(result.type).toBe('super_admin');
      expect(result.superAdmin.id).toBe('sa-1');
      expect(mockJwtService.sign).toHaveBeenCalledWith(
        { sub: 'sa-1', email: 'admin@example.com', rol: 'SUPER_ADMIN', type: 'super_admin' },
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
        { email: 'cajero@lamundial.hn', password: 'Ferre2026!' },
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
          { email: 'cajero@lamundial.hn', password: 'PasswordErroneo!' },
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
          { email: 'inactivo@lamundial.hn', password: 'Ferre2026!' },
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
          { email: 'cajero@lamundial.hn', password: 'Ferre2026!' },
          mockResponse,
        ),
      ).rejects.toThrow('La suscripción de la ferretería se encuentra suspendida');
    });

    it('debe resolver la cuenta correcta cuando existe el mismo correo en 2 tenants distintos', async () => {
      const passwordHash1 = await bcrypt.hash('ClaveTenant1!', 10);
      const passwordHash2 = await bcrypt.hash('ClaveTenant2!', 10);

      const userTenant1 = {
        id: 'u-1',
        tenantId: 'tenant-1',
        email: 'usuario@empresa.com',
        passwordHash: passwordHash1,
        rol: 'ADMIN',
        activo: true,
        tenant: { id: 'tenant-1', estado: 'ACTIVO', nombreComercial: 'Ferretería 1' },
      };

      const userTenant2 = {
        id: 'u-2',
        tenantId: 'tenant-2',
        email: 'usuario@empresa.com',
        passwordHash: passwordHash2,
        rol: 'ADMIN',
        activo: true,
        tenant: { id: 'tenant-2', estado: 'ACTIVO', nombreComercial: 'Ferretería 2' },
      };

      mockPrisma.usuario.findMany.mockResolvedValue([userTenant1, userTenant2]);

      const res = await service.login(
        { email: 'usuario@empresa.com', password: 'ClaveTenant2!' },
        mockResponse,
      );

      expect(res.user.id).toBe('u-2');
      expect(res.tenant.id).toBe('tenant-2');
      expect(res.type).toBe('tenant');
    });

    it('debe usar el tenantId explícito cuando es provisto en loginDto', async () => {
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

      mockPrisma.usuario.findFirst.mockResolvedValue(userTenant2);

      const res = await service.login(
        { email: 'usuario@empresa.com', password: 'ClaveTenant2!', tenantId: 'tenant-2' },
        mockResponse,
      );

      expect(mockPrisma.usuario.findFirst).toHaveBeenCalledWith({
        where: { tenantId: 'tenant-2', email: 'usuario@empresa.com' },
        include: { tenant: true },
      });
      expect(res.user.id).toBe('u-2');
    });
  });

  describe('refresh y logout tenant', () => {
    it('refresca únicamente una sesión tenant activa', async () => {
      mockJwtService.verify.mockReturnValue({ sub: 'u-1', type: 'tenant', tenantId: 'tenant-1', typ: 'refresh' });
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
    });

    it('rechaza un refresh Super Admin en el endpoint tenant y limpia solo su cookie', async () => {
      mockJwtService.verify.mockReturnValue({ sub: 'sa-1', type: 'super_admin', rol: 'SUPER_ADMIN' });

      await expect(service.refresh('super-admin-refresh', mockResponse)).rejects.toThrow(UnauthorizedException);
      expect(mockPrisma.usuario.findUnique).not.toHaveBeenCalled();
      expect(mockResponse.clearCookie).toHaveBeenCalledWith('refreshToken', { path: '/' });
    });

    it('logout tenant elimina la cookie tenant', () => {
      expect(service.logout(mockResponse)).toMatchObject({ success: true });
      expect(mockResponse.clearCookie).toHaveBeenCalledWith('refreshToken', { path: '/' });
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
