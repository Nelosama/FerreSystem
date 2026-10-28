import { ConflictException, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { MAX_FALLOS_BLOQUEO } from './bloqueo-cuenta';
import { exigirIdentificadorUnico, resolverCuenta } from './identidad-login';
import { generarContrasenaTemporal } from './contrasena-temporal';
import { tokenHash } from './tokens-auth';
import { simularIdentidad } from '../../test/helpers/identidad-simulada';

// Login de un solo campo: la empresa y el rol salen de la cuenta; los contadores viven en el servidor.
const claveCorrecta = 'Clave-Correcta-2026!';
const hash = bcrypt.hashSync(claveCorrecta, 4);
const tenant = { id: 't-1', estado: 'ACTIVO', nombreComercial: 'Ferretería' };
const cuenta = (extra: Record<string, unknown> = {}) => ({ id: 'u-1', tenantId: 't-1', nombre: 'N', email: 'u@t.test', username: 'u1', passwordHash: hash, activo: true, rol: 'CAJERO', intentosFallidos: 0, bloqueadoAt: null, emailVerifiedAt: null, tenant, ...extra });
const superAdmin = (extra: Record<string, unknown> = {}) => ({ id: 'sa', nombre: 'SA', email: 'sa@jowa.test', activo: true, passwordHash: hash, emailVerifiedAt: new Date(), ...extra });
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
  const config: any = { get: (_k: string, f?: unknown) => f };
  const res: any = { cookie: vi.fn(), clearCookie: vi.fn(), setHeader: vi.fn() };
  return { prisma, jwt, res, service: new AuthService(prisma, jwt, config), consultas };
}

