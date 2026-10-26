import 'reflect-metadata';
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { createServer } from 'node:net';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { RecoveryService } from '../src/auth/recovery.service';
import { AuthService } from '../src/auth/auth.service';
import { JwtStrategy } from '../src/auth/jwt.strategy';
import { tokenHash, opaqueToken, sealSecret, totp } from '../src/auth/mfa';
import { emitirContrasenaTemporal, generarContrasenaTemporal } from '../src/auth/contrasena-temporal';
import { MAX_FALLOS_BLOQUEO } from '../src/auth/bloqueo-cuenta';
import { Logger } from '@nestjs/common';
import { crearSesion } from '../src/auth/sesiones-auth';
import { UsuariosService } from '../src/usuarios/usuarios.service';
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { AuthController } from '../src/auth/auth.controller';
import { RecoveryController } from '../src/auth/recovery.controller';
import { noStore } from '../src/common/no-store.middleware';

// NEXUS: exclusively creates a disposable local cluster. Never reads a database URL from the host.
describe('Login único, MFA del Super Admin, recuperación por contraseña temporal y bloqueo en PostgreSQL desechable', () => {
  const root = resolve(__dirname, '..');
  const bin = process.env.PG_BIN || (process.platform === 'win32' ? 'C:/Program Files/PostgreSQL/18/bin' : '/usr/bin');
  const exe = (name: string) => join(bin, name + (process.platform === 'win32' ? '.exe' : ''));
  const password = 'Synthetic-Current-456!', replacement = 'Synthetic-New-789!';
  // Umbral por identificador alto para aislar el contador persistente por cuenta; los umbrales productivos se prueban con `authProd`.
  const base: Record<string, string> = { NODE_ENV: 'test', JWT_SECRET: 'isolated-auth-test-secret-not-production-123456', AUTH_ACEPTAR_TOKENS_SIN_SESION: 'false', AUTH_MFA_ENCRYPTION_KEY: 'cd'.repeat(32) };
  const values: Record<string, string> = { ...base, AUTH_LOGIN_MAX_FALLOS_CUENTA: '50', AUTH_LOGIN_MAX_FALLOS_IP: '1000' };
  const config = new ConfigService(values), jwt = new JwtService({ secret: values.JWT_SECRET });
  let directory = '', started = false, url = '', db: PrismaClient, service: RecoveryService, auth: AuthService, authProd: AuthService, strategy: JwtStrategy;
  const deliveries: { to: string; token: string; purpose: string }[] = [];
  const temporals: { to: string; password: string }[] = [];
  const mail = {
    send: vi.fn(async (to: string, token: string, purpose: string) => { deliveries.push({ to, token, purpose }); }),
    sendTemporaryPassword: vi.fn(async (to: string, password: string) => { temporals.push({ to, password }); }),
  };
  let oldHash: string;
  let app: INestApplication;
  const run = (command: string, args: string[], env = process.env) => execFileSync(command, args, { cwd: root, env, windowsHide: true, timeout: 60000, stdio: command === exe('pg_ctl') ? 'ignore' : 'pipe' });
  const migrate = (schema: string) => run(process.execPath, [join(root, 'node_modules/prisma/build/index.js'), 'migrate', 'deploy', '--schema', schema], { ...process.env, DATABASE_URL: url, DIRECT_URL: url });
  beforeAll(async () => {
    if (!existsSync(exe('initdb'))) throw new Error('Install PostgreSQL or set PG_BIN; no external database is used');
    directory = mkdtempSync(join(tmpdir(), 'jowa-auth-test-'));
    const server = createServer(); await new Promise<void>(done => server.listen(0, '127.0.0.1', done));
    const port = (server.address() as any).port; await new Promise<void>(done => server.close(() => done()));
    run(exe('initdb'), ['-D', join(directory, 'data'), '-U', 'postgres', '-A', 'trust', '--locale=C', '-E', 'UTF8']);
    // Linux runners cannot write the distribution's shared /var/run/postgresql
    // socket directory. Keep sockets inside this test's disposable directory.
    const socket = process.platform === 'win32' ? '' : ` -k ${directory}`;
    try {
      run(exe('pg_ctl'), ['-D', join(directory, 'data'), '-o', `-p ${port} -h 127.0.0.1${socket}`, '-l', join(directory, 'postgres.log'), '-w', 'start']); started = true;
    } catch (error) {
      const log = join(directory, 'postgres.log');
      if (existsSync(log)) console.error(readFileSync(log, 'utf8'));
      throw error;
    }
    url = `postgresql://postgres@127.0.0.1:${port}/postgres`;
    const previous = join(directory, 'previous'); mkdirSync(previous);
    cpSync(join(root, 'prisma/schema.prisma'), join(previous, 'schema.prisma'));
    mkdirSync(join(previous, 'migrations'));
    for (const file of readdirSync(join(root, 'prisma/migrations'))) {
      if (file !== '20261023000000_auth_recovery' && file !== '20261026000000_auth_login_unico_bloqueo') cpSync(join(root, 'prisma/migrations', file), join(previous, 'migrations', file), { recursive: true });
    }
    migrate(join(previous, 'schema.prisma'));
    db = new PrismaClient({ datasources: { db: { url } } });
    oldHash = await bcrypt.hash(password, 4);
    await db.$executeRaw`INSERT INTO super_admins(id,nombre,email,password_hash,updated_at) VALUES ('existing-SA','Existing','existing@example.invalid',${oldHash},now())`;
    migrate(join(root, 'prisma/schema.prisma')); migrate(join(root, 'prisma/schema.prisma'));
    service = new RecoveryService(db as any, config, mail as any);
    auth = new AuthService(db as any, jwt, config); strategy = new JwtStrategy(config, db as any);
    authProd = new AuthService(db as any, jwt, new ConfigService(base));
    await db.tenant.createMany({ data: [{ id: 'A', nombreComercial: 'A' }, { id: 'B', nombreComercial: 'B' }] });
    const module = await Test.createTestingModule({
      controllers: [AuthController, RecoveryController],
      providers: [{ provide: AuthService, useValue: auth }, { provide: RecoveryService, useValue: service },
        { provide: PrismaService, useValue: db }, { provide: ConfigService, useValue: config },
        { provide: JwtService, useValue: jwt }, { provide: JwtStrategy, useValue: strategy }],
    }).compile();
    app = module.createNestApplication(); app.setGlobalPrefix('api'); app.use(noStore);
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }));
    await app.init();
  }, 120000);
  afterAll(async () => {
    await app?.close();
    await db?.$disconnect();
    if (started || (directory && existsSync(join(directory, 'data/postmaster.pid')))) run(exe('pg_ctl'), ['-D', join(directory, 'data'), '-m', 'immediate', '-w', 'stop']);
    const target = resolve(directory);
    if (directory && target.startsWith(resolve(tmpdir()) + sep) && target.includes('jowa-auth-test-')) rmSync(target, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  });
  type Rol = 'ADMIN' | 'CAJERO' | 'VENDEDOR' | 'BODEGUERO';
  const SECRETO_TOTP = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
  const account = async (platform = false, rol: Rol = 'ADMIN', tenantId = 'A', verified = true) => {
    const id = randomUUID(), email = `${id}@example.invalid`;
    const data = { id, nombre: id, email, passwordHash: await bcrypt.hash(password, 4), emailVerifiedAt: verified ? new Date() : null };
    // Todo Super Admin de esta matriz tiene MFA configurado (cifrado real), salvo que una prueba lo retire.
    const row = platform
      ? await db.superAdmin.create({ data: { ...data, mfaSecret: sealSecret(SECRETO_TOTP, id, config) } })
      : await db.usuario.create({ data: { ...data, tenantId, rol, username: 'u-' + id } });
    return { ...row, platform, identity: { sub: id, type: platform ? 'super_admin' : 'tenant', ...(!platform && { tenantId, rol }) } as any };
  };
  /** Código de emergencia de un uso (evita el anti-replay del TOTP entre varios accesos dentro de la misma ventana de 30 s). */
  const codigo = async (a: any) => {
    const code = randomUUID().replace(/-/g, '');
    await db.authRecoveryCode.create({ data: { hash: tokenHash(code), sujetoId: a.id, tipo: a.platform ? 'SUPER_ADMIN' : 'TENANT' } });
    return code;
  };
  // Cada intento usa su propia IP de prueba: los fallos de una prueba no agotan el presupuesto por IP de otra.
  let ipSeq = 0;
  const nextIp = () => ({ ip: `198.18.${Math.floor(ipSeq / 250)}.${(ipSeq++ % 250) + 1}` }) as any;
  const newRes = () => ({ cookie: vi.fn(), setHeader: vi.fn(), clearCookie: vi.fn() }) as any;
  const login = (usuario: string, pass = password, req = nextIp(), res = newRes(), extra: Record<string, string> = {}) => auth.login({ usuario, password: pass, ...extra }, res, req);
  /** Login completo de un Super Admin: contraseña + código de emergencia. */
  const loginSa = async (a: any, pass = password, req = nextIp(), res = newRes()) => auth.login({ usuario: a.email, password: pass, mfaCode: await codigo(a) }, res, req);
  const failure = async (promise: Promise<any>) => promise.then(() => { throw new Error('Debía fallar'); }, (error: any) => error);
  const action = async (a: any, purpose = 'RESET_ADMIN', expiresAt = new Date(Date.now()+600000)) => {
    const token = opaqueToken(); await db.authAction.create({ data: { hash: tokenHash(token), sujetoId: a.id, tipo: a.platform ? 'SUPER_ADMIN' : 'TENANT', tenantId: a.platform ? null : a.tenantId, email: a.email, passwordBinding: tokenHash(a.passwordHash), purpose, expiresAt } }); return token;
  };
  /** Emite una temporal como lo hace la recuperación (sin pasar por el correo). */
  const temporalPara = async (a: any) => {
    const clave = generarContrasenaTemporal();
    const actual = a.platform ? await db.superAdmin.findUniqueOrThrow({ where: { id: a.id } }) : await db.usuario.findUniqueOrThrow({ where: { id: a.id } });
    await emitirContrasenaTemporal(db as any, actual, a.platform, clave);
    return clave;
  };
  const session = async (a: any) => {
    const sid = randomUUID(); await crearSesion(db, { id: sid, tipo: a.platform ? 'SUPER_ADMIN' : 'TENANT', sujetoId: a.id, tenantId: a.tenantId, expiresAt: new Date(Date.now()+600000), passwordHash: a.passwordHash });
    return { sid, sub: a.id, type: a.platform ? 'super_admin' : 'tenant', tenantId: a.tenantId, ...(a.platform && { mfa: true }) };
  };
  const fresh = (a: any) => a.platform ? db.superAdmin.findUniqueOrThrow({ where: { id: a.id } }) : db.usuario.findUniqueOrThrow({ where: { id: a.id } });
  const bloquear = async (a: any) => {
    for (let i = 0; i <= MAX_FALLOS_BLOQUEO; i++) await failure(login(a.email, 'mala-clave-' + i));
    expect((await fresh(a) as any).bloqueadoAt).toBeInstanceOf(Date);
  };

  it('preserves existing Super Admin credentials through upgrade and repeated deploy; schema has no drift', async () => {
    const existente = await db.superAdmin.findUniqueOrThrow({ where: { id: 'existing-SA' } });
    expect(existente.passwordHash).toBe(oldHash);
    expect(existente.intentosFallidos).toBe(0);
    expect(existente.ultimoFalloAt).toBeNull();
    run(process.execPath, [join(root,'node_modules/prisma/build/index.js'), 'migrate', 'diff', '--from-url', url, '--to-schema-datamodel', join(root,'prisma/schema.prisma'), '--exit-code']);
    // La migración no crea índices únicos globales (los datos heredados pueden repetir identificadores entre empresas).
    const indices = await db.$queryRaw<{ indexname: string; indexdef: string }[]>`SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'usuarios' AND indexname IN ('usuarios_email_idx','usuarios_username_idx')`;
    expect(indices).toHaveLength(2);
    for (const i of indices) expect(i.indexdef).not.toMatch(/UNIQUE/);
    // Restricción de la migración: el contador nunca es negativo.
    await expect(db.$executeRaw`UPDATE super_admins SET intentos_fallidos = -1 WHERE id = 'existing-SA'`).rejects.toThrow();
  });
  it('enforces recovery abuse limits across service instances at production thresholds', async () => {
    const limits = new ConfigService({ AUTH_LOGIN_MAX_FALLOS_CUENTA: 5, AUTH_LOGIN_MAX_FALLOS_IP: 100 });
    const first = new RecoveryService(db as any, limits, mail as any);
    const second = new RecoveryService(db as any, limits, mail as any);
    const key = `activation-${randomUUID()}`;
    for (let i = 0; i < 5; i++) await first.limit(key, '198.51.100.10');
    await expect(second.limit(key, '198.51.100.11')).rejects.toMatchObject({ status: 429 });
    // Distinct subjects still share the IP budget; successful calls count too.
    for (let i = 0; i < 100; i++) await first.limit(`${key}-${i}`, '198.51.100.12');
    await expect(second.limit(`${key}-new`, '198.51.100.12')).rejects.toMatchObject({ status: 429 });
  });

  describe('login de un solo campo con detección automática de empresa y rol', () => {
    it.each(['ADMIN', 'CAJERO', 'VENDEDOR', 'BODEGUERO'] as Rol[])('%s entra con usuario, código o correo y el servidor fija su empresa y rol', async rol => {
      const a = await account(false, rol, 'B');
      await db.usuario.update({ where: { id: a.id }, data: { username: `44${randomUUID().slice(0, 6)}` } });
      const row = await db.usuario.findUniqueOrThrow({ where: { id: a.id } });
      for (const identificador of [row.username!, row.username!.toUpperCase(), a.email, ` ${a.email.toUpperCase()} `]) {
        const result: any = await login(identificador);
        expect(result).toMatchObject({ type: 'tenant', user: { id: a.id, rol }, tenant: { id: 'B' } });
        expect(result).not.toHaveProperty('cambioToken');
      }
    });
    it('un acceso correcto sin fallos pendientes no modifica la fila del usuario ni la del Super Admin', async () => {
      const u = await account(false, 'CAJERO'), sa = await account(true);
      const [antesU, antesSa] = [await fresh(u), await fresh(sa)];
      await login(u.email); await loginSa(sa);
      expect(await fresh(u)).toEqual(antesU);
      // El código de emergencia no toca la fila; el contador no se escribe si no había fallos.
      expect(await fresh(sa)).toEqual(antesSa);
    });
    it('un código repetido en dos empresas no entra con la contraseña correcta de ninguna, responde como uno inexistente y no crea sesiones', async () => {
      const a = await account(false, 'CAJERO', 'A'), b = await account(false, 'CAJERO', 'B');
      const codigoRepetido = `445${randomUUID().slice(0, 5)}`;
      await db.usuario.update({ where: { id: a.id }, data: { email: null, username: codigoRepetido } });
      await db.usuario.update({ where: { id: b.id }, data: { email: null, username: codigoRepetido } });
      await expect(db.usuario.create({ data: { tenantId: 'A', nombre: 'duplicate', email: null, username: codigoRepetido, passwordHash: oldHash } })).rejects.toThrow();
      const before = await db.sesionAuth.count();
      const res = newRes();
      const error = await failure(login(codigoRepetido, password, nextIp(), res));
      const inexistente = await failure(login(`nadie-${randomUUID()}`, password));
      expect(error.getStatus()).toBe(401);
      expect(error.getResponse()).toEqual(inexistente.getResponse());
      expect(res.cookie).not.toHaveBeenCalled();
      expect(await db.sesionAuth.count()).toBe(before);
      // Nadie recibió un fallo atribuido: el identificador ambiguo no cuenta contra ninguna cuenta real.
      expect((await db.usuario.findUniqueOrThrow({ where: { id: a.id } })).intentosFallidos).toBe(0);
      expect((await db.usuario.findUniqueOrThrow({ where: { id: b.id } })).intentosFallidos).toBe(0);
      // El enlace privado de la empresa (?empresa=) resuelve la cuenta heredada sin campo visible.
      expect(((await login(codigoRepetido, password, nextIp(), newRes(), { tenantId: 'B' })) as any).user?.id).toBe(b.id);
      // Al hacerlo único, se resuelve a su empresa sin indicar empresa alguna.
      const nuevo = `dcm${randomUUID().slice(0, 6)}`;
      await db.usuario.update({ where: { id: a.id }, data: { username: nuevo } });
      expect(((await login(nuevo.toUpperCase())) as any).user?.id).toBe(a.id);
      expect(((await login(codigoRepetido)) as any).user?.id).toBe(b.id);
    });
    it('el mismo correo en dos empresas tampoco se resuelve; las altas y ediciones no pueden duplicar identificadores globales', async () => {
      const a = await account(false, 'CAJERO', 'A'), b = await account(false, 'CAJERO', 'B');
      const compartido = `compartido-${randomUUID()}@example.invalid`;
      await db.usuario.update({ where: { id: a.id }, data: { email: compartido } });
      await db.usuario.update({ where: { id: b.id }, data: { email: compartido } });
      expect((await failure(login(compartido))).getStatus()).toBe(401);
      const usuarios = new UsuariosService(db as any);
      const admin = await account(false, 'ADMIN', 'A');
      await db.usuario.update({ where: { id: a.id }, data: { email: `a-${randomUUID()}@example.invalid` } });
      await expect(usuarios.create('B', { nombre: 'X', username: (a as any).username } as any, admin.id, false)).rejects.toThrow();
      const sa = await account(true);
      await expect(usuarios.create('A', { nombre: 'Y', email: sa.email, rol: 'CAJERO' } as any, admin.id, false)).rejects.toThrow('no está disponible');
      // Edición: tampoco puede tomar el usuario de otra empresa.
      const propio = await account(false, 'CAJERO', 'A');
      await expect(usuarios.update('A', propio.id, { username: (b as any).username } as any, admin.id)).rejects.toThrow('no está disponible');
    });
    it('dos altas simultáneas con el mismo identificador en empresas distintas: solo una gana', async () => {
      const usuarios = new UsuariosService(db as any);
      const adminA = await account(false, 'ADMIN', 'A'), adminB = await account(false, 'ADMIN', 'B');
      const ident = `carrera${randomUUID().slice(0, 6)}`;
      const resultados = await Promise.allSettled([
        usuarios.create('A', { nombre: 'A', username: ident, rol: 'CAJERO' } as any, adminA.id, false),
        usuarios.create('B', { nombre: 'B', username: ident, rol: 'CAJERO' } as any, adminB.id, false),
      ]);
      expect(resultados.filter(r => r.status === 'fulfilled')).toHaveLength(1);
      expect(await db.usuario.count({ where: { username: ident } })).toBe(1);
    });
  });

  describe('MFA obligatorio del Super Admin', () => {
    it('la contraseña correcta sola no abre sesión: el servidor pide el código y no cuenta un fallo', async () => {
      const sa = await account(true);
      const res = newRes();
      const paso = await failure(login(sa.email, password, nextIp(), res));
      expect(paso.getStatus()).toBe(401);
      expect(paso.getResponse()).toMatchObject({ code: 'MFA_REQUERIDO' });
      expect(res.cookie).not.toHaveBeenCalled();
      expect((await fresh(sa) as any).intentosFallidos).toBe(0);
      expect(await db.sesionAuth.count({ where: { sujetoId: sa.id } })).toBe(0);
    });
    it('TOTP real: entra una vez; el mismo código no se reutiliza; la sesión exige mfa y un Super Admin sin MFA no conserva acceso', async () => {
      const sa = await account(true);
      const step = Math.floor(Date.now() / 30000);
      const res = newRes();
      const result: any = await auth.login({ usuario: sa.email.toUpperCase(), password, mfaCode: totp(SECRETO_TOTP, step) }, res, nextIp());
      expect(result.type).toBe('super_admin');
      const claims: any = jwt.decode(result.accessToken);
      expect(claims).toMatchObject({ mfa: true, type: 'super_admin' });
      await expect(strategy.validate(claims)).resolves.toMatchObject({ sub: sa.id, type: 'super_admin' });
      expect(res.cookie).toHaveBeenCalledWith('superAdminRefreshToken', expect.any(String), expect.any(Object));
      // Anti-replay: el mismo paso TOTP no vuelve a servir.
      const replay = await failure(auth.login({ usuario: sa.email, password, mfaCode: totp(SECRETO_TOTP, step) }, newRes(), nextIp()));
      expect(replay.getStatus()).toBe(401);
      // Un token sin el reclamo mfa no autoriza, y retirar el secreto corta las sesiones existentes.
      await expect(strategy.validate({ ...claims, mfa: undefined })).rejects.toThrow();
      await db.superAdmin.update({ where: { id: sa.id }, data: { mfaSecret: null } });
      await expect(strategy.validate(claims)).rejects.toThrow();
    });
    it('un código incorrecto cuenta para los límites; un Super Admin sin MFA debe enrolarlo antes de entrar', async () => {
      const sa = await account(true);
      expect((await failure(auth.login({ usuario: sa.email, password, mfaCode: '000000' }, newRes(), nextIp()))).getStatus()).toBe(401);
      const sinMfa = await account(true);
      await db.superAdmin.update({ where: { id: sinMfa.id }, data: { mfaSecret: null } });
      const enrolar = await failure(auth.login({ usuario: sinMfa.email, password, mfaCode: '123456' }, newRes(), nextIp()));
      expect(enrolar.getResponse()).toMatchObject({ code: 'MFA_ENROLAMIENTO_REQUERIDO' });
      expect(await db.sesionAuth.count({ where: { sujetoId: sinMfa.id } })).toBe(0);
      // Enrolamiento inicial: contraseña + control del correo de la cuenta, luego TOTP; nunca un atajo sin MFA.
      const enviados = deliveries.length;
      await service.requestBootstrap(sinMfa.email, password, nextIp().ip);
      expect(deliveries.length).toBe(enviados + 1);
      const { secret, token } = await service.bootstrapMfa(deliveries.at(-1)!.token, password);
      const { recoveryCodes } = await service.confirmMfa({ token, secret, mfaCode: totp(secret, Math.floor(Date.now() / 30000)) });
      expect(recoveryCodes).toHaveLength(10);
      expect(((await auth.login({ usuario: sinMfa.email, password, mfaCode: recoveryCodes[0] }, newRes(), nextIp())) as any).type).toBe('super_admin');
    }, 30000);
    it('una cuenta de negocio con MFA configurado también lo exige solo después de su contraseña', async () => {
      const admin = await account(false, 'ADMIN');
      await db.usuario.update({ where: { id: admin.id }, data: { mfaSecret: sealSecret(SECRETO_TOTP, admin.id, config) } });
      expect((await failure(login(admin.email, 'mala-clave'))).getResponse()).not.toHaveProperty('code');
      expect((await failure(login(admin.email))).getResponse()).toMatchObject({ code: 'MFA_REQUERIDO' });
      expect(((await login(admin.email, password, nextIp(), newRes(), { mfaCode: await codigo(admin) })) as any).type).toBe('tenant');
    });
    it('/admin/auth/login exige el mismo MFA y no acepta cuentas de negocio', async () => {
      const sa = await account(true), admin = await account(false, 'ADMIN');
      // El controlador de plataforma no está montado en esta matriz: se usa el servicio, igual que en producción.
      const { SuperAdminService } = await import('../src/super-admin/super-admin.service');
      const plataforma = new SuperAdminService(db as any, jwt, config, {} as any, {} as any);
      expect((await failure(plataforma.login({ email: sa.email, password }, newRes(), nextIp()))).getResponse()).toMatchObject({ code: 'MFA_REQUERIDO' });
      expect(await plataforma.login({ email: sa.email, password, mfaCode: await codigo(sa) }, newRes(), nextIp())).toMatchObject({ accessToken: expect.any(String), superAdmin: { id: sa.id } });
      expect((await failure(plataforma.login({ email: admin.email, password }, newRes(), nextIp()))).getStatus()).toBe(401);
    });
  });

  describe('bloqueo de cuentas operativas', () => {
    it.each(['CAJERO', 'VENDEDOR', 'BODEGUERO'] as Rol[])('%s: los fallos 1 a 5 no bloquean, el sexto sí; la respuesta nunca revela el bloqueo', async rol => {
      const a = await account(false, rol);
      const sesion = await session(a);
      const respuestas: any[] = [];
      for (let i = 1; i <= MAX_FALLOS_BLOQUEO; i++) {
        const error = await failure(login(a.email, 'incorrecta-' + i));
        expect(error.getStatus()).toBe(401);
        respuestas.push(error.getResponse());
        expect((await fresh(a) as any).bloqueadoAt).toBeNull();
      }
      const sexto = await failure(login(a.email, 'incorrecta-6'));
      expect(sexto.getStatus()).toBe(401);
      expect(sexto.getResponse()).toEqual(respuestas[0]);
      const bloqueada: any = await fresh(a);
      expect(bloqueada.bloqueadoAt).toBeInstanceOf(Date);
      expect(bloqueada.intentosFallidos).toBe(6);
      // El bloqueo revoca la sesión abierta y anula enlaces pendientes.
      await expect(strategy.validate(sesion)).rejects.toThrow();
      // Ni la contraseña correcta entra, y la respuesta es idéntica a la de una incorrecta (sin oráculo).
      const correcta = await failure(login(a.email, password));
      expect(correcta.getResponse()).toEqual(respuestas[0]);
      expect((await fresh(a) as any).intentosFallidos).toBe(6);
      expect(await db.authEvent.count({ where: { sujetoId: a.id, event: 'ACCOUNT_LOCKED' } })).toBe(1);
      // Ninguna recuperación pública: la solicitud no envía nada para un empleado.
      const before = temporals.length;
      await service.request({ usuario: a.email }, nextIp().ip);
      expect(temporals.length).toBe(before);
    }, 30000);
    it('Admin y Super Admin nunca se bloquean de forma permanente (los frena el límite temporal y recuperan por correo)', async () => {
      const admin = await account(false, 'ADMIN'), sa = await account(true);
      for (let i = 0; i < 8; i++) { await failure(login(admin.email, 'mala')); await failure(login(sa.email, 'mala')); }
      expect((await fresh(admin) as any).bloqueadoAt).toBeNull();
      expect(((await login(admin.email)) as any).type).toBe('tenant');
      expect(((await loginSa(sa)) as any).type).toBe('super_admin');
      expect((await fresh(admin) as any).intentosFallidos).toBe(0);
      expect((await fresh(sa) as any).intentosFallidos).toBe(0);
    });
    it('un acceso correcto reinicia la racha: cinco fallos, éxito y cinco fallos más no bloquean', async () => {
      const a = await account(false, 'CAJERO');
      for (let i = 0; i < 5; i++) await failure(login(a.email, 'mala'));
      await login(a.email);
      expect((await fresh(a) as any).intentosFallidos).toBe(0);
      for (let i = 0; i < 5; i++) await failure(login(a.email, 'mala'));
      expect((await fresh(a) as any).bloqueadoAt).toBeNull();
      await expect(login(a.email)).resolves.toMatchObject({ type: 'tenant' });
    });
    it('con los umbrales productivos el quinto fallo pausa el identificador y el sexto, tras la pausa, bloquea', async () => {
      const a = await account(false, 'CAJERO');
      for (let i = 0; i < 5; i++) expect((await failure(authProd.login({ usuario: a.email, password: 'mala' }, newRes(), nextIp()))).getStatus()).toBe(401);
      // Pausa por identificador (igual para cualquier identificador, exista o no): no cuenta más fallos persistentes.
      expect((await failure(authProd.login({ usuario: a.email, password: 'mala' }, newRes(), nextIp()))).getStatus()).toBe(429);
      expect((await fresh(a) as any).intentosFallidos).toBe(5);
      const inexistente = `nadie-${randomUUID()}`;
      for (let i = 0; i < 5; i++) await failure(authProd.login({ usuario: inexistente, password: 'mala' }, newRes(), nextIp()));
      expect((await failure(authProd.login({ usuario: inexistente, password: 'mala' }, newRes(), nextIp()))).getStatus()).toBe(429);
      // Vence la pausa: el sexto fallo bloquea de forma permanente.
      await db.$executeRawUnsafe(`UPDATE intentos_login SET bloqueado_hasta = now() - interval '1 second'`);
      expect((await failure(authProd.login({ usuario: a.email, password: 'mala' }, newRes(), nextIp()))).getStatus()).toBe(401);
      expect((await fresh(a) as any).bloqueadoAt).toBeInstanceOf(Date);
    });
    it('solicitudes concurrentes se cuentan una sola vez cada una y el bloqueo se registra una sola vez', async () => {
      const a = await account(false, 'CAJERO');
      const results = await Promise.allSettled(Array.from({ length: 12 }, () => login(a.email, 'mala')));
      const final: any = await fresh(a);
      expect(final.bloqueadoAt).toBeInstanceOf(Date);
      const rechazadas = results.filter(r => r.status === 'rejected') as PromiseRejectedResult[];
      expect(rechazadas).toHaveLength(12);
      for (const r of rechazadas) expect(r.reason.getStatus()).toBe(401);
      // Cada intento que alcanzó el incremento cuenta exactamente uno; los que leyeron la cuenta ya bloqueada no cuentan.
      expect(final.intentosFallidos).toBeGreaterThanOrEqual(MAX_FALLOS_BLOQUEO + 1);
      expect(final.intentosFallidos).toBeLessThanOrEqual(12);
      expect(await db.authEvent.count({ where: { sujetoId: a.id, event: 'ACCOUNT_LOCKED' } })).toBe(1);
    });
    it('concurrencia entre instancias de la API: 20 intentos repartidos en dos servicios bloquean una sola vez', async () => {
      const a = await account(false, 'VENDEDOR');
      const otra = new AuthService(db as any, jwt, config);
      const results = await Promise.allSettled(Array.from({ length: 20 }, (_, i) => (i % 2 ? otra : auth).login({ usuario: a.email, password: 'mala' }, newRes(), nextIp())));
      expect(results.every(r => r.status === 'rejected')).toBe(true);
      expect((await fresh(a) as any).bloqueadoAt).toBeInstanceOf(Date);
      expect(await db.authEvent.count({ where: { sujetoId: a.id, event: 'ACCOUNT_LOCKED' } })).toBe(1);
    });
    it('un acceso correcto simultáneo al bloqueo nunca lo deshace', async () => {
      const a = await account(false, 'CAJERO');
      for (let i = 0; i < 5; i++) await failure(login(a.email, 'mala'));
      const results = await Promise.allSettled([login(a.email, 'mala'), login(a.email, password)]);
      const final: any = await fresh(a);
      // O el éxito ganó la carrera (la racha vuelve a 0 y la mala cuenta 1) o el bloqueo ganó y el éxito se rechazó.
      if (final.bloqueadoAt) expect(results[1].status).toBe('rejected');
      else expect(results[1].status).toBe('fulfilled');
    });
    it('Admin del negocio y Super Admin reactivan con auditoría; un Admin no alcanza otra empresa ni a otro Admin; el cajero no gestiona', async () => {
      const admin = await account(false, 'ADMIN', 'A'), peer = await account(false, 'ADMIN', 'A'), sa = await account(true);
      const own = await account(false, 'CAJERO', 'A'), foreign = await account(false, 'VENDEDOR', 'B'), cajero = await account(false, 'CAJERO', 'A');
      await bloquear(own); await bloquear(foreign);
      await expect(service.unlock(cajero.identity, { usuarioId: own.id })).rejects.toThrow();
      await expect(service.unlock(admin.identity, { usuarioId: foreign.id })).rejects.toThrow();
      await expect(service.unlock({ ...admin.identity, tenantId: 'A' }, { usuarioId: foreign.id, tenantId: 'B' })).rejects.toThrow();
      await expect(service.unlock(admin.identity, { usuarioId: peer.id })).rejects.toThrow();
      await expect(service.unlock(admin.identity, { usuarioId: admin.id })).rejects.toThrow();
      expect((await fresh(foreign) as any).bloqueadoAt).toBeInstanceOf(Date);
      await expect(service.unlock({ ...admin.identity, impersonatedBy: 'SA' }, { usuarioId: own.id })).rejects.toThrow();
      // Listados: el Admin solo ve los bloqueados de su empresa; el Super Admin, los de todas.
      const propios = await service.locked(admin.identity);
      expect(propios.map(u => u.id)).toContain(own.id);
      expect(propios.every(u => u.tenantId === 'A')).toBe(true);
      await expect(service.locked(cajero.identity)).rejects.toThrow();
      const globales = (await service.locked(sa.identity)).map(u => u.id);
      expect(globales).toEqual(expect.arrayContaining([own.id, foreign.id]));
      expect(JSON.stringify(await service.locked(sa.identity))).not.toMatch(/password|mfa/i);
      await expect(service.unlock(admin.identity, { usuarioId: own.id })).resolves.toMatchObject({ desbloqueada: true });
      expect(((await login(own.email)) as any).user.id).toBe(own.id);
      // Super Admin: alcance global, cualquier empresa. No reactiva cuentas desactivadas.
      await db.usuario.update({ where: { id: foreign.id }, data: { activo: false } });
      await service.unlock(sa.identity, { usuarioId: foreign.id, tenantId: 'B' });
      expect((await fresh(foreign) as any).activo).toBe(false);
      expect((await failure(login(foreign.email))).getResponse()).toMatchObject({ message: 'Este usuario ha sido desactivado' });
      expect(await db.authEvent.count({ where: { event: 'ACCOUNT_UNLOCKED', sujetoId: { in: [own.id, foreign.id] } } })).toBe(2);
      expect((await db.authEvent.findMany({ where: { event: 'ACCOUNT_UNLOCKED', sujetoId: own.id } }))[0]).toMatchObject({ actorId: admin.id, tenantId: 'A' });
      // Auditoría visible en el historial del negocio, sin credenciales.
      const auditoria = await db.$queryRaw<{ usuario_id: string; datos: any }[]>`SELECT usuario_id, datos FROM auditoria_operaciones WHERE operacion = 'USUARIO_DESBLOQUEAR' AND entidad_id IN (${own.id}, ${foreign.id}) ORDER BY created_at`;
      expect(auditoria.map(f => f.usuario_id)).toEqual([admin.id, sa.id]);
      expect(JSON.stringify(auditoria)).not.toMatch(/password|hash/i);
    }, 60000);
    it('el restablecimiento por Admin/Super Admin entrega un enlace de un uso, desbloquea al aplicarse y cierra sesiones', async () => {
      const admin = await account(false, 'ADMIN', 'A'), sa = await account(true), u = await account(false, 'CAJERO', 'A');
      const payload = await session(u);
      await bloquear(u);
      await expect(service.adminReset(admin.identity, { usuarioId: u.id, currentPassword: 'equivocada' })).rejects.toThrow();
      // El Super Admin se reautentica con contraseña Y segundo factor.
      await expect(service.adminReset(sa.identity, { usuarioId: u.id, tenantId: 'A', currentPassword: password })).rejects.toThrow();
      for (const actor of [{ identity: admin.identity, tenantId: undefined, mfa: undefined }, { identity: sa.identity, tenantId: 'A', mfa: await codigo(sa) }]) {
        const result = await service.adminReset(actor.identity, { usuarioId: u.id, tenantId: actor.tenantId, currentPassword: password, mfaCode: actor.mfa });
        expect(result).not.toHaveProperty('password');
        await expect(strategy.validate(payload)).rejects.toThrow();
      }
      const link = await service.adminReset(sa.identity, { usuarioId: u.id, tenantId: 'A', currentPassword: password, mfaCode: await codigo(sa) });
      const concurrent = await Promise.allSettled([service.reset({ token: link.token, password: replacement }), service.reset({ token: link.token, password: replacement })]);
      expect(concurrent.filter(r => r.status === 'fulfilled')).toHaveLength(1);
      const after: any = await fresh(u);
      expect(after.bloqueadoAt).toBeNull();
      expect(after.intentosFallidos).toBe(0);
      expect(((await login(u.email, replacement)) as any).user.id).toBe(u.id);
      expect(await db.authEvent.count({ where: { sujetoId: u.id, event: 'ADMIN_RESET_REQUEST' } })).toBeGreaterThanOrEqual(3);
    }, 60000);
  });

  describe('recuperación de Admin y Super Admin por contraseña temporal', () => {
    it.each([true, false])('platform=%s: tras el tercer fallo llega por correo verificado, exige MFA al Super Admin y contraseña nueva antes de operar', async platform => {
      const a = await account(platform), old = await session(a);
      const logs: string[] = [];
      const spies = (['log', 'warn', 'error', 'debug', 'verbose'] as const).map(level => vi.spyOn(Logger.prototype, level).mockImplementation((...args: any[]) => { logs.push(JSON.stringify(args)); }));
      let temporal = '';
      try {
        // Antes del tercer fallo la solicitud no envía nada.
        await failure(login(a.email, 'mala')); await failure(login(a.email, 'mala'));
        const sent0 = temporals.length;
        await service.request({ usuario: a.email }, nextIp().ip);
        expect(temporals.length).toBe(sent0);
        const tres = await failure(login(a.email, 'mala'));
        expect(tres.getResponse()).toEqual({ statusCode: 401, message: 'Credenciales inválidas', error: 'Unauthorized' });
        expect(await service.request({ usuario: a.email }, nextIp().ip)).toMatchObject({ message: expect.any(String) });
        expect(temporals.length).toBe(sent0 + 1);
        ({ password: temporal } = temporals.at(-1)!);
        expect(temporals.at(-1)!.to).toBe(a.email);
        expect(temporal).toMatch(/^[A-HJ-NP-Za-km-z2-9]{4}(-[A-HJ-NP-Za-km-z2-9]{4}){3}$/);
        // Solo el hash está guardado, ligado a la cuenta, su correo y su contraseña vigente, con vigencia de 10 minutos.
        const stored = await db.authAction.findUniqueOrThrow({ where: { hash: tokenHash(temporal) } });
        expect(stored).toMatchObject({ purpose: 'TEMP_PASSWORD', sujetoId: a.id, email: a.email, passwordBinding: tokenHash(a.passwordHash), tenantId: platform ? null : 'A' });
        expect(stored.expiresAt.getTime() - Date.now()).toBeLessThanOrEqual(600000);
        expect(stored.expiresAt.getTime() - Date.now()).toBeGreaterThan(590000);
        // Pedirla no invalida la contraseña actual (un tercero no deja fuera al titular)... pero no la usamos aquí.
        const sessions = await db.sesionAuth.count({ where: { sujetoId: a.id } });
        if (platform) {
          // MFA obligatorio también en la recuperación: sin código, la temporal no se consume.
          const paso = await failure(login(a.email, temporal));
          expect(paso.getResponse()).toMatchObject({ code: 'MFA_REQUERIDO' });
          expect(await db.authAction.count({ where: { hash: tokenHash(temporal) } })).toBe(1);
          expect((await failure(login(a.email, temporal, nextIp(), newRes(), { mfaCode: '000000' }))).getStatus()).toBe(401);
          expect(await db.authAction.count({ where: { hash: tokenHash(temporal) } })).toBe(1);
        }
        const res = newRes();
        const entrada: any = await login(a.email, temporal, nextIp(), res, platform ? { mfaCode: await codigo(a) } : {});
        expect(entrada).toMatchObject({ type: 'password_change_required', requiereCambioPassword: true, expiresIn: 600 });
        expect(entrada).not.toHaveProperty('accessToken');
        expect(res.cookie).not.toHaveBeenCalled();
        expect(await db.sesionAuth.count({ where: { sujetoId: a.id, revokedAt: null } })).toBe(0);
        expect(await db.sesionAuth.count({ where: { sujetoId: a.id } })).toBe(sessions);
        // Usarla revoca de inmediato las sesiones anteriores, aunque aún no defina la nueva.
        await expect(strategy.validate(old)).rejects.toThrow();
        // Un solo uso: la misma temporal ya no sirve.
        expect((await failure(login(a.email, temporal, nextIp(), newRes(), platform ? { mfaCode: await codigo(a) } : {}))).getStatus()).toBe(401);
        // Contraseña nueva obligatoria, con la política de contraseñas; igual a la actual se rechaza.
        const http = request(app.getHttpServer());
        await http.post('/api/auth/security/forced-change').send({ token: entrada.cambioToken, password: 'weak' }).expect(400);
        await expect(service.forcedChange({ token: entrada.cambioToken, password })).rejects.toThrow();
        const [ok, dup] = await Promise.allSettled([service.forcedChange({ token: entrada.cambioToken, password: replacement }), service.forcedChange({ token: entrada.cambioToken, password: replacement })]);
        expect([ok, dup].filter(r => r.status === 'fulfilled')).toHaveLength(1);
        // La contraseña anterior ya no sirve; la nueva funciona (con MFA para el Super Admin) y reinicia contadores.
        expect((await failure(login(a.email, password))).getStatus()).toBe(401);
        expect(await db.authAction.count({ where: { sujetoId: a.id } })).toBe(0);
        const ingreso: any = platform ? await loginSa(a, replacement) : await login(a.email, replacement);
        expect(ingreso.type).toBe(platform ? 'super_admin' : 'tenant');
        expect((await fresh(a) as any).intentosFallidos).toBe(0);
        expect(await db.authEvent.count({ where: { sujetoId: a.id, event: { in: ['TEMP_PASSWORD_ISSUED', 'TEMP_PASSWORD_USED', 'PASSWORD_FORCED_CHANGE'] } } })).toBe(3);
      } finally { spies.forEach(spy => spy.mockRestore()); }
      // La temporal y la nueva contraseña nunca aparecen en logs, auditoría, acciones ni sesiones.
      const volcado = JSON.stringify({ logs, eventos: await db.authEvent.findMany({ where: { sujetoId: a.id } }), acciones: await db.authAction.findMany({ where: { sujetoId: a.id } }), sesiones: await db.sesionAuth.findMany({ where: { sujetoId: a.id } }) });
      for (const secreto of [temporal, replacement]) expect(volcado).not.toContain(secreto);
    }, 90000);
    it('la temporal del Super Admin también corta el soporte remoto que hubiera iniciado', async () => {
      const sa = await account(true);
      const sid = randomUUID();
      await db.sesionAuth.create({ data: { id: sid, tipo: 'SOPORTE', sujetoId: 'algun-usuario', tenantId: 'A', expiresAt: new Date(Date.now() + 600000) } });
      const temporal = await temporalPara(sa);
      await loginSa(sa, temporal);
      expect((await db.sesionAuth.findUniqueOrThrow({ where: { id: sid } })).revokedAt).toBeInstanceOf(Date);
    });
    it('una temporal expirada, de otra cuenta, emitida antes de cambiar la contraseña o el correo no entra; solo vale la última', async () => {
      const a = await account(), b = await account();
      const vencida = await temporalPara(a);
      await db.authAction.update({ where: { hash: tokenHash(vencida) }, data: { expiresAt: new Date(Date.now() - 1) } });
      expect((await failure(login(a.email, vencida))).getStatus()).toBe(401);
      const ajena = await temporalPara(b);
      expect((await failure(login(a.email, ajena))).getStatus()).toBe(401);
      const primera = await temporalPara(a), segunda = await temporalPara(a);
      expect((await failure(login(a.email, primera))).getStatus()).toBe(401);
      // Cambiar la contraseña invalida una temporal pendiente.
      const pendiente = await temporalPara(a);
      await service.change(a.identity, { currentPassword: password, password: replacement });
      expect((await failure(login(a.email, pendiente))).getStatus()).toBe(401);
      expect(segunda).not.toBe(pendiente);
      // Entrar con la contraseña vigente descarta la temporal pendiente.
      const descartada = await temporalPara({ ...a, passwordHash: (await fresh(a)).passwordHash });
      await login(a.email, replacement);
      expect(await db.authAction.count({ where: { hash: tokenHash(descartada) } })).toBe(0);
    });
    it('la temporal usada o un token de cambio vencido no dan acceso; el token de cambio no es un access token', async () => {
      const a = await account();
      const temporal = await temporalPara(a);
      const entrada: any = await login(a.email, temporal);
      await expect(strategy.validate({ sub: a.id, type: 'password_change', tenantId: 'A' })).rejects.toThrow();
      await request(app.getHttpServer()).get('/api/auth/me').auth(entrada.cambioToken, { type: 'bearer' }).expect(401);
      await db.authAction.updateMany({ where: { sujetoId: a.id, purpose: 'FORCED_CHANGE' }, data: { expiresAt: new Date(Date.now() - 1) } });
      await expect(service.forcedChange({ token: entrada.cambioToken, password: replacement })).rejects.toThrow();
      expect((await fresh(a)).passwordHash).toBe(a.passwordHash);
    });
    it('con la pausa por intentos del identificador activa, la temporal vigente aún entra; una contraseña cualquiera no', async () => {
      const a = await account();
      const ip = nextIp();
      for (let i = 0; i < 5; i++) await failure(authProd.login({ usuario: a.email, password: 'mala' }, newRes(), ip));
      expect((await failure(authProd.login({ usuario: a.email, password }, newRes(), ip))).getStatus()).toBe(429);
      const temporal = await temporalPara(a);
      expect((await failure(authProd.login({ usuario: a.email, password }, newRes(), nextIp()))).getStatus()).toBe(429);
      expect(((await authProd.login({ usuario: a.email, password: temporal }, newRes(), nextIp())) as any).type).toBe('password_change_required');
      // Probar la temporal prueba el correo: la pausa por identificador se levanta y la contraseña vigente vuelve a servir.
      expect(((await authProd.login({ usuario: a.email, password }, newRes(), nextIp())) as any).type).toBe('tenant');
    });
    it('responde igual, y no envía nada, para cuentas que no cumplen: antes del tercer fallo, sin correo verificado, empleado, Super Admin sin MFA, inexistente o ambiguo', async () => {
      const antes = await account(), sinCorreo = await account(false, 'ADMIN', 'A', false), empleado = await account(false, 'CAJERO'), elegible = await account();
      const saSinMfa = await account(true);
      await db.superAdmin.update({ where: { id: saSinMfa.id }, data: { mfaSecret: null } });
      for (const a of [sinCorreo, empleado, elegible, saSinMfa]) for (let i = 0; i < 3; i++) await failure(login(a.email, 'mala'));
      const ambiguo = [await account(false, 'ADMIN', 'A'), await account(false, 'ADMIN', 'B')];
      const comun = `repetido-${randomUUID()}@example.invalid`;
      for (const a of ambiguo) {
        for (let i = 0; i < 3; i++) await failure(login(a.email, 'mala'));
        await db.usuario.update({ where: { id: a.id }, data: { email: comun } });
      }
      const before = temporals.length;
      const inicio = Date.now();
      const uno = await service.request({ usuario: elegible.email }, nextIp().ip);
      expect(Date.now() - inicio).toBeGreaterThanOrEqual(8400);
      expect(temporals.length).toBe(before + 1);
      for (const usuario of [antes.email, sinCorreo.email, empleado.email, saSinMfa.email, 'absent@example.invalid', comun]) {
        const t0 = Date.now();
        expect(await service.request({ usuario }, nextIp().ip)).toEqual(uno);
        expect(Date.now() - t0).toBeGreaterThanOrEqual(8400);
      }
      expect(temporals.length).toBe(before + 1);
    }, 120000);
    it('si el correo falla no queda una temporal vigente que nadie recibió', async () => {
      const a = await account();
      for (let i = 0; i < 3; i++) await failure(login(a.email, 'mala'));
      mail.sendTemporaryPassword.mockRejectedValueOnce(new Error('proveedor caído'));
      await service.request({ usuario: a.email }, nextIp().ip);
      expect(await db.authAction.count({ where: { sujetoId: a.id, purpose: 'TEMP_PASSWORD' } })).toBe(0);
    }, 30000);
  });

  it.each(['CAJERO', 'VENDEDOR', 'BODEGUERO', 'ADMIN'] as Rol[])('ya no acepta el token heredado RESET_EMAIL (%s): la recuperación por correo es la temporal', async rol => {
    const a = await account(false, rol), token = await action(a, 'RESET_EMAIL');
    await expect(service.reset({ token, password: replacement })).rejects.toThrow();
    expect((await db.usuario.findUniqueOrThrow({ where: { id: a.id } })).passwordHash).toBe(a.passwordHash);
  });
  it('issues a private employee reset, revokes sessions immediately and rejects foreign tenants and non-admin actors', async () => {
    const admin = await account(false, 'ADMIN', 'A'), employee = await account(false, 'CAJERO', 'A'), outsider = await account(false, 'CAJERO', 'B');
    const payload = await session(employee);
    await expect(service.adminReset(employee.identity, { usuarioId: admin.id, currentPassword: password })).rejects.toThrow();
    await expect(service.adminReset(admin.identity, { usuarioId: outsider.id, currentPassword: password })).rejects.toThrow();
    await expect(service.adminReset(admin.identity, { usuarioId: employee.id, tenantId: 'B', currentPassword: password })).rejects.toThrow();
    const result = await service.adminReset(admin.identity, { usuarioId: employee.id, currentPassword: password });
    expect(result).not.toHaveProperty('password');
    await expect(strategy.validate(payload)).rejects.toThrow();
    const concurrent = await Promise.allSettled([service.reset({ token: result.token, password: replacement }), service.reset({ token: result.token, password: replacement })]);
    expect(concurrent.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    expect((await db.usuario.findUniqueOrThrow({ where: { id: outsider.id } })).passwordHash).toBe(outsider.passwordHash);
  });
  it('un Admin sin segundo factor no restablece a otro Admin; con MFA sí', async () => {
    const admin = await account(false, 'ADMIN', 'A'), peer = await account(false, 'ADMIN', 'A');
    await expect(service.adminReset(admin.identity, { usuarioId: peer.id, currentPassword: password })).rejects.toThrow('no autorizado');
    await db.usuario.update({ where: { id: admin.id }, data: { mfaSecret: sealSecret(SECRETO_TOTP, admin.id, config) } });
    await expect(service.adminReset(admin.identity, { usuarioId: peer.id, currentPassword: password, mfaCode: await codigo(admin) })).resolves.toMatchObject({ token: expect.any(String) });
  });
  it('rejects expired tokens, changed-email tokens and changed-password tokens', async () => {
    const a = await account(false, 'CAJERO');
    const expired = await action(a, 'RESET_ADMIN', new Date(Date.now()-1));
    await expect(service.reset({ token: expired, password: replacement })).rejects.toThrow();
    const changedEmail = await action(a);
    await db.usuario.update({ where: { id: a.id }, data: { email: `changed-${a.email}` } });
    await expect(service.reset({ token: changedEmail, password: replacement })).rejects.toThrow();
    await db.usuario.update({ where: { id: a.id }, data: { email: a.email, passwordHash: await bcrypt.hash(replacement, 4) } });
    const changedPassword = await action(a);
    await expect(service.reset({ token: changedPassword, password: replacement })).rejects.toThrow();
  });
  it('cualquier usuario cambia su contraseña conociendo la actual e invalida todas sus sesiones', async () => {
    for (const rol of ['VENDEDOR', 'CAJERO', 'ADMIN'] as Rol[]) {
      const a = await account(false, rol), payload = await session(a);
      await expect(service.change(a.identity, { currentPassword: 'wrong', password: replacement })).rejects.toThrow();
      await service.change(a.identity, { currentPassword: password, password: replacement });
      await expect(strategy.validate(payload)).rejects.toThrow();
      // A login that raced with the reset cannot revive the old password's session.
      const raced = await session(a); await expect(strategy.validate(raced)).rejects.toThrow();
      expect(((await login(a.email, replacement)) as any).type).toBe('tenant');
    }
  });
  it('Super Admin cambia su contraseña con la actual y su segundo factor, y cierra las sesiones de soporte que originó', async () => {
    const sa = await account(true), payload = await session(sa);
    const soporte = randomUUID();
    await db.sesionAuth.create({ data: { id: soporte, tipo: 'SOPORTE', sujetoId: 'algun-usuario', tenantId: 'A', expiresAt: new Date(Date.now() + 600000) } });
    await expect(service.change(sa.identity, { currentPassword: password, password: replacement })).rejects.toThrow();
    await service.change(sa.identity, { currentPassword: password, password: replacement, mfaCode: await codigo(sa) });
    await expect(strategy.validate(payload)).rejects.toThrow();
    expect((await db.sesionAuth.findUniqueOrThrow({ where: { id: soporte } })).revokedAt).toBeInstanceOf(Date);
  });
  it('enforces idle expiration in backend, while active sessions still validate', async () => {
    const a = await account(false, 'CAJERO'), payload = await session(a);
    await expect(strategy.validate(payload)).resolves.toMatchObject({ sub: a.id });
    await db.sesionAuth.update({ where: { id: payload.sid }, data: { lastActivityAt: new Date(Date.now()-900001) } });
    await expect(strategy.validate(payload)).rejects.toThrow();
  });
  it('supports email-free users and verifies an Admin mailbox', async () => {
    const a = await account(false, 'ADMIN', 'A', false);
    await expect(login(a.email, 'mala')).rejects.toThrow();
    await service.requestVerification(a.identity);
    const token = deliveries.at(-1)!.token;
    await service.verifyEmail(token); await expect(service.verifyEmail(token)).rejects.toThrow();
    expect((await db.usuario.findUniqueOrThrow({ where: { id: a.id } })).emailVerifiedAt).toBeInstanceOf(Date);
  });
  it('denies impersonated credential operations and direct administrator password assignment', async () => {
    const a = await account(false, 'ADMIN', 'A');
    await expect(service.change({ ...a.identity, impersonatedBy: 'SA' }, { currentPassword: password, password: replacement })).rejects.toThrow();
    await expect(service.unlock({ ...a.identity, impersonatedBy: 'SA' }, { usuarioId: a.id })).rejects.toThrow();
    await expect(new UsuariosService(db as any).update('A', a.id, { password: replacement }, a.id)).rejects.toThrow('enlace privado');
  });
  it('enforces real HTTP validation, origin checks, identity, authorization, lock and recovery contract through NestJS', async () => {
    const a = await account(false, 'CAJERO'), payload = await session(a);
    const access = jwt.sign(payload);
    const http = request(app.getHttpServer());
    await http.post('/api/auth/security/change-password').send({ currentPassword: password, password: replacement }).expect(401);
    await http.post('/api/auth/security/change-password').set('Origin', 'https://attacker.invalid').auth(access, { type: 'bearer' }).send({ currentPassword: password, password: replacement }).expect(403);
    await http.post('/api/auth/security/request').set('Origin', 'https://attacker.invalid').send({ usuario: a.email }).expect(403);
    await http.post('/api/auth/security/forced-change').set('Origin', 'https://attacker.invalid').send({ token: 'x', password: replacement }).expect(403);
    await http.post('/api/auth/security/reset').send({ token: 'synthetic', password: 'weak' }).expect(400);
    await http.post('/api/auth/security/admin-reset').auth(access, { type: 'bearer' }).send({ usuarioId: a.id, currentPassword: password }).expect(403);
    await http.post('/api/auth/security/unlock').auth(access, { type: 'bearer' }).send({ usuarioId: a.id }).expect(403);
    await http.get('/api/auth/security/locked').auth(access, { type: 'bearer' }).expect(403);
    // El contrato del login: usuario y contraseña. Rol, empresa visible o casilla de plataforma no existen (el pipe prohíbe extras).
    await http.post('/api/auth/login').send({ usuario: a.email, password, rol: 'ADMIN' }).expect(400);
    await http.post('/api/auth/login').send({ usuario: a.email, password, superAdmin: true }).expect(400);
    await http.post('/api/auth/login').send({ password }).expect(400);
    const changed = await http.post('/api/auth/security/change-password').auth(access, { type: 'bearer' }).send({ currentPassword: password, password: replacement }).expect(201);
    expect(changed.headers['cache-control']).toContain('no-store');
    await http.get('/api/auth/me').auth(access, { type: 'bearer' }).expect(401);
    const ok = await http.post('/api/auth/login').send({ usuario: a.email, password: replacement }).expect(200);
    expect(ok.body).toMatchObject({ type: 'tenant', tenant: { id: 'A' }, user: { rol: 'CAJERO' } });
    // Bloqueo por HTTP: el sexto fallo y la contraseña correcta posterior reciben el mismo 401 genérico, sin datos de la cuenta.
    const respuestas: any[] = [];
    for (let i = 0; i < 6; i++) respuestas.push((await http.post('/api/auth/login').send({ usuario: a.email, password: 'mala-clave' }).expect(401)).body);
    const correcta = await http.post('/api/auth/login').send({ usuario: a.email, password: replacement }).expect(401);
    expect(correcta.body).toEqual(respuestas[0]);
    expect(respuestas[5]).toEqual(respuestas[0]);
    expect(JSON.stringify(correcta.body)).not.toContain(a.id);
    // Admin: el 401 del tercer fallo no anuncia nada; la temporal viaja por la API de cambio obligatorio sin cookie.
    const admin = await account(false, 'ADMIN', 'A');
    let ultimo: any;
    for (let i = 0; i < 3; i++) ultimo = await http.post('/api/auth/login').send({ usuario: admin.email, password: 'mala-clave' }).expect(401);
    expect(ultimo.body).toEqual({ statusCode: 401, message: 'Credenciales inválidas', error: 'Unauthorized' });
    const temporal = await temporalPara(admin);
    const entrada = await http.post('/api/auth/login').send({ usuario: admin.email, password: temporal }).expect(200);
    expect(entrada.body).toMatchObject({ type: 'password_change_required' });
    expect(entrada.headers['set-cookie']).toBeUndefined();
    await http.post('/api/auth/security/forced-change').send({ token: entrada.body.cambioToken, password: 'Nueva-Clave-2026' }).expect(200);
    await http.post('/api/auth/login').send({ usuario: admin.email, password: 'Nueva-Clave-2026' }).expect(200);
    // Super Admin por HTTP: 401 con MFA_REQUERIDO tras la contraseña; con código, 200 y cookie de plataforma.
    const sa = await account(true);
    const paso = await http.post('/api/auth/login').send({ usuario: sa.email, password }).expect(401);
    expect(paso.body).toMatchObject({ code: 'MFA_REQUERIDO' });
    expect(paso.headers['set-cookie']).toBeUndefined();
    const plataforma = await http.post('/api/auth/login').send({ usuario: sa.email, password, mfaCode: await codigo(sa) }).expect(200);
    expect(plataforma.body.type).toBe('super_admin');
    expect(String(plataforma.headers['set-cookie'])).toContain('superAdminRefreshToken=');
  }, 60000);
});
