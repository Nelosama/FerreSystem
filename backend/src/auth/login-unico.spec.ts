import { ConflictException, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { MAX_FALLOS_BLOQUEO } from './bloqueo-cuenta';
import { exigirIdentificadorUnico, resolverCuenta } from './identidad-login';
import { generarContrasenaTemporal } from './contrasena-temporal';
import { sealSecret, tokenHash, totp } from './mfa';

// Login de un solo campo: la empresa y el rol salen de la cuenta; los contadores viven en el servidor.
const claveCorrecta = 'Clave-Correcta-2026!';
const hash = bcrypt.hashSync(claveCorrecta, 4);
const tenant = { id: 't-1', estado: 'ACTIVO', nombreComercial: 'Ferretería' };
const cuenta = (extra: Record<string, unknown> = {}) => ({ id: 'u-1', tenantId: 't-1', nombre: 'N', email: 'u@t.test', username: 'u1', passwordHash: hash, activo: true, rol: 'CAJERO', intentosFallidos: 0, bloqueadoAt: null, emailVerifiedAt: null, tenant, ...extra });
const MFA_KEY = 'ab'.repeat(32);
const SECRETO = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
const codigoMfa = () => totp(SECRETO, Math.floor(Date.now() / 30000));
const superAdmin = (extra: Record<string, unknown> = {}) => ({ id: 'sa', nombre: 'SA', email: 'sa@jowa.test', activo: true, passwordHash: hash, emailVerifiedAt: new Date(), mfaSecret: sealSecret(SECRETO, 'sa', { get: () => MFA_KEY } as any), mfaLastStep: null, ...extra });
/** Acción de contraseña temporal tal como la guarda emitirContrasenaTemporal. */
const accionTemporal = (temporal: string, dueño: any, plataforma = false, extra: Record<string, unknown> = {}) => ({
  hash: tokenHash(temporal), sujetoId: dueño.id, tipo: plataforma ? 'SUPER_ADMIN' : 'TENANT', tenantId: plataforma ? null : dueño.tenantId,
  purpose: 'TEMP_PASSWORD', email: dueño.email, passwordBinding: tokenHash(dueño.passwordHash), expiresAt: new Date(Date.now() + 60000), ...extra,
});

function montar(fila: { fallos: number; bloqueada_ahora?: boolean; bloqueada?: boolean } = { fallos: 1 }, segundosPausa = 0) {
  const consultas: string[] = [];
  const prisma: any = {
    usuario: { findMany: vi.fn().mockResolvedValue([]), findFirst: vi.fn(), findUnique: vi.fn(), updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    superAdmin: { findUnique: vi.fn().mockResolvedValue(null), updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    authAction: { findUnique: vi.fn().mockResolvedValue(null), deleteMany: vi.fn().mockResolvedValue({ count: 1 }), create: vi.fn().mockResolvedValue({}) },
    authEvent: { create: vi.fn().mockResolvedValue({}) },
    sesionAuth: { create: vi.fn().mockResolvedValue({}), updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
    $queryRaw: vi.fn(async (strings: TemplateStringsArray) => {
      const sql = strings.join('?');
      consultas.push(sql);
      if (/UPDATE (usuarios|super_admins)/.test(sql)) return [fila];
      return [{ segundos: segundosPausa }];
    }),
    $executeRaw: vi.fn().mockResolvedValue(0),
  };
  prisma.$transaction = vi.fn((fn: any) => fn(prisma));
  const jwt: any = { sign: vi.fn().mockReturnValue('jwt'), decode: vi.fn().mockReturnValue({ exp: 4102444800 }), verify: vi.fn() };
  const config: any = { get: (k: string, f?: unknown) => (k === 'AUTH_MFA_ENCRYPTION_KEY' ? MFA_KEY : f) };
  const res: any = { cookie: vi.fn(), clearCookie: vi.fn(), setHeader: vi.fn() };
  return { prisma, jwt, res, service: new AuthService(prisma, jwt, config), consultas };
}

describe('resolución de cuenta sin indicar empresa', () => {
  it('un código repetido en dos empresas no se resuelve, no prueba contraseñas y responde igual que uno inexistente', async () => {
    const { service, prisma, res } = montar();
    prisma.usuario.findMany.mockResolvedValue([cuenta({ tenantId: 'A' }), cuenta({ id: 'u-2', tenantId: 'B' })]);
    const repetido: any = await service.login({ usuario: '44556', password: claveCorrecta }, res).catch((e) => e);
    expect(prisma.usuario.findMany).toHaveBeenCalledWith({ where: { username: '44556' }, take: 2, include: { tenant: true } });
    prisma.usuario.findMany.mockResolvedValue([]);
    const inexistente: any = await service.login({ usuario: 'nadie', password: claveCorrecta }, res).catch((e) => e);
    // Sin código ni mensaje específico: la duplicidad no se revela a quien intenta entrar.
    expect(repetido.getResponse()).toEqual(inexistente.getResponse());
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

  it('el enlace privado de empresa acota la búsqueda a ese negocio (cuentas heredadas repetidas)', async () => {
    const { service, prisma, res } = montar();
    prisma.usuario.findFirst.mockResolvedValue(cuenta({ tenantId: 'B' }));
    await service.login({ usuario: '44556', password: claveCorrecta, tenantId: 'B' }, res);
    expect(prisma.usuario.findFirst).toHaveBeenCalledWith({ where: { tenantId: 'B', username: '44556' }, include: { tenant: true } });
    expect(prisma.usuario.findMany).not.toHaveBeenCalled();
    expect(prisma.superAdmin.findUnique).not.toHaveBeenCalled();
  });

  it('el resolvedor distingue usuario, correo y Super Admin; el Super Admin tiene precedencia sobre un correo heredado repetido', async () => {
    const { prisma } = montar();
    prisma.superAdmin.findUnique.mockResolvedValue({ id: 'sa' });
    prisma.usuario.findMany.mockResolvedValue([cuenta({ email: 'root@jowa.test' })]);
    expect((await resolverCuenta(prisma, 'Root@Jowa.test')).estado).toBe('SUPER_ADMIN');
    expect(prisma.usuario.findMany).not.toHaveBeenCalled();
    prisma.superAdmin.findUnique.mockResolvedValue(null);
    prisma.usuario.findMany.mockResolvedValue([]);
    expect((await resolverCuenta(prisma, 'nadie')).estado).toBe('NO_EXISTE');
    expect((await resolverCuenta(prisma, '   ')).estado).toBe('NO_EXISTE');
  });

  it('la unicidad global serializa por identificador y rechaza usuario, correo o correo de Super Admin ya usados', async () => {
    const { prisma, consultas } = montar();
    prisma.usuario.findFirst = vi.fn().mockResolvedValueOnce({ id: 'otra-empresa' });
    await expect(exigirIdentificadorUnico(prisma, { username: ' 44556 ' })).rejects.toBeInstanceOf(ConflictException);
    expect(consultas.some((q) => /pg_advisory_xact_lock/.test(q))).toBe(true);
    prisma.usuario.findFirst = vi.fn().mockResolvedValue(null);
    await expect(exigirIdentificadorUnico(prisma, { email: 'libre@jowa.test', excluirId: 'u-1' })).resolves.toBeUndefined();
    expect(prisma.usuario.findFirst).toHaveBeenCalledWith({ where: { email: 'libre@jowa.test', id: { not: 'u-1' } }, select: { id: true } });
    prisma.superAdmin.findUnique.mockResolvedValue({ id: 'sa' });
    const error: any = await exigirIdentificadorUnico(prisma, { email: 'Root@Jowa.test' }).catch((e) => e);
    expect(error).toBeInstanceOf(ConflictException);
    // No dice en qué empresa ni de qué tipo de cuenta es el identificador.
    expect(error.message).not.toMatch(/super|empresa [A-Z]/i);
  });
});

describe('bloqueo de cuentas operativas', () => {
  it(`los fallos 1 a ${MAX_FALLOS_BLOQUEO} y el sexto (que bloquea) responden el mismo 401 genérico`, async () => {
    for (const [fallos, bloqueo] of [[1, false], [3, false], [MAX_FALLOS_BLOQUEO, false], [MAX_FALLOS_BLOQUEO + 1, true]] as const) {
      const { service, prisma, res } = montar({ fallos, bloqueada_ahora: bloqueo, bloqueada: bloqueo });
      prisma.usuario.findMany.mockResolvedValue([cuenta()]);
      const error: any = await service.login({ usuario: 'u1', password: 'incorrecta' }, res).catch((e) => e);
      expect(error).toBeInstanceOf(UnauthorizedException);
      expect(error.getResponse()).toMatchObject({ message: 'Credenciales inválidas' });
      expect(error.getResponse()).not.toHaveProperty('code');
      expect(error.getResponse()).not.toHaveProperty('recuperacionDisponible');
      if (bloqueo) {
        expect(prisma.authEvent.create).toHaveBeenCalledWith({ data: { actorId: 'sistema', sujetoId: 'u-1', tenantId: 't-1', event: 'ACCOUNT_LOCKED' } });
        // El bloqueo cierra sesiones y anula enlaces pendientes.
        expect(prisma.sesionAuth.updateMany).toHaveBeenCalledWith({ where: { sujetoId: 'u-1', revokedAt: null }, data: { revokedAt: expect.any(Date), revocationMotivo: 'CUENTA_BLOQUEADA' } });
        expect(prisma.authAction.deleteMany).toHaveBeenCalledWith({ where: { sujetoId: 'u-1' } });
      } else {
        expect(prisma.authEvent.create).not.toHaveBeenCalled();
      }
      expect(JSON.stringify(error.getResponse())).not.toContain('incorrecta');
    }
  });

  it('una cuenta bloqueada no prueba la contraseña: la correcta y una incorrecta reciben la misma respuesta (sin oráculo)', async () => {
    const { service, prisma, res, consultas } = montar();
    prisma.usuario.findMany.mockResolvedValue([cuenta({ bloqueadoAt: new Date() })]);
    const correcta: any = await service.login({ usuario: 'u1', password: claveCorrecta }, res).catch((e) => e);
    const incorrecta: any = await service.login({ usuario: 'u1', password: 'otra-clave' }, res).catch((e) => e);
    expect(correcta).toBeInstanceOf(UnauthorizedException);
    expect(correcta.getResponse()).toEqual(incorrecta.getResponse());
    expect(consultas.some((q) => /UPDATE usuarios/.test(q))).toBe(false);
    expect(res.cookie).not.toHaveBeenCalled();
    expect(prisma.sesionAuth.create).not.toHaveBeenCalled();
  });

  it('si el bloqueo se confirma en paralelo, un acceso correcto no lo deshace', async () => {
    const { service, prisma, res } = montar();
    prisma.usuario.findMany.mockResolvedValue([cuenta()]);
    prisma.usuario.updateMany.mockResolvedValue({ count: 0 });
    prisma.usuario.findUnique.mockResolvedValue({ bloqueadoAt: new Date() });
    await expect(service.login({ usuario: 'u1', password: claveCorrecta }, res)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(res.cookie).not.toHaveBeenCalled();
    expect(prisma.sesionAuth.create).not.toHaveBeenCalled();
  });

  it('un acceso correcto sin fallos pendientes no escribe en el usuario (updated_at intacto)', async () => {
    const { service, prisma, res } = montar();
    prisma.usuario.findMany.mockResolvedValue([cuenta()]);
    prisma.usuario.updateMany.mockResolvedValue({ count: 0 });
    prisma.usuario.findUnique.mockResolvedValue({ bloqueadoAt: null });
    await expect(service.login({ usuario: 'u1', password: claveCorrecta }, res)).resolves.toMatchObject({ type: 'tenant' });
    expect(prisma.usuario.updateMany).toHaveBeenCalledWith({ where: { id: 'u-1', bloqueadoAt: null, OR: [{ intentosFallidos: { gt: 0 } }, { ultimoFalloAt: { not: null } }] }, data: { intentosFallidos: 0, ultimoFalloAt: null } });
  });

  it('un rol operativo (incluido CONTADOR) no puede entrar con una contraseña temporal', async () => {
    for (const rol of ['CAJERO', 'CONTADOR']) {
      const { service, prisma, res } = montar();
      const temporal = generarContrasenaTemporal();
      const dueño = cuenta({ rol });
      prisma.usuario.findMany.mockResolvedValue([dueño]);
      prisma.authAction.findUnique.mockResolvedValue(accionTemporal(temporal, dueño));
      await expect(service.login({ usuario: 'u1', password: temporal }, res)).rejects.toBeInstanceOf(UnauthorizedException);
      expect(prisma.authAction.findUnique).not.toHaveBeenCalled();
    }
  });
});

describe('Admin y Super Admin: recuperación con contraseña temporal', () => {
  it('el 401 de un Admin no informa si la recuperación está disponible (sin enumeración desde el servidor)', async () => {
    for (const fallos of [1, 3, 9]) {
      const { service, prisma, res } = montar({ fallos });
      prisma.usuario.findMany.mockResolvedValue([cuenta({ rol: 'ADMIN', emailVerifiedAt: new Date() })]);
      const error: any = await service.login({ usuario: 'u1', password: 'mala-clave' }, res).catch((e) => e);
      expect(error.getResponse()).toEqual({ statusCode: 401, message: 'Credenciales inválidas', error: 'Unauthorized' });
    }
  });

  it('la contraseña temporal vigente no abre sesión: revoca sesiones previas, entrega un token de cambio obligatorio y se consume', async () => {
    const { service, prisma, res } = montar();
    const temporal = generarContrasenaTemporal();
    const dueño = cuenta({ rol: 'ADMIN', emailVerifiedAt: new Date() });
    prisma.usuario.findMany.mockResolvedValue([dueño]);
    prisma.usuario.findUnique.mockResolvedValue(dueño);
    prisma.authAction.findUnique.mockResolvedValue(accionTemporal(temporal, dueño));
    const r: any = await service.login({ usuario: 'u1', password: temporal }, res);
    expect(r).toMatchObject({ type: 'password_change_required', requiereCambioPassword: true, expiresIn: 600 });
    expect(r.cambioToken).toEqual(expect.any(String));
    expect(r).not.toHaveProperty('accessToken');
    expect(res.cookie).not.toHaveBeenCalled();
    expect(prisma.sesionAuth.create).not.toHaveBeenCalled();
    expect(prisma.authAction.deleteMany).toHaveBeenCalledWith({ where: { hash: tokenHash(temporal) } });
    expect(prisma.sesionAuth.updateMany).toHaveBeenCalledWith({ where: { sujetoId: 'u-1', revokedAt: null }, data: { revokedAt: expect.any(Date), revocationMotivo: 'CONTRASENA_TEMPORAL' } });
    expect(prisma.authAction.create).toHaveBeenCalledWith({ data: expect.objectContaining({ purpose: 'FORCED_CHANGE', tipo: 'TENANT', tenantId: 't-1' }) });
    expect(JSON.stringify(prisma.authEvent.create.mock.calls)).not.toContain(temporal);
    expect(JSON.stringify(prisma.authAction.create.mock.calls)).not.toContain(temporal);
  });

  it.each([
    ['expirada', { expiresAt: new Date(Date.now() - 1000) }],
    ['de otra cuenta', { sujetoId: 'otra' }],
    ['emitida antes de un cambio de contraseña', { passwordBinding: tokenHash('hash-anterior') }],
    ['emitida para otro correo', { email: 'antiguo@t.test' }],
  ])('una contraseña temporal %s se rechaza como credencial inválida', async (_n, cambio) => {
    const { service, prisma, res } = montar({ fallos: 1 });
    const temporal = generarContrasenaTemporal();
    const dueño = cuenta({ rol: 'ADMIN' });
    prisma.usuario.findMany.mockResolvedValue([dueño]);
    prisma.authAction.findUnique.mockResolvedValue(accionTemporal(temporal, dueño, false, cambio));
    await expect(service.login({ usuario: 'u1', password: temporal }, res)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(prisma.authAction.create).not.toHaveBeenCalled();
  });

  it('dos usos simultáneos de la misma temporal: solo gana el que la consume', async () => {
    const { service, prisma, res } = montar();
    const temporal = generarContrasenaTemporal();
    const dueño = cuenta({ rol: 'ADMIN' });
    prisma.usuario.findMany.mockResolvedValue([dueño]);
    prisma.usuario.findUnique.mockResolvedValue(dueño);
    prisma.authAction.findUnique.mockResolvedValue(accionTemporal(temporal, dueño));
    // Simula la fila: solo el primer borrado por su hash encuentra la temporal.
    let disponible = true;
    prisma.authAction.deleteMany.mockImplementation(async ({ where }: any) => {
      if (where.hash !== tokenHash(temporal)) return { count: 0 };
      const count = disponible ? 1 : 0; disponible = false; return { count };
    });
    const resultados = await Promise.allSettled([service.login({ usuario: 'u1', password: temporal }, res), service.login({ usuario: 'u1', password: temporal }, res)]);
    expect(resultados.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  });

  it('durante la pausa por intentos del identificador solo entra una temporal vigente; cualquier otra cosa responde 429', async () => {
    const { service, prisma, res } = montar({ fallos: 1 }, 600);
    // Pausa del identificador, pero no de la IP.
    prisma.$queryRaw.mockImplementation(async (strings: TemplateStringsArray, ...valores: unknown[]) => {
      const sql = strings.join('?');
      if (/intentos_login/.test(sql)) return [{ segundos: valores.length === 2 && valores[0] !== valores[1] ? 600 : 0 }];
      return [];
    });
    const temporal = generarContrasenaTemporal();
    const dueño = cuenta({ rol: 'ADMIN' });
    prisma.usuario.findMany.mockResolvedValue([dueño]);
    prisma.usuario.findUnique.mockResolvedValue(dueño);
    const real: any = await service.login({ usuario: 'u1', password: claveCorrecta }, res).catch((e) => e);
    expect(real.getStatus()).toBe(429);
    prisma.authAction.findUnique.mockResolvedValue(accionTemporal(temporal, dueño));
    await expect(service.login({ usuario: 'u1', password: temporal }, res)).resolves.toMatchObject({ type: 'password_change_required' });
  });
});

describe('MFA obligatorio del Super Admin', () => {
  it('con la contraseña correcta pide el segundo factor sin contar un fallo y sin emitir sesión', async () => {
    const { service, prisma, res, consultas } = montar();
    prisma.superAdmin.findUnique.mockResolvedValue(superAdmin());
    const error: any = await service.login({ usuario: 'sa@jowa.test', password: claveCorrecta }, res).catch((e) => e);
    expect(error.getResponse()).toMatchObject({ code: 'MFA_REQUERIDO' });
    expect(consultas.some((q) => /UPDATE super_admins/.test(q) || /INSERT INTO intentos_login/.test(q))).toBe(false);
    expect(prisma.sesionAuth.create).not.toHaveBeenCalled();
  });

  it('un Super Admin sin MFA configurado no recibe sesión: debe enrolarlo', async () => {
    const { service, prisma, res } = montar();
    prisma.superAdmin.findUnique.mockResolvedValue(superAdmin({ mfaSecret: null }));
    const error: any = await service.login({ usuario: 'sa@jowa.test', password: claveCorrecta, mfaCode: '123456' }, res).catch((e) => e);
    expect(error.getResponse()).toMatchObject({ code: 'MFA_ENROLAMIENTO_REQUERIDO' });
    expect(prisma.sesionAuth.create).not.toHaveBeenCalled();
  });

  it('un código incorrecto se rechaza y cuenta como intento', async () => {
    const { service, prisma, res, consultas } = montar();
    prisma.superAdmin.findUnique.mockResolvedValue(superAdmin());
    await expect(service.login({ usuario: 'sa@jowa.test', password: claveCorrecta, mfaCode: '000000' === codigoMfa() ? '111111' : '000000' }, res)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(consultas.some((q) => /INSERT INTO intentos_login/.test(q))).toBe(false);
    expect(prisma.$executeRaw).toHaveBeenCalled();
    expect(prisma.sesionAuth.create).not.toHaveBeenCalled();
  });

  it('con contraseña y código válidos emite una sesión marcada con mfa', async () => {
    const { service, prisma, res, jwt } = montar();
    prisma.superAdmin.findUnique.mockResolvedValue(superAdmin());
    await expect(service.login({ usuario: 'sa@jowa.test', password: claveCorrecta, mfaCode: codigoMfa() }, res)).resolves.toMatchObject({ type: 'super_admin' });
    expect(jwt.sign).toHaveBeenCalledWith(expect.objectContaining({ type: 'super_admin', mfa: true }), expect.any(Object));
  });

  it('la recuperación del Super Admin también exige MFA: la temporal sola no se consume ni entrega el token de cambio', async () => {
    const { service, prisma, res } = montar();
    const temporal = generarContrasenaTemporal();
    const dueño = superAdmin();
    prisma.superAdmin.findUnique.mockResolvedValue(dueño);
    prisma.authAction.findUnique.mockResolvedValue(accionTemporal(temporal, dueño, true));
    const error: any = await service.login({ usuario: 'sa@jowa.test', password: temporal }, res).catch((e) => e);
    expect(error.getResponse()).toMatchObject({ code: 'MFA_REQUERIDO' });
    expect(prisma.authAction.deleteMany).not.toHaveBeenCalled();
    expect(prisma.authAction.create).not.toHaveBeenCalled();
    const r: any = await service.login({ usuario: 'sa@jowa.test', password: temporal, mfaCode: codigoMfa() }, res);
    expect(r).toMatchObject({ type: 'password_change_required' });
    expect(prisma.authAction.create).toHaveBeenCalledWith({ data: expect.objectContaining({ purpose: 'FORCED_CHANGE', tipo: 'SUPER_ADMIN', tenantId: null }) });
    // Usar la temporal del Super Admin corta también el soporte remoto que hubiera iniciado.
    expect(JSON.stringify(prisma.$executeRaw.mock.calls)).toContain('SUPER_ADMIN_CONTRASENA_TEMPORAL');
  });
});
