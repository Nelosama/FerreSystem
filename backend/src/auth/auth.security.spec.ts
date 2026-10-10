import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';

// SEC fase 2: el estado de la cuenta solo se revela a quien ya demostró la contraseña.
describe('AuthService / oráculo de cuentas', () => {
  let service: AuthService;
  const mockPrisma = {
    usuario: { findFirst: vi.fn(), findMany: vi.fn(), findUnique: vi.fn() },
    superAdmin: { findUnique: vi.fn().mockResolvedValue(null) },
  };
  const res = { cookie: vi.fn(), clearCookie: vi.fn() } as any;
  const passwordHash = bcrypt.hashSync('Clave-Correcta-2026!', 4);
  const jwtMock = { sign: vi.fn().mockReturnValue('token'), verify: vi.fn() };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: JwtService, useValue: jwtMock },
        { provide: ConfigService, useValue: { get: (_key: string, fallback?: unknown) => fallback } },
      ],
    }).compile();
    service = module.get(AuthService);
  });

  afterEach(() => vi.clearAllMocks());

  it('refresh rechaza un token de acceso que no declara tipo refresh', async () => {
    jwtMock.verify.mockReturnValue({ sub: 'u-1', type: 'tenant', tenantId: 't-1' });
    mockPrisma.usuario.findUnique.mockResolvedValue({ id: 'u-1', tenantId: 't-1', activo: true, tenant: { estado: 'ACTIVO' } });
    await expect(service.refresh('access-token', res)).rejects.toThrow('Refresh token expirado o inválido');
    expect(jwtMock.sign).not.toHaveBeenCalled();
  });

  it('una cuenta inactiva con contraseña incorrecta responde como credenciales inválidas', async () => {
    mockPrisma.usuario.findMany.mockResolvedValue([{ id: 'u-1', tenantId: 't-1', email: 'inactivo@test.invalid', passwordHash, activo: false, tenant: { estado: 'ACTIVO' } }]);
    await expect(service.login({ email: 'inactivo@test.invalid', password: 'otra-clave' }, res)).rejects.toThrow('Credenciales inválidas');
  });

  it('una empresa suspendida con contraseña incorrecta responde como credenciales inválidas', async () => {
    mockPrisma.usuario.findMany.mockResolvedValue([{ id: 'u-1', tenantId: 't-1', email: 'suspendido@test.invalid', passwordHash, activo: true, tenant: { estado: 'SUSPENDIDO' } }]);
    await expect(service.login({ email: 'suspendido@test.invalid', password: 'otra-clave' }, res)).rejects.toThrow('Credenciales inválidas');
  });

  it('con la contraseña correcta sigue informando el estado de la cuenta', async () => {
    mockPrisma.usuario.findMany.mockResolvedValue([{ id: 'u-1', tenantId: 't-1', email: 'inactivo@test.invalid', passwordHash, activo: false, tenant: { estado: 'ACTIVO' } }]);
    await expect(service.login({ email: 'inactivo@test.invalid', password: 'Clave-Correcta-2026!' }, res)).rejects.toThrow('Este usuario ha sido desactivado');
  });
});
