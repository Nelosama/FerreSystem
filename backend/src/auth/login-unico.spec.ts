import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { MAX_FALLOS_BLOQUEO } from './bloqueo-cuenta';
import { resolverCuenta, identificadorEnUso } from './identidad-login';

// Login de un solo campo: la empresa y el rol salen de la cuenta; los contadores viven en el servidor.
const claveCorrecta = 'Clave-Correcta-2026!';
const hash = bcrypt.hashSync(claveCorrecta, 4);
const tenant = { id: 't-1', estado: 'ACTIVO', nombreComercial: 'Ferretería' };
const cuenta = (extra: Record<string, unknown> = {}) => ({ id: 'u-1', tenantId: 't-1', nombre: 'N', email: 'u@t.test', username: 'u1', passwordHash: hash, activo: true, rol: 'CAJERO', intentosFallidos: 0, bloqueadoAt: null, emailVerifiedAt: null, tenant, ...extra });

function montar(fila: { fallos: number; bloqueada_ahora?: boolean; bloqueada?: boolean } = { fallos: 1 }) {
  const consultas: string[] = [];
  const prisma: any = {
    usuario: { findMany: vi.fn().mockResolvedValue([]), findFirst: vi.fn(), updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    superAdmin: { findUnique: vi.fn().mockResolvedValue(null), updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    authTempPassword: { findUnique: vi.fn().mockResolvedValue(null), updateMany: vi.fn().mockResolvedValue({ count: 1 }), deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
    authAction: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }), create: vi.fn().mockResolvedValue({}) },
    authEvent: { create: vi.fn().mockResolvedValue({}) },
    sesionAuth: { create: vi.fn().mockResolvedValue({}) },
    $queryRaw: vi.fn(async (strings: TemplateStringsArray) => {
      const sql = strings.join('?');
      consultas.push(sql);
      return /UPDATE (usuarios|super_admins)/.test(sql) ? [fila] : [{ segundos: 0 }];
    }),
    $executeRaw: vi.fn().mockResolvedValue(0),
  };
  prisma.$transaction = vi.fn((fn: any) => fn(prisma));
  const jwt: any = { sign: vi.fn().mockReturnValue('jwt'), decode: vi.fn().mockReturnValue({ exp: 4102444800 }), verify: vi.fn() };
  const config: any = { get: (_k: string, f?: unknown) => f };
  const res: any = { cookie: vi.fn(), clearCookie: vi.fn(), setHeader: vi.fn() };
  return { prisma, jwt, res, service: new AuthService(prisma, jwt, config), consultas };
}

describe('resolución de cuenta sin indicar empresa', () => {
  it('un código repetido en dos empresas no se resuelve ni se prueba contra ninguna contraseña', async () => {
    const { service, prisma, res } = montar();
    prisma.usuario.findMany.mockResolvedValue([cuenta({ tenantId: 'A' }), cuenta({ id: 'u-2', tenantId: 'B' })]);
    await expect(service.login({ usuario: '44556', password: claveCorrecta }, res)).rejects.toThrow('Credenciales inválidas');
    expect(prisma.usuario.findMany).toHaveBeenCalledWith({ where: { username: '44556' }, take: 2, include: { tenant: true } });
    expect(res.cookie).not.toHaveBeenCalled();
    expect(prisma.sesionAuth.create).not.toHaveBeenCalled();
  });

  it('un código único se resuelve a su empresa y rol (usuario, código o correo)', async () => {
    const { service, prisma, res } = montar();
    prisma.usuario.findMany.mockResolvedValue([cuenta({ rol: 'VENDEDOR' })]);
    const r: any = await service.login({ usuario: ' U1 ', password: claveCorrecta }, res);
    expect(r).toMatchObject({ type: 'tenant', user: { rol: 'VENDEDOR' }, tenant: { id: 't-1' } });
    expect(prisma.usuario.findMany).toHaveBeenCalledWith({ where: { username: 'u1' }, take: 2, include: { tenant: true } });
  });

  it('el resolvedor y la unicidad global distinguen usuario, correo y Super Admin', async () => {
    const { prisma } = montar();
    prisma.superAdmin.findUnique.mockResolvedValue({ id: 'sa' });
    expect((await resolverCuenta(prisma, 'Root@Jowa.test')).estado).toBe('SUPER_ADMIN');
    prisma.superAdmin.findUnique.mockResolvedValue(null);
    prisma.usuario.findMany.mockResolvedValue([]);
    expect((await resolverCuenta(prisma, 'nadie')).estado).toBe('NO_EXISTE');
    expect((await resolverCuenta(prisma, '   ')).estado).toBe('NO_EXISTE');
    prisma.usuario.findFirst = vi.fn().mockResolvedValueOnce({ id: 'otra-empresa' });
    await expect(identificadorEnUso(prisma, { username: '44556' })).resolves.toBe('username');
    prisma.usuario.findFirst = vi.fn().mockResolvedValue(null);
    await expect(identificadorEnUso(prisma, { email: 'root@jowa.test' })).resolves.toBeNull();
    prisma.superAdmin.findUnique.mockResolvedValue({ id: 'sa' });
    await expect(identificadorEnUso(prisma, { email: 'Root@Jowa.test' })).resolves.toBe('email');
  });
});