describe('resolución de cuenta sin indicar empresa', () => {
  it('un código repetido en dos empresas no se resuelve, no prueba contraseñas y responde igual que uno inexistente', async () => {
    const { service, prisma, res, consultas } = montar();
    simularIdentidad(prisma, { usuarios: [cuenta({ tenantId: 'A' }), cuenta({ id: 'u-2', tenantId: 'B' })] });
    const repetido: any = await service.login({ usuario: '44556', password: claveCorrecta }, res).catch((e) => e);
    // Ninguna de las dos cuentas se lee: no hay hash contra el que probar la contraseña.
    expect(prisma.usuario.findMany).not.toHaveBeenCalled();
    simularIdentidad(prisma, { usuarios: [] });
    const inexistente: any = await service.login({ usuario: 'nadie', password: claveCorrecta }, res).catch((e) => e);
    // Sin código ni mensaje específico: la duplicidad no se revela a quien intenta entrar.
    expect(repetido.getResponse()).toEqual(inexistente.getResponse());
    expect(res.cookie).not.toHaveBeenCalled();
    expect(prisma.sesionAuth.create).not.toHaveBeenCalled();
    expect(consultas.some((q) => /UPDATE usuarios/.test(q))).toBe(false);
  });

  it('un dato heredado sin normalizar («Juan» y «juan» en dos empresas) también es ambiguo: no elige ninguna cuenta', async () => {
    const { service, prisma, res } = montar();
    simularIdentidad(prisma, { usuarios: [cuenta({ id: 'u-a', tenantId: 'A', username: 'Juan' }), cuenta({ id: 'u-b', tenantId: 'B', username: 'juan' })] });
    for (const escrito of ['juan', 'JUAN', ' Juan ']) {
      await expect(service.login({ usuario: escrito, password: claveCorrecta }, res)).rejects.toMatchObject({ message: 'Credenciales inválidas' });
    }
    simularIdentidad(prisma, { usuarios: [cuenta({ id: 'u-a', tenantId: 'A', email: ' Ana@Correo.test' }), cuenta({ id: 'u-b', tenantId: 'B', email: 'ana@correo.test' })] });
    expect((await resolverCuenta(prisma, 'ana@correo.test')).estado).toBe('AMBIGUA');
    expect(res.cookie).not.toHaveBeenCalled();
    expect(prisma.sesionAuth.create).not.toHaveBeenCalled();
  });

  it('un código único se resuelve a su empresa y rol (usuario, código o correo), aunque esté guardado con mayúsculas', async () => {
    const { service, prisma, res } = montar();
    simularIdentidad(prisma, { usuarios: [cuenta({ rol: 'VENDEDOR', username: 'U1' })] });
    const r: any = await service.login({ usuario: ' u1 ', password: claveCorrecta }, res);
    expect(r).toMatchObject({ type: 'tenant', user: { rol: 'VENDEDOR' }, tenant: { id: 't-1' } });
    expect(prisma.usuario.findMany).toHaveBeenCalledWith({ where: { id: 'u-1' }, include: { tenant: true }, take: 1 });
  });

  it('el enlace privado de empresa acota la búsqueda a ese negocio (cuentas heredadas repetidas)', async () => {
    const { service, prisma, res } = montar();
    simularIdentidad(prisma, { usuarios: [cuenta({ id: 'u-a', tenantId: 'A' }), cuenta({ id: 'u-b', tenantId: 'B' })] });
    const r: any = await service.login({ usuario: 'u1', password: claveCorrecta, tenantId: 'B' }, res);
    expect(r).toMatchObject({ type: 'tenant', user: { id: 'u-b' } });
    expect(prisma.superAdmin.findUnique).not.toHaveBeenCalled();
    // Una empresa sin esa cuenta responde como inexistente; nunca cae en la cuenta de otra empresa.
    await expect(service.login({ usuario: 'u1', password: claveCorrecta, tenantId: 'C' }, res)).rejects.toMatchObject({ message: 'Credenciales inválidas' });
  });

  it('dentro de la empresa del enlace, un identificador repetido por mayúsculas también se rechaza', async () => {
    const { prisma } = montar();
    simularIdentidad(prisma, { usuarios: [cuenta({ id: 'u-a', tenantId: 'B', username: 'Pedro' }), cuenta({ id: 'u-b', tenantId: 'B', username: 'pedro' })] });
    expect((await resolverCuenta(prisma, 'pedro', 'B')).estado).toBe('AMBIGUA');
  });

  it('el resolvedor distingue usuario, correo y Super Admin; el Super Admin tiene precedencia sobre un correo heredado repetido', async () => {
    const { prisma } = montar();
    simularIdentidad(prisma, { superAdmins: [superAdmin({ email: 'root@jowa.test' })], usuarios: [cuenta({ email: 'root@jowa.test' })] });
    expect((await resolverCuenta(prisma, 'Root@Jowa.test')).estado).toBe('SUPER_ADMIN');
    expect(prisma.usuario.findMany).not.toHaveBeenCalled();
    simularIdentidad(prisma, {});
    expect((await resolverCuenta(prisma, 'nadie')).estado).toBe('NO_EXISTE');
    expect((await resolverCuenta(prisma, '   ')).estado).toBe('NO_EXISTE');
  });

  it('un usuario de negocio con el correo de un Super Admin no entra a la plataforma ni a su empresa con su propia contraseña', async () => {
    const { service, prisma, res } = montar();
    const otraClave = bcrypt.hashSync('Clave-Del-Negocio-1!', 4);
    simularIdentidad(prisma, { superAdmins: [superAdmin({ email: 'root@jowa.test' })], usuarios: [cuenta({ email: 'root@jowa.test', passwordHash: otraClave })] });
    await expect(service.login({ usuario: 'root@jowa.test', password: 'Clave-Del-Negocio-1!' }, res)).rejects.toMatchObject({ message: 'Credenciales inválidas' });
    expect(prisma.sesionAuth.create).not.toHaveBeenCalled();
  });

  it('la unicidad global serializa por identificador y rechaza usuario, correo o correo de Super Admin ya usados', async () => {
    const { prisma, consultas } = montar();
    simularIdentidad(prisma, { usuarios: [cuenta({ id: 'otra-empresa', tenantId: 'X', username: '44556' })] });
    await expect(exigirIdentificadorUnico(prisma, { username: ' 44556 ' })).rejects.toBeInstanceOf(ConflictException);
    expect(consultas.some((q) => /pg_advisory_xact_lock/.test(q))).toBe(true);
    simularIdentidad(prisma, { usuarios: [cuenta({ id: 'u-1', email: 'libre@jowa.test' })] });
    // La propia cuenta (excluirId) no cuenta como repetida.
    await expect(exigirIdentificadorUnico(prisma, { email: 'libre@jowa.test', excluirId: 'u-1' })).resolves.toBeUndefined();
    simularIdentidad(prisma, { superAdmins: [superAdmin({ email: 'root@jowa.test' })] });
    const error: any = await exigirIdentificadorUnico(prisma, { email: 'Root@Jowa.test' }).catch((e) => e);
    expect(error).toBeInstanceOf(ConflictException);
    // No dice en qué empresa ni de qué tipo de cuenta es el identificador.
    expect(error.message).not.toMatch(/super|empresa [A-Z]/i);
  });

  it('la unicidad también ve un dato heredado sin normalizar en otra empresa («Juan» ocupa «juan»)', async () => {
    const { prisma } = montar();
    simularIdentidad(prisma, { usuarios: [cuenta({ id: 'heredada', tenantId: 'A', username: 'Juan ' })] });
    await expect(exigirIdentificadorUnico(prisma, { username: 'juan' })).rejects.toBeInstanceOf(ConflictException);
  });
});

