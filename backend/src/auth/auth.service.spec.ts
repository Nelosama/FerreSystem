import { sealSecret, totp } from './mfa';
import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';

describe('AuthService', () => {
  let service: AuthService;

  const mockPrisma: any = {
    usuario: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(async ({ data }: any) => data),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    superAdmin: {
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      update: vi.fn(async ({ data }: any) => data),
      findUnique: vi.fn(),
    },
    authAction: { findUnique: vi.fn().mockResolvedValue(null), deleteMany: vi.fn().mockResolvedValue({ count: 1 }) },
    authEvent: { create: vi.fn().mockResolvedValue({}) },
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
    mockPrisma.usuario.findMany.mockResolvedValue([]);
    mockPrisma.authAction.findUnique.mockResolvedValue(null);
    // Las transacciones de credenciales (fallos, clave temporal) operan sobre el mismo cliente simulado.
    mockPrisma.$transaction = vi.fn((fn: (tx: any) => unknown) => fn(mockPrisma));
    mockConfigService.get.mockImplementation((key, defaultVal) => key === 'AUTH_MFA_ENCRYPTION_KEY' ? 'ab'.repeat(32) : defaultVal);
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
    else mockPrisma.usuario.findFirst.mockRejectedValueOnce(failure);
    const log = vi.spyOn((service as any).logger, 'error').mockImplementation(() => undefined);
    try {
      await service.login({ email: 'security@test.invalid', password: marker, ...(model === 'usuario' && { tenantId: 'tenant-1' }) }, mockResponse);
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
    mockPrisma.usuario.findFirst.mockResolvedValueOnce(null);
    await expect(service.login({ tenantId: 't-1', email: correo, password: 'incorrecta' }, mockResponse)).rejects.toThrow(UnauthorizedException);
    const passwordHash = await bcrypt.hash('correcta', 4);
    mockPrisma.usuario.findFirst.mockResolvedValueOnce({ id: 'u-1', tenantId: 't-1', email: correo, passwordHash, activo: true, rol: 'ADMIN', tenant: { id: 't-1', estado: 'ACTIVO' } });
    await service.login({ tenantId: 't-1', email: correo, password: 'correcta' }, mockResponse);
    const registrado = JSON.stringify(espias.flatMap(e => e.mock.calls));
    expect(registrado.length).toBeGreaterThan(50);
    expect(registrado).not.toContain(correo);
    expect(registrado).not.toContain('persona.privada');
    espias.forEach(e => e.mockRestore());
  });

  describe('login unificado de Super Admin', () => {
    it('autentica Super Admin sin MFA aunque tenga un secreto configurado y emite el tipo de sesión correcto', async () => {
      const passwordHash = await bcrypt.hash('super-admin-test-password', 4);
      mockPrisma.superAdmin.findUnique.mockResolvedValue({
        id: 'sa-1',
        nombre: 'Platform Admin',
        mfaSecret: sealSecret('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ', 'sa-1', mockConfigService as any),
        email: 'admin@example.com',
        activo: true,
        passwordHash,
      });

      const result: any = await service.login(
        { email: ' ADMIN@example.com ', password: 'super-admin-test-password' },
        mockResponse,
      );

      expect(result.type).toBe('super_admin');
      expect(result.superAdmin.id).toBe('sa-1');
      expect(result.superAdmin.debeCambiarPassword).toBe(false);
      expect(mockJwtService.sign).toHaveBeenCalledWith(
        { sub: 'sa-1', email: 'admin@example.com', rol: 'SUPER_ADMIN', type: 'super_admin', sid: expect.any(String) },
        expect.any(Object),
      );
      expect(mockResponse.cookie).toHaveBeenCalledWith(
        'superAdminRefreshToken',
        'mock-jwt-token',
        expect.objectContaining({ path: '/api/admin/auth', httpOnly: true }),
      );
      // Solo se consulta si el correo también existe en un negocio (ambigüedad); nunca se compara su contraseña.
      expect(mockPrisma.usuario.findMany).toHaveBeenCalledWith({ where: { email: 'admin@example.com' }, take: 2, include: { tenant: true } });
      expect(mockPrisma.usuario.findFirst).not.toHaveBeenCalled();
    });

    it('un correo compartido por el Super Admin y un usuario de negocio falla sin probar contraseñas', async () => {
      // Con la contraseña correcta de ambas cuentas el intento sigue fallando: no se elige ninguna por contraseña.
      const passwordHash = await bcrypt.hash('clave-compartida-1', 4);
      mockPrisma.superAdmin.findUnique.mockResolvedValue({ id: 'sa-1', email: 'admin@example.com', activo: true, loginFallos: 0, passwordHash });
      mockPrisma.usuario.findMany.mockResolvedValueOnce([{ id: 'u-1', tenantId: 'A', activo: true, rol: 'ADMIN', loginFallos: 0, passwordHash, tenant: { estado: 'ACTIVO' } }]);
      await expect(service.login({ email: 'admin@example.com', password: 'clave-compartida-1' }, mockResponse)).rejects.toMatchObject({ response: { code: 'IDENTIFICADOR_AMBIGUO' } });
      expect(mockPrisma.authAction.findUnique).not.toHaveBeenCalled();
      expect(mockPrisma.superAdmin.update).not.toHaveBeenCalled();
      expect(mockPrisma.usuario.update).not.toHaveBeenCalled();
      expect(mockResponse.cookie).not.toHaveBeenCalled();
    });

    it('no intenta autenticación tenant si falla la contraseña de un email Super Admin existente', async () => {
      const passwordHash = await bcrypt.hash('correct-super-admin-password', 4);
      mockPrisma.superAdmin.findUnique.mockResolvedValue({
        id: 'sa-1',
        email: 'admin@example.com',
        activo: true,
        loginFallos: 0,
        passwordHash,
      });

      await expect(
        service.login({ email: 'admin@example.com', password: 'incorrect-password' }, mockResponse),
      ).rejects.toThrow(UnauthorizedException);
      expect(mockPrisma.usuario.findFirst).not.toHaveBeenCalled();
      // El fallo se cuenta para la cuenta del Super Admin, que no se bloquea.
      expect(mockPrisma.superAdmin.update).toHaveBeenCalledWith({ where: { id: 'sa-1' }, data: { loginFallos: 1 } });
      expect(mockResponse.cookie).not.toHaveBeenCalled();
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

      mockPrisma.usuario.findFirst.mockResolvedValue(mockUser);

      const res = await service.login(
        { tenantId: 'tenant-1', email: 'cajero@lamundial.hn', password: 'Ferre2026!' },
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

      mockPrisma.usuario.findFirst.mockResolvedValue(mockUser);

      await expect(
        service.login(
          { tenantId: 'tenant-1', email: 'cajero@lamundial.hn', password: 'PasswordErroneo!' },
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

      mockPrisma.usuario.findFirst.mockResolvedValue(mockUser);

      await expect(
        service.login(
          { tenantId: 'tenant-1', email: 'inactivo@lamundial.hn', password: 'Ferre2026!' },
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

      mockPrisma.usuario.findFirst.mockResolvedValue(mockUser);

      await expect(
        service.login(
          { tenantId: 'tenant-1', email: 'cajero@lamundial.hn', password: 'Ferre2026!' },
          mockResponse,
        ),
      ).rejects.toThrow('La suscripción de la ferretería se encuentra suspendida');
    });

    it('no selecciona una empresa mediante la contraseña si el correo pertenece a varias', async () => {
      mockPrisma.usuario.findMany.mockResolvedValueOnce([{ tenantId: 'A' }, { tenantId: 'B' }]);
      await expect(service.login({ email: 'usuario@empresa.com', password: 'ClaveTenant2!' }, mockResponse)).rejects.toMatchObject({ status: 401, response: { code: 'IDENTIFICADOR_AMBIGUO' } });
      expect(mockPrisma.usuario.findMany).toHaveBeenCalledWith({ where: { email: 'usuario@empresa.com' }, take: 2, include: { tenant: true } });
      expect(mockPrisma.usuario.findFirst).not.toHaveBeenCalled();
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

  describe('identificador único, fallos por cuenta y clave temporal', () => {
    const tenant = { id: 't-1', estado: 'ACTIVO', nombreComercial: 'Ferretería' };
    const cuenta = async (extra: Record<string, unknown> = {}) => ({
      id: 'u-9', tenantId: 't-1', nombre: 'Cajera', email: null, username: 'cajera1', passwordHash: await bcrypt.hash('Correcta2026', 4),
      rol: 'CAJERO', activo: true, loginFallos: 0, bloqueadoAt: null, debeCambiarPassword: false, tenant, ...extra,
    });

    it('resuelve usuario o código sin empresa cuando existe una sola cuenta', async () => {
      const usuario = await cuenta();
      mockPrisma.usuario.findMany.mockResolvedValueOnce([usuario]);
      const res: any = await service.login({ email: ' CAJERA1 ', password: 'Correcta2026' }, mockResponse);
      expect(mockPrisma.usuario.findMany).toHaveBeenCalledWith({ where: { username: 'cajera1' }, take: 2, include: { tenant: true } });
      expect(mockPrisma.superAdmin.findUnique).not.toHaveBeenCalled();
      expect(res.type).toBe('tenant');
      expect(res.tenant.id).toBe('t-1');
      expect(res.user.debeCambiarPassword).toBe(false);
    });

    it('el sexto fallo consecutivo bloquea a un rol distinto de ADMIN y revoca sus sesiones', async () => {
      const usuario = await cuenta({ loginFallos: 5 });
      mockPrisma.usuario.findMany.mockResolvedValueOnce([usuario]);
      mockPrisma.usuario.findUnique.mockResolvedValueOnce(usuario);
      await expect(service.login({ email: 'cajera1', password: 'Incorrecta1' }, mockResponse)).rejects.toThrow('Credenciales inválidas');
      expect(mockPrisma.usuario.update).toHaveBeenCalledWith({ where: { id: 'u-9' }, data: { loginFallos: 6, bloqueadoAt: expect.any(Date) } });
      expect(mockPrisma.sesionAuth.updateMany).toHaveBeenCalledWith({ where: { sujetoId: 'u-9', revokedAt: null }, data: expect.objectContaining({ revocationMotivo: 'CUENTA_BLOQUEADA' }) });
      expect(mockPrisma.authEvent.create).toHaveBeenCalledWith({ data: { actorId: 'u-9', sujetoId: 'u-9', tenantId: 't-1', event: 'ACCOUNT_LOCKED' } });
    });

    it('el quinto fallo de un empleado todavía no lo bloquea', async () => {
      const usuario = await cuenta({ loginFallos: 4 });
      mockPrisma.usuario.findMany.mockResolvedValueOnce([usuario]);
      mockPrisma.usuario.findUnique.mockResolvedValueOnce(usuario);
      await expect(service.login({ email: 'cajera1', password: 'Incorrecta1' }, mockResponse)).rejects.toThrow(UnauthorizedException);
      expect(mockPrisma.usuario.update).toHaveBeenCalledWith({ where: { id: 'u-9' }, data: { loginFallos: 5 } });
      expect(mockPrisma.authEvent.create).not.toHaveBeenCalled();
    });

    it('un ADMIN no queda bloqueado por fallos consecutivos', async () => {
      const usuario = await cuenta({ rol: 'ADMIN', loginFallos: 9 });
      mockPrisma.usuario.findMany.mockResolvedValueOnce([usuario]);
      mockPrisma.usuario.findUnique.mockResolvedValueOnce(usuario);
      await expect(service.login({ email: 'cajera1', password: 'Incorrecta1' }, mockResponse)).rejects.toThrow(UnauthorizedException);
      expect(mockPrisma.usuario.update).toHaveBeenCalledWith({ where: { id: 'u-9' }, data: { loginFallos: 10 } });
    });

    it('una cuenta bloqueada no entra ni con la contraseña correcta, y con una incorrecta no revela el bloqueo', async () => {
      const bloqueada = await cuenta({ loginFallos: 6, bloqueadoAt: new Date() });
      mockPrisma.usuario.findMany.mockResolvedValueOnce([bloqueada]);
      await expect(service.login({ email: 'cajera1', password: 'Correcta2026' }, mockResponse)).rejects.toMatchObject({ status: 401, response: { code: 'CUENTA_BLOQUEADA' } });
      mockPrisma.usuario.findMany.mockResolvedValueOnce([bloqueada]);
      mockPrisma.usuario.findUnique.mockResolvedValueOnce(bloqueada);
      const incorrecta = service.login({ email: 'cajera1', password: 'Incorrecta1' }, mockResponse);
      await expect(incorrecta).rejects.toThrow('Credenciales inválidas');
      await expect(incorrecta).rejects.not.toMatchObject({ response: { code: 'CUENTA_BLOQUEADA' } });
      expect(mockResponse.cookie).not.toHaveBeenCalled();
    });

    it('una clave temporal vigente se consume una vez, revoca sesiones y obliga a cambiar la contraseña', async () => {
      const admin = await cuenta({ rol: 'ADMIN', email: 'admin@ferre.test', loginFallos: 3 });
      const { tokenHash } = await import('./mfa');
      const accion = { hash: tokenHash('Abcd-Efgh-Jkmn-Pqrs'), purpose: 'TEMP_PASSWORD', sujetoId: 'u-9', tipo: 'TENANT', email: 'admin@ferre.test', passwordBinding: tokenHash(admin.passwordHash), expiresAt: new Date(Date.now() + 60_000) };
      mockPrisma.usuario.findMany.mockResolvedValueOnce([admin]);
      mockPrisma.usuario.findUnique.mockResolvedValueOnce(admin);
      mockPrisma.authAction.findUnique.mockResolvedValue(accion);
      const res: any = await service.login({ email: 'admin@ferre.test', password: 'Abcd-Efgh-Jkmn-Pqrs' }, mockResponse);
      expect(res.user.debeCambiarPassword).toBe(true);
      expect(mockPrisma.authAction.deleteMany).toHaveBeenCalledWith({ where: { hash: accion.hash } });
      expect(mockPrisma.usuario.update).toHaveBeenCalledWith({ where: { id: 'u-9' }, data: { debeCambiarPassword: true, loginFallos: 0 } });
      expect(mockPrisma.sesionAuth.updateMany).toHaveBeenCalledWith({ where: { sujetoId: 'u-9', revokedAt: null }, data: expect.objectContaining({ revocationMotivo: 'CLAVE_TEMPORAL' }) });
      expect(mockPrisma.authEvent.create).toHaveBeenCalledWith({ data: expect.objectContaining({ event: 'TEMP_PASSWORD_USED', sujetoId: 'u-9' }) });
      // La sesión nueva se crea después de revocar las anteriores.
      expect(mockPrisma.sesionAuth.updateMany.mock.invocationCallOrder[0]).toBeLessThan(mockPrisma.sesionAuth.create.mock.invocationCallOrder[0]);
    });

    it.each([
      ['vencida', { expiresAt: new Date(Date.now() - 1) }],
      ['emitida antes de un cambio de contraseña', { passwordBinding: 'otro-hash' }],
      ['de otra cuenta', { sujetoId: 'u-otra' }],
    ])('rechaza una clave temporal %s y cuenta el fallo', async (_caso, cambio) => {
      const admin = await cuenta({ rol: 'ADMIN', email: 'admin@ferre.test' });
      const { tokenHash } = await import('./mfa');
      mockPrisma.usuario.findMany.mockResolvedValueOnce([admin]);
      mockPrisma.usuario.findUnique.mockResolvedValueOnce(admin);
      mockPrisma.authAction.findUnique.mockResolvedValue({ hash: 'h', purpose: 'TEMP_PASSWORD', sujetoId: 'u-9', tipo: 'TENANT', email: 'admin@ferre.test', passwordBinding: tokenHash(admin.passwordHash), expiresAt: new Date(Date.now() + 60_000), ...cambio });
      await expect(service.login({ email: 'admin@ferre.test', password: 'Abcd-Efgh-Jkmn-Pqrs' }, mockResponse)).rejects.toThrow('Credenciales inválidas');
      expect(mockPrisma.usuario.update).toHaveBeenCalledWith({ where: { id: 'u-9' }, data: { loginFallos: 1 } });
      expect(mockPrisma.authAction.deleteMany).not.toHaveBeenCalled();
      expect(mockResponse.cookie).not.toHaveBeenCalled();
    });

    it('un acceso correcto reinicia los fallos y descarta la clave temporal pendiente', async () => {
      const admin = await cuenta({ rol: 'ADMIN', email: 'admin@ferre.test', loginFallos: 3 });
      mockPrisma.usuario.findMany.mockResolvedValueOnce([admin]);
      await service.login({ email: 'admin@ferre.test', password: 'Correcta2026' }, mockResponse);
      expect(mockPrisma.usuario.updateMany).toHaveBeenCalledWith({ where: { id: 'u-9', loginFallos: { gt: 0 } }, data: { loginFallos: 0 } });
      expect(mockPrisma.authAction.deleteMany).toHaveBeenCalledWith({ where: { sujetoId: 'u-9', purpose: 'TEMP_PASSWORD' } });
    });

    it('pide el código MFA a una cuenta de negocio que lo configuró, sin contarlo como intento fallido', async () => {
      const secreto = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
      const usuario = await cuenta({ mfaSecret: sealSecret(secreto, 'u-9', mockConfigService as any), mfaLastStep: null });
      mockPrisma.usuario.findMany.mockResolvedValue([usuario]);
      await expect(service.login({ email: 'cajera1', password: 'Correcta2026' }, mockResponse)).rejects.toMatchObject({ response: { code: 'MFA_REQUERIDO' } });
      expect(mockPrisma.$executeRaw).not.toHaveBeenCalled();
      const res: any = await service.login({ email: 'cajera1', password: 'Correcta2026', mfaCode: totp(secreto, Math.floor(Date.now() / 30000)) }, mockResponse);
      expect(res.type).toBe('tenant');
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
    mockPrisma.usuario.findFirst.mockResolvedValue({ id: 'u-1', tenantId: 'tenant-1', email: 'test@example.test', passwordHash, activo: true, tenant: { id: 'tenant-1', estado: 'ACTIVO' } });
    await service.login({ tenantId: 'tenant-1', email: 'test@example.test', password: 'test-password' }, mockResponse);
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