describe('bloqueo de usuarios que no son Admin', () => {
  it(`los fallos 1 a ${MAX_FALLOS_BLOQUEO} responden 401 genérico sin ofrecer recuperación; el sexto bloquea`, async () => {
    for (const [fallos, bloqueo] of [[1, false], [3, false], [MAX_FALLOS_BLOQUEO, false], [MAX_FALLOS_BLOQUEO + 1, true]] as const) {
      const { service, prisma, res } = montar({ fallos, bloqueada_ahora: bloqueo, bloqueada: bloqueo });
      prisma.usuario.findMany.mockResolvedValue([cuenta()]);
      const error: any = await service.login({ usuario: 'u1', password: 'incorrecta' }, res).catch((e) => e);
      if (bloqueo) {
        expect(error).toBeInstanceOf(ForbiddenException);
        expect(error.getResponse()).toMatchObject({ code: 'CUENTA_BLOQUEADA', message: expect.stringContaining('Admin o Super Admin') });
        expect(prisma.authEvent.create).toHaveBeenCalledWith({ data: { actorId: 'sistema', sujetoId: 'u-1', tenantId: 't-1', event: 'ACCOUNT_LOCKED' } });
      } else {
        expect(error).toBeInstanceOf(UnauthorizedException);
        expect(error.getResponse()).not.toHaveProperty('recuperacionDisponible');
        expect(prisma.authEvent.create).not.toHaveBeenCalled();
      }
      expect(JSON.stringify(error.getResponse())).not.toContain('incorrecta');
    }
  });

  it('una cuenta bloqueada rechaza incluso la contraseña correcta, sin probarla ni contar más fallos', async () => {
    const { service, prisma, res, consultas } = montar();
    prisma.usuario.findMany.mockResolvedValue([cuenta({ bloqueadoAt: new Date() })]);
    const error: any = await service.login({ usuario: 'u1', password: claveCorrecta }, res).catch((e) => e);
    expect(error).toBeInstanceOf(ForbiddenException);
    expect(error.getResponse()).toMatchObject({ code: 'CUENTA_BLOQUEADA' });
    expect(consultas.some((q) => /UPDATE usuarios/.test(q))).toBe(false);
    expect(res.cookie).not.toHaveBeenCalled();
  });

  it('si el bloqueo se confirma en paralelo, un acceso correcto no lo deshace', async () => {
    const { service, prisma, res } = montar();
    prisma.usuario.findMany.mockResolvedValue([cuenta()]);
    prisma.usuario.updateMany.mockResolvedValue({ count: 0 });
    prisma.usuario.findUnique = vi.fn().mockResolvedValue({ bloqueadoAt: new Date() });
    await expect(service.login({ usuario: 'u1', password: claveCorrecta }, res)).rejects.toBeInstanceOf(ForbiddenException);
    expect(res.cookie).not.toHaveBeenCalled();
    expect(prisma.sesionAuth.create).not.toHaveBeenCalled();
  });

  it('un acceso correcto sin fallos pendientes no escribe en el usuario (updated_at intacto)', async () => {
    const { service, prisma, res } = montar();
    prisma.usuario.findMany.mockResolvedValue([cuenta()]);
    prisma.usuario.updateMany.mockResolvedValue({ count: 0 });
    prisma.usuario.findUnique = vi.fn().mockResolvedValue({ bloqueadoAt: null });
    await expect(service.login({ usuario: 'u1', password: claveCorrecta }, res)).resolves.toMatchObject({ type: 'tenant' });
    expect(prisma.usuario.updateMany).toHaveBeenCalledWith({ where: { id: 'u-1', bloqueadoAt: null, OR: [{ intentosFallidos: { gt: 0 } }, { ultimoFalloAt: { not: null } }] }, data: { intentosFallidos: 0, ultimoFalloAt: null } });
  });

  it('un usuario no Admin no puede entrar con una contraseña temporal', async () => {
    const { service, prisma, res } = montar();
    prisma.usuario.findMany.mockResolvedValue([cuenta()]);
    prisma.authTempPassword.findUnique.mockResolvedValue({ id: 'x', passwordHash: bcrypt.hashSync('Temporal-123456', 4), expiresAt: new Date(Date.now() + 60000), usedAt: null });
    await expect(service.login({ usuario: 'u1', password: 'Temporal-123456' }, res)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(prisma.authTempPassword.findUnique).not.toHaveBeenCalled();
  });
});

describe('Admin y Super Admin: recuperación tras tres fallos', () => {
  it.each([[1, false], [2, false], [3, true], [4, true]])('Admin con correo verificado, fallo %i: opción de recuperación %s', async (fallos, visible) => {
    const { service, prisma, res } = montar({ fallos });
    prisma.usuario.findMany.mockResolvedValue([cuenta({ rol: 'ADMIN', emailVerifiedAt: new Date() })]);
    const error: any = await service.login({ usuario: 'u1', password: 'mala' }, res).catch((e) => e);
    expect(error).toBeInstanceOf(UnauthorizedException);
    expect(error.getResponse().recuperacionDisponible === true).toBe(visible);
    expect(error.getResponse().message).toBe('Credenciales inválidas');
  });

  it('Super Admin con correo verificado ve la recuperación al tercer fallo; sin correo verificado, nunca', async () => {
    for (const [verificado, esperado] of [[new Date(), true], [null, false]] as const) {
      const { service, prisma, res } = montar({ fallos: 3 });
      prisma.superAdmin.findUnique.mockResolvedValue({ id: 'sa', email: 'sa@jowa.test', activo: true, passwordHash: hash, emailVerifiedAt: verificado });
      const error: any = await service.login({ usuario: 'sa@jowa.test', password: 'mala' }, res).catch((e) => e);
      expect(error.getResponse().recuperacionDisponible === true).toBe(esperado);
    }
  });

  it('una cuenta inexistente o con identificador repetido jamás ofrece recuperación', async () => {
    const { service, prisma, res } = montar({ fallos: 9 });
    const error: any = await service.login({ usuario: 'nadie', password: 'x'.repeat(8) }, res).catch((e) => e);
    expect(error.getResponse()).not.toHaveProperty('recuperacionDisponible');
    prisma.usuario.findMany.mockResolvedValue([cuenta({ rol: 'ADMIN' }), cuenta({ id: 'u-2', rol: 'ADMIN' })]);
    const otro: any = await service.login({ usuario: 'repetido', password: 'x'.repeat(8) }, res).catch((e) => e);
    expect(otro.getResponse()).not.toHaveProperty('recuperacionDisponible');
  });

  it('la contraseña temporal vigente no abre sesión: entrega un token de cambio obligatorio y se consume', async () => {
    const { service, prisma, res } = montar();
    const temporal = 'Temporal-ABCD2345';
    prisma.usuario.findMany.mockResolvedValue([cuenta({ rol: 'ADMIN', emailVerifiedAt: new Date() })]);
    prisma.authTempPassword.findUnique.mockResolvedValue({ id: 'tp-1', passwordHash: bcrypt.hashSync(temporal, 4), expiresAt: new Date(Date.now() + 60000), usedAt: null });
    const r: any = await service.login({ usuario: 'u1', password: temporal }, res);
    expect(r).toMatchObject({ type: 'password_change_required', requiereCambioPassword: true, expiresIn: 600 });
    expect(r.cambioToken).toEqual(expect.any(String));
    expect(r).not.toHaveProperty('accessToken');
    expect(res.cookie).not.toHaveBeenCalled();
    expect(prisma.sesionAuth.create).not.toHaveBeenCalled();
    expect(prisma.authTempPassword.updateMany).toHaveBeenCalledWith({ where: { id: 'tp-1', usedAt: null, expiresAt: { gt: expect.any(Date) } }, data: { usedAt: expect.any(Date) } });
    expect(prisma.authAction.create).toHaveBeenCalledWith({ data: expect.objectContaining({ purpose: 'FORCED_CHANGE', tipo: 'TENANT', tenantId: 't-1' }) });
    expect(JSON.stringify(prisma.authEvent.create.mock.calls)).not.toContain(temporal);
    expect(JSON.stringify(prisma.authAction.create.mock.calls)).not.toContain(temporal);
  });

  it.each([
    ['expirada', { expiresAt: new Date(Date.now() - 1000), usedAt: null }],
    ['ya usada', { expiresAt: new Date(Date.now() + 60000), usedAt: new Date() }],
  ])('una contraseña temporal %s se rechaza como credencial inválida', async (_n, estado) => {
    const { service, prisma, res } = montar({ fallos: 1 });
    const temporal = 'Temporal-ABCD2345';
    prisma.usuario.findMany.mockResolvedValue([cuenta({ rol: 'ADMIN' })]);
    prisma.authTempPassword.findUnique.mockResolvedValue({ id: 'tp-1', passwordHash: bcrypt.hashSync(temporal, 4), ...estado });
    await expect(service.login({ usuario: 'u1', password: temporal }, res)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(prisma.authAction.create).not.toHaveBeenCalled();
  });

  it('dos usos simultáneos de la misma temporal: solo gana el que la consume', async () => {
    const { service, prisma, res } = montar();
    const temporal = 'Temporal-ABCD2345';
    prisma.usuario.findMany.mockResolvedValue([cuenta({ rol: 'ADMIN' })]);
    prisma.authTempPassword.findUnique.mockResolvedValue({ id: 'tp-1', passwordHash: bcrypt.hashSync(temporal, 4), expiresAt: new Date(Date.now() + 60000), usedAt: null });
    prisma.authTempPassword.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });
    const resultados = await Promise.allSettled([service.login({ usuario: 'u1', password: temporal }, res), service.login({ usuario: 'u1', password: temporal }, res)]);
    expect(resultados.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  });
});