describe('bloqueo de cuentas operativas', () => {
  it(`los fallos 1 a ${MAX_FALLOS_BLOQUEO} y el sexto (que bloquea) responden el mismo 401 genérico`, async () => {
    for (const [fallos, bloqueo] of [[1, false], [3, false], [MAX_FALLOS_BLOQUEO, false], [MAX_FALLOS_BLOQUEO + 1, true]] as const) {
      const { service, prisma, res } = montar({ fallos, bloqueada_ahora: bloqueo, bloqueada: bloqueo });
      simularIdentidad(prisma, { usuarios: [cuenta()] });
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
    simularIdentidad(prisma, { usuarios: [cuenta({ bloqueadoAt: new Date() })] });
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
    simularIdentidad(prisma, { usuarios: [cuenta()] });
    prisma.usuario.updateMany.mockResolvedValue({ count: 0 });
    prisma.usuario.findUnique.mockResolvedValue({ bloqueadoAt: new Date() });
    await expect(service.login({ usuario: 'u1', password: claveCorrecta }, res)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(res.cookie).not.toHaveBeenCalled();
    expect(prisma.sesionAuth.create).not.toHaveBeenCalled();
  });

  it('un acceso correcto sin fallos pendientes no escribe en el usuario (updated_at intacto)', async () => {
    const { service, prisma, res } = montar();
    simularIdentidad(prisma, { usuarios: [cuenta()] });
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
      simularIdentidad(prisma, { usuarios: [dueño] });
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
      simularIdentidad(prisma, { usuarios: [cuenta({ rol: 'ADMIN', emailVerifiedAt: new Date() })] });
      const error: any = await service.login({ usuario: 'u1', password: 'mala-clave' }, res).catch((e) => e);
      expect(error.getResponse()).toEqual({ statusCode: 401, message: 'Credenciales inválidas', error: 'Unauthorized' });
    }
  });

  it('la contraseña temporal vigente no abre sesión: revoca sesiones previas, entrega un token de cambio obligatorio y se consume', async () => {
    const { service, prisma, res } = montar();
    const temporal = generarContrasenaTemporal();
    const dueño = cuenta({ rol: 'ADMIN', emailVerifiedAt: new Date() });
    simularIdentidad(prisma, { usuarios: [dueño] });
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
    simularIdentidad(prisma, { usuarios: [dueño] });
    prisma.authAction.findUnique.mockResolvedValue(accionTemporal(temporal, dueño, false, cambio));
    await expect(service.login({ usuario: 'u1', password: temporal }, res)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(prisma.authAction.create).not.toHaveBeenCalled();
  });

  it('dos usos simultáneos de la misma temporal: solo gana el que la consume', async () => {
    const { service, prisma, res } = montar();
    const temporal = generarContrasenaTemporal();
    const dueño = cuenta({ rol: 'ADMIN' });
    simularIdentidad(prisma, { usuarios: [dueño] });
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
    simularIdentidad(prisma, { usuarios: [dueño] });
    prisma.usuario.findUnique.mockResolvedValue(dueño);
    const real: any = await service.login({ usuario: 'u1', password: claveCorrecta }, res).catch((e) => e);
    expect(real.getStatus()).toBe(429);
    prisma.authAction.findUnique.mockResolvedValue(accionTemporal(temporal, dueño));
    await expect(service.login({ usuario: 'u1', password: temporal }, res)).resolves.toMatchObject({ type: 'password_change_required' });
  });
});

describe('Super Admin sin segundo factor (MFA retirado por decisión del propietario)', () => {
  it('con la contraseña correcta emite la sesión de plataforma; el token no lleva marca de MFA', async () => {
    const { service, prisma, res, jwt } = montar();
    simularIdentidad(prisma, { superAdmins: [superAdmin()] });
    await expect(service.login({ usuario: 'sa@jowa.test', password: claveCorrecta }, res)).resolves.toMatchObject({ type: 'super_admin' });
    expect(jwt.sign).toHaveBeenCalledWith(expect.objectContaining({ type: 'super_admin', rol: 'SUPER_ADMIN' }), expect.any(Object));
    expect(jwt.sign.mock.calls.every(([payload]: any[]) => !('mfa' in payload))).toBe(true);
    expect(prisma.sesionAuth.create).toHaveBeenCalledWith({ data: expect.objectContaining({ tipo: 'SUPER_ADMIN', sujetoId: 'sa' }) });
  });

  it('una contraseña incorrecta del Super Admin responde 401 genérico y cuenta el intento', async () => {
    const { service, prisma, res, consultas } = montar();
    simularIdentidad(prisma, { superAdmins: [superAdmin()] });
    const error: any = await service.login({ usuario: 'sa@jowa.test', password: 'incorrecta-123' }, res).catch((e) => e);
    expect(error.getResponse()).toEqual({ statusCode: 401, message: 'Credenciales inválidas', error: 'Unauthorized' });
    expect(consultas.some((q) => /UPDATE super_admins/.test(q))).toBe(true);
    expect(prisma.sesionAuth.create).not.toHaveBeenCalled();
  });

  it('la temporal del Super Admin entrega solo el token de cambio obligatorio, se consume y corta el soporte remoto', async () => {
    const { service, prisma, res } = montar();
    const temporal = generarContrasenaTemporal();
    const dueño = superAdmin();
    simularIdentidad(prisma, { superAdmins: [dueño] });
    prisma.authAction.findUnique.mockResolvedValue(accionTemporal(temporal, dueño, true));
    const r: any = await service.login({ usuario: 'sa@jowa.test', password: temporal }, res);
    expect(r).toMatchObject({ type: 'password_change_required' });
    expect(r).not.toHaveProperty('accessToken');
    expect(prisma.sesionAuth.create).not.toHaveBeenCalled();
    expect(prisma.authAction.deleteMany).toHaveBeenCalledWith({ where: { hash: tokenHash(temporal) } });
    expect(prisma.authAction.create).toHaveBeenCalledWith({ data: expect.objectContaining({ purpose: 'FORCED_CHANGE', tipo: 'SUPER_ADMIN', tenantId: null }) });
    // Usar la temporal del Super Admin corta también el soporte remoto que hubiera iniciado.
    expect(JSON.stringify(prisma.$executeRaw.mock.calls)).toContain('SUPER_ADMIN_CONTRASENA_TEMPORAL');
  });
});
