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
      expect(res.user.id).toBe('u-1');
      expect(res.tenant.id).toBe('tenant-1');
      expect(mockResponse.cookie).toHaveBeenCalledWith(
        'refreshToken',
        'mock-jwt-token',
        expect.any(Object),
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
});
