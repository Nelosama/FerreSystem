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
import { tokenHash, opaqueToken } from '../src/auth/mfa';
import { emitirContrasenaTemporal } from '../src/auth/contrasena-temporal';
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
describe('Inicio de sesión único, recuperación por contraseña temporal y bloqueo en PostgreSQL desechable', () => {
  const root = resolve(__dirname, '..');
  const bin = process.env.PG_BIN || (process.platform === 'win32' ? 'C:/Program Files/PostgreSQL/18/bin' : '/usr/bin');
  const exe = (name: string) => join(bin, name + (process.platform === 'win32' ? '.exe' : ''));
  const password = 'Synthetic-Current-456!', replacement = 'Synthetic-New-789!';
  const values: Record<string, string> = { NODE_ENV: 'test', JWT_SECRET: 'isolated-auth-test-secret-not-production-123456', AUTH_ACEPTAR_TOKENS_SIN_SESION: 'false' };
  const config = new ConfigService(values), jwt = new JwtService({ secret: values.JWT_SECRET });
  let directory = '', started = false, url = '', db: PrismaClient, service: RecoveryService, auth: AuthService, strategy: JwtStrategy;
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
      if (file !== '20261023000000_auth_recovery' && file !== '20261026000000_login_unico_bloqueo_recuperacion') cpSync(join(root, 'prisma/migrations', file), join(previous, 'migrations', file), { recursive: true });
    }
    migrate(join(previous, 'schema.prisma'));
    db = new PrismaClient({ datasources: { db: { url } } });
    oldHash = await bcrypt.hash(password, 4);
    await db.$executeRaw`INSERT INTO super_admins(id,nombre,email,password_hash,updated_at) VALUES ('existing-SA','Existing','existing@example.invalid',${oldHash},now())`;
    migrate(join(root, 'prisma/schema.prisma')); migrate(join(root, 'prisma/schema.prisma'));
    service = new RecoveryService(db as any, config, mail as any);
    auth = new AuthService(db as any, jwt, config); strategy = new JwtStrategy(config, db as any);
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
  const account = async (platform = false, rol: Rol = 'ADMIN', tenantId = 'A', verified = true) => {
    const id = randomUUID(), email = `${id}@example.invalid`;
    const data = { id, nombre: id, email, passwordHash: await bcrypt.hash(password, 4), emailVerifiedAt: verified ? new Date() : null };
    const row = platform ? await db.superAdmin.create({ data }) : await db.usuario.create({ data: { ...data, tenantId, rol, username: 'u-' + id } });
    return { ...row, platform, identity: { sub: id, type: platform ? 'super_admin' : 'tenant', ...(!platform && { tenantId }) } as any };
  };
  // Cada intento usa su propia IP de prueba: los fallos de una prueba no agotan el presupuesto por IP de otra.
  let ipSeq = 0;
  const nextIp = () => ({ ip: `198.18.${Math.floor(ipSeq / 250)}.${(ipSeq++ % 250) + 1}` }) as any;
  const newRes = () => ({ cookie: vi.fn(), setHeader: vi.fn(), clearCookie: vi.fn() }) as any;
  const login = (usuario: string, pass = password, req = nextIp(), res = newRes()) => auth.login({ usuario, password: pass }, res, req);
  const failure = async (promise: Promise<any>) => promise.then(() => { throw new Error('Debía fallar'); }, (error: any) => error);
  const action = async (a: any, purpose = 'RESET_ADMIN', expiresAt = new Date(Date.now()+600000)) => {
    const token = opaqueToken(); await db.authAction.create({ data: { hash: tokenHash(token), sujetoId: a.id, tipo: a.platform ? 'SUPER_ADMIN' : 'TENANT', tenantId: a.platform ? null : a.tenantId, email: a.email, passwordBinding: tokenHash(a.passwordHash), purpose, expiresAt } }); return token;
  };
  const session = async (a: any) => {
    const sid = randomUUID(); await crearSesion(db, { id: sid, tipo: a.platform ? 'SUPER_ADMIN' : 'TENANT', sujetoId: a.id, tenantId: a.tenantId, expiresAt: new Date(Date.now()+600000), passwordHash: a.passwordHash });
    return { sid, sub: a.id, type: a.platform ? 'super_admin' : 'tenant', tenantId: a.tenantId };
  };
  const fresh = (a: any) => a.platform ? db.superAdmin.findUniqueOrThrow({ where: { id: a.id } }) : db.usuario.findUniqueOrThrow({ where: { id: a.id } });
  const tipo = (a: any) => a.platform ? 'SUPER_ADMIN' : 'TENANT';

  it('preserves existing Super Admin credentials through upgrade and repeated deploy; schema has no drift', async () => {
    expect((await db.superAdmin.findUniqueOrThrow({ where: { id: 'existing-SA' } })).passwordHash).toBe(oldHash);
    expect((await db.superAdmin.findUniqueOrThrow({ where: { id: 'existing-SA' } })).intentosFallidos).toBe(0);
    run(process.execPath, [join(root,'node_modules/prisma/build/index.js'), 'migrate', 'diff', '--from-url', url, '--to-schema-datamodel', join(root,'prisma/schema.prisma'), '--exit-code']);
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
    it('Super Admin entra solo con su correo, sin código MFA, y su token no lleva el reclamo mfa', async () => {
      const a = await account(true);
      // Una cuenta que tuvo MFA configurado ya no lo exige.
      await db.superAdmin.update({ where: { id: a.id }, data: { mfaSecret: 'secreto-heredado-sin-uso' } });
      const res = newRes(), result: any = await login(a.email, password, nextIp(), res);
      expect(result.type).toBe('super_admin');
      const claims: any = jwt.decode(result.accessToken);
      expect(claims).not.toHaveProperty('mfa');
      await expect(strategy.validate(claims)).resolves.toMatchObject({ sub: a.id, type: 'super_admin' });
      // Un Super Admin sin ningún secreto MFA también opera: la exigencia efectiva desapareció de la estrategia JWT.
      await db.superAdmin.update({ where: { id: a.id }, data: { mfaSecret: null } });
      await expect(strategy.validate(claims)).resolves.toMatchObject({ sub: a.id });
      expect(res.cookie).toHaveBeenCalledWith('superAdminRefreshToken', expect.any(String), expect.any(Object));
    });
    it('un acceso correcto sin fallos pendientes no modifica la fila del usuario ni la del Super Admin', async () => {
      const u = await account(false, 'CAJERO'), sa = await account(true);
      const [antesU, antesSa] = [await fresh(u), await fresh(sa)];
      await login(u.email); await login(sa.email);
      expect(await fresh(u)).toEqual(antesU);
      expect(await fresh(sa)).toEqual(antesSa);
    });
    it('un código repetido en dos empresas no entra con la contraseña correcta de ninguna y no crea sesiones', async () => {
      const a = await account(false, 'CAJERO', 'A'), b = await account(false, 'CAJERO', 'B');
      await db.usuario.update({ where: { id: a.id }, data: { email: null, username: '44556' } });
      await db.usuario.update({ where: { id: b.id }, data: { email: null, username: '44556' } });
      await expect(db.usuario.create({ data: { tenantId: 'A', nombre: 'duplicate', email: null, username: '44556', passwordHash: oldHash } })).rejects.toThrow();
      const before = await db.sesionAuth.count();
      const res = newRes();
      const error = await failure(login('44556', password, nextIp(), res));
      expect(error.getStatus()).toBe(401);
      expect(error.getResponse()).toMatchObject({ message: 'Credenciales inválidas' });
      expect(error.getResponse()).not.toHaveProperty('recuperacionDisponible');
      expect(res.cookie).not.toHaveBeenCalled();
      expect(await db.sesionAuth.count()).toBe(before);
      // Nadie recibió un fallo atribuido: el identificador ambiguo no cuenta contra ninguna cuenta real.
      expect((await db.usuario.findUniqueOrThrow({ where: { id: a.id } })).intentosFallidos).toBe(0);
      expect((await db.usuario.findUniqueOrThrow({ where: { id: b.id } })).intentosFallidos).toBe(0);
      // Al hacerlo único, se resuelve a su empresa sin indicar empresa alguna.
      await db.usuario.update({ where: { id: a.id }, data: { username: 'danielcm' } });
      expect(((await login('DanielCM')) as any).user?.id).toBe(a.id);
      expect(((await login('44556')) as any).user?.id).toBe(b.id);
    });
    it('el mismo correo en dos empresas tampoco se resuelve; las altas nuevas no pueden duplicar identificadores globales', async () => {
      const a = await account(false, 'CAJERO', 'A'), b = await account(false, 'CAJERO', 'B');
      const compartido = `compartido-${randomUUID()}@example.invalid`;
      await db.usuario.update({ where: { id: a.id }, data: { email: compartido } });
      await db.usuario.update({ where: { id: b.id }, data: { email: compartido } });
      expect((await failure(login(compartido))).getStatus()).toBe(401);
      const usuarios = new UsuariosService(db as any);
      const admin = await account(false, 'ADMIN', 'A');
      await db.usuario.update({ where: { id: a.id }, data: { email: `a-${randomUUID()}@example.invalid` } });
      await expect(usuarios.create('B', { nombre: 'X', username: a.username } as any, admin.id, false)).rejects.toThrow();
      const sa = await account(true);
      await expect(usuarios.create('A', { nombre: 'Y', email: sa.email, rol: 'CAJERO' } as any, admin.id, false)).rejects.toThrow('Identificador ya registrado');
    });
  });

  describe('bloqueo de usuarios que no son Admin', () => {
    it.each(['CAJERO', 'VENDEDOR', 'BODEGUERO'] as Rol[])('%s: los fallos 1 a 5 no bloquean, el sexto sí; ni siquiera la contraseña correcta entra bloqueada', async rol => {
      const a = await account(false, rol);
      for (let i = 1; i <= MAX_FALLOS_BLOQUEO; i++) {
        const error = await failure(login(a.email, 'incorrecta-' + i));
        expect(error.getStatus()).toBe(401);
        expect(error.getResponse()).not.toHaveProperty('recuperacionDisponible');
        expect((await fresh(a) as any).bloqueadoAt).toBeNull();
      }
      const sexto = await failure(login(a.email, 'incorrecta-6'));
      expect(sexto.getStatus()).toBe(403);
      expect(sexto.getResponse()).toMatchObject({ code: 'CUENTA_BLOQUEADA', message: expect.stringContaining('Admin o Super Admin') });
      const bloqueada: any = await fresh(a);
      expect(bloqueada.bloqueadoAt).toBeInstanceOf(Date);
      expect(bloqueada.intentosFallidos).toBe(6);
      const correcta = await failure(login(a.email, password));
      expect(correcta.getResponse()).toMatchObject({ code: 'CUENTA_BLOQUEADA' });
      expect((await fresh(a) as any).intentosFallidos).toBe(6);
      expect(await db.authEvent.count({ where: { sujetoId: a.id, event: 'ACCOUNT_LOCKED' } })).toBe(1);
      // Ninguna recuperación pública: la solicitud no envía nada para un empleado.
      const before = temporals.length;
      await service.request({ usuario: a.email }, nextIp().ip);
      expect(temporals.length).toBe(before);
    }, 30000);
    it('un acceso correcto reinicia la racha: cinco fallos, éxito y cinco fallos más no bloquean', async () => {
      const a = await account(false, 'CAJERO');
      for (let i = 0; i < 5; i++) await failure(login(a.email, 'mala'));
      await login(a.email);
      expect((await fresh(a) as any).intentosFallidos).toBe(0);
      for (let i = 0; i < 5; i++) await failure(login(a.email, 'mala'));
      expect((await fresh(a) as any).bloqueadoAt).toBeNull();
      await expect(login(a.email)).resolves.toMatchObject({ type: 'tenant' });
    });
    it('solicitudes concurrentes se cuentan una sola vez cada una y el bloqueo se registra una sola vez', async () => {
      const a = await account(false, 'CAJERO');
      const results = await Promise.allSettled(Array.from({ length: 12 }, () => login(a.email, 'mala')));
      const final: any = await fresh(a);
      expect(final.bloqueadoAt).toBeInstanceOf(Date);
      // Cada intento que alcanzó el incremento cuenta exactamente uno; los que llegaron con la cuenta ya bloqueada no cuentan.
      const rechazadas = results.filter(r => r.status === 'rejected') as PromiseRejectedResult[];
      expect(rechazadas).toHaveLength(12);
      expect(final.intentosFallidos).toBeGreaterThanOrEqual(MAX_FALLOS_BLOQUEO + 1);
      expect(final.intentosFallidos).toBeLessThanOrEqual(12);
      expect(await db.authEvent.count({ where: { sujetoId: a.id, event: 'ACCOUNT_LOCKED' } })).toBe(1);
      expect(rechazadas.filter(r => r.reason.getStatus() === 403).length).toBeGreaterThanOrEqual(1);
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
    it('Admin del negocio y Super Admin reactivan; un Admin no alcanza otra empresa ni a otro Admin; el cajero no gestiona', async () => {
      const admin = await account(false, 'ADMIN', 'A'), peer = await account(false, 'ADMIN', 'A'), sa = await account(true);
      const lock = async (rol: Rol, tenantId: string) => {
        const u = await account(false, rol, tenantId);
        for (let i = 0; i <= MAX_FALLOS_BLOQUEO; i++) await failure(login(u.email, 'mala'));
        expect((await fresh(u) as any).bloqueadoAt).toBeInstanceOf(Date);
        return u;
      };
      const own = await lock('CAJERO', 'A'), foreign = await lock('VENDEDOR', 'B'), cajero = await account(false, 'CAJERO', 'A');
      await expect(service.unlock(cajero.identity, { usuarioId: own.id })).rejects.toThrow();
      await expect(service.unlock(admin.identity, { usuarioId: foreign.id })).rejects.toThrow();
      await expect(service.unlock({ ...admin.identity, tenantId: 'A' }, { usuarioId: foreign.id, tenantId: 'B' })).rejects.toThrow();
      await expect(service.unlock(admin.identity, { usuarioId: peer.id })).rejects.toThrow();
      expect((await fresh(foreign) as any).bloqueadoAt).toBeInstanceOf(Date);
      await expect(service.unlock({ ...admin.identity, impersonatedBy: 'SA' }, { usuarioId: own.id })).rejects.toThrow();
      await service.unlock(admin.identity, { usuarioId: own.id });
      expect(((await login(own.email)) as any).user.id).toBe(own.id);
      // Super Admin: alcance global, cualquier empresa.
      await service.unlock(sa.identity, { usuarioId: foreign.id, tenantId: 'B' });
      expect(((await login(foreign.email)) as any).user.id).toBe(foreign.id);
      expect(await db.authEvent.count({ where: { event: 'ACCOUNT_UNLOCKED', sujetoId: { in: [own.id, foreign.id] } } })).toBe(2);
      expect((await db.authEvent.findMany({ where: { event: 'ACCOUNT_UNLOCKED', sujetoId: own.id } }))[0]).toMatchObject({ actorId: admin.id, tenantId: 'A' });
    }, 60000);
    it('el cambio de contraseña por Admin/Super Admin entrega un enlace de un uso, desbloquea al aplicarse y cierra sesiones', async () => {
      const admin = await account(false, 'ADMIN', 'A'), sa = await account(true), u = await account(false, 'CAJERO', 'A');
      const payload = await session(u);
      for (let i = 0; i <= MAX_FALLOS_BLOQUEO; i++) await failure(login(u.email, 'mala'));
      await expect(service.adminReset(admin.identity, { usuarioId: u.id, currentPassword: 'equivocada' })).rejects.toThrow();
      for (const actor of [{ identity: admin.identity, tenantId: undefined }, { identity: sa.identity, tenantId: 'A' }]) {
        const result = await service.adminReset(actor.identity, { usuarioId: u.id, tenantId: actor.tenantId, currentPassword: password });
        expect(result).not.toHaveProperty('password');
        await expect(strategy.validate(payload)).rejects.toThrow();
      }
      const link = await service.adminReset(sa.identity, { usuarioId: u.id, tenantId: 'A', currentPassword: password });
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
    it.each([true, false])('platform=%s: la opción aparece al tercer fallo, llega por correo verificado y exige contraseña nueva antes de operar', async platform => {
      const a = await account(platform), old = await session(a);
      const logs: string[] = [];
      const spies = (['log', 'warn', 'error', 'debug', 'verbose'] as const).map(level => vi.spyOn(Logger.prototype, level).mockImplementation((...args: any[]) => { logs.push(JSON.stringify(args)); }));
      try {
        const [uno, dos, tres] = [await failure(login(a.email, 'mala')), await failure(login(a.email, 'mala')), await failure(login(a.email, 'mala'))];
        expect(uno.getResponse()).not.toHaveProperty('recuperacionDisponible');
        expect(dos.getResponse()).not.toHaveProperty('recuperacionDisponible');
        expect(tres.getResponse()).toMatchObject({ message: 'Credenciales inválidas', recuperacionDisponible: true });
        const sent = temporals.length;
        expect(await service.request({ usuario: a.email }, nextIp().ip)).toMatchObject({ message: expect.any(String) });
        expect(temporals.length).toBe(sent + 1);
        const { to, password: temporal } = temporals.at(-1)!;
        expect(to).toBe(a.email);
        expect(temporal).toMatch(/^[A-Za-z0-9]{16}$/);
        // Solo el hash está guardado, con vigencia de 10 minutos.
        const stored = await db.authTempPassword.findUniqueOrThrow({ where: { sujetoId_tipo: { sujetoId: a.id, tipo: tipo(a) } } });
        expect(stored.passwordHash).not.toContain(temporal);
        expect(await bcrypt.compare(temporal, stored.passwordHash)).toBe(true);
        expect(stored.expiresAt.getTime() - Date.now()).toBeLessThanOrEqual(600000);
        expect(stored.expiresAt.getTime() - Date.now()).toBeGreaterThan(590000);
        // Ingresar con la temporal NO abre sesión ni cookie.
        const sessions = await db.sesionAuth.count({ where: { sujetoId: a.id } });
        const res = newRes(), entrada: any = await login(a.email, temporal, nextIp(), res);
        expect(entrada).toMatchObject({ type: 'password_change_required', requiereCambioPassword: true, expiresIn: 600 });
        expect(entrada).not.toHaveProperty('accessToken');
        expect(res.cookie).not.toHaveBeenCalled();
        expect(await db.sesionAuth.count({ where: { sujetoId: a.id } })).toBe(sessions);
        // Un solo uso: la misma temporal ya no sirve.
        expect((await failure(login(a.email, temporal))).getStatus()).toBe(401);
        // Contraseña nueva obligatoria, con la política de contraseñas; igual a la actual se rechaza.
        const http = request(app.getHttpServer());
        await http.post('/api/auth/security/forced-change').send({ token: entrada.cambioToken, password: 'weak' }).expect(400);
        await expect(service.forcedChange({ token: entrada.cambioToken, password })).rejects.toThrow();
        const [ok, dup] = await Promise.allSettled([service.forcedChange({ token: entrada.cambioToken, password: replacement }), service.forcedChange({ token: entrada.cambioToken, password: replacement })]);
        expect([ok, dup].filter(r => r.status === 'fulfilled')).toHaveLength(1);
        // Sesiones anteriores revocadas; contraseña anterior y temporal inválidas; la nueva funciona y reinicia contadores.
        await expect(strategy.validate(old)).rejects.toThrow();
        expect((await failure(login(a.email, password))).getStatus()).toBe(401);
        expect((await db.authTempPassword.count({ where: { sujetoId: a.id } }))).toBe(0);
        const ingreso: any = await login(a.email, replacement);
        expect(ingreso.type).toBe(platform ? 'super_admin' : 'tenant');
        expect((await fresh(a) as any).intentosFallidos).toBe(0);
        expect(await db.authEvent.count({ where: { sujetoId: a.id, event: { in: ['TEMP_PASSWORD_ISSUED', 'TEMP_PASSWORD_USED', 'PASSWORD_FORCED_CHANGE'] } } })).toBe(3);
      } finally { spies.forEach(spy => spy.mockRestore()); }
      // La temporal y la nueva contraseña nunca aparecen en logs, auditoría, acciones ni sesiones.
      const secretos = [temporals.at(-1)!.password, replacement];
      const volcado = JSON.stringify({ logs, eventos: await db.authEvent.findMany({ where: { sujetoId: a.id } }), acciones: await db.authAction.findMany({ where: { sujetoId: a.id } }), sesiones: await db.sesionAuth.findMany({ where: { sujetoId: a.id } }) });
      for (const secreto of secretos) expect(volcado).not.toContain(secreto);
    }, 90000);
    it('una temporal expirada o de otra cuenta no entra; la expiración se aplica en el servidor', async () => {
      const a = await account(), b = await account();
      const vencida = await emitirContrasenaTemporal(db as any, a, 'TENANT');
      await db.authTempPassword.update({ where: { sujetoId_tipo: { sujetoId: a.id, tipo: 'TENANT' } }, data: { expiresAt: new Date(Date.now() - 1) } });
      expect((await failure(login(a.email, vencida))).getStatus()).toBe(401);
      const ajena = await emitirContrasenaTemporal(db as any, b, 'TENANT');
      expect((await failure(login(a.email, ajena))).getStatus()).toBe(401);
      // Una temporal nueva reemplaza a la anterior: solo la última vale.
      const primera = await emitirContrasenaTemporal(db as any, a, 'TENANT'), segunda = await emitirContrasenaTemporal(db as any, a, 'TENANT');
      expect((await failure(login(a.email, primera))).getStatus()).toBe(401);
      expect(((await login(a.email, segunda)) as any).type).toBe('password_change_required');
    });
    it('la temporal usada o un token de cambio vencido no dan acceso; el token de cambio no es un access token', async () => {
      const a = await account();
      const temporal = await emitirContrasenaTemporal(db as any, a, 'TENANT');
      const entrada: any = await login(a.email, temporal);
      await expect(strategy.validate({ sub: a.id, type: 'password_change', tenantId: 'A' })).rejects.toThrow();
      await request(app.getHttpServer()).get('/api/auth/me').auth(entrada.cambioToken, { type: 'bearer' }).expect(401);
      await db.authAction.updateMany({ where: { sujetoId: a.id, purpose: 'FORCED_CHANGE' }, data: { expiresAt: new Date(Date.now() - 1) } });
      await expect(service.forcedChange({ token: entrada.cambioToken, password: replacement })).rejects.toThrow();
      expect((await fresh(a)).passwordHash).toBe(a.passwordHash);
    });
    it('con el bloqueo temporal por intentos activo, la temporal vigente aún entra; una contraseña cualquiera no', async () => {
      const a = await account();
      const ip = nextIp();
      for (let i = 0; i < 5; i++) await failure(login(a.email, 'mala', ip));
      expect((await failure(login(a.email, password, ip))).getStatus()).toBe(429);
      const temporal = await emitirContrasenaTemporal(db as any, a, 'TENANT');
      expect((await failure(login(a.email, password, nextIp()))).getStatus()).toBe(429);
      expect(((await login(a.email, temporal, nextIp())) as any).type).toBe('password_change_required');
      // Probar la temporal prueba el correo: el bloqueo por identificador se levanta y la contraseña vigente vuelve a servir.
      expect(((await login(a.email, password, nextIp())) as any).type).toBe('tenant');
    });
    it('responde igual, y no envía nada, para cuentas que no cumplen: antes del tercer fallo, sin correo verificado, empleado, inexistente o ambiguo', async () => {
      const antes = await account(), sinCorreo = await account(false, 'ADMIN', 'A', false), empleado = await account(false, 'CAJERO'), elegible = await account();
      for (const a of [sinCorreo, empleado, elegible]) for (let i = 0; i < 3; i++) await failure(login(a.email, 'mala'));
      const ambiguo = [await account(false, 'ADMIN', 'A'), await account(false, 'ADMIN', 'B')];
      const comun = `repetido-${randomUUID()}@example.invalid`;
      for (const a of ambiguo) {
        for (let i = 0; i < 3; i++) await failure(login(a.email, 'mala'));
        await db.usuario.update({ where: { id: a.id }, data: { email: comun } });
      }
      const before = temporals.length;
      const uno = await service.request({ usuario: elegible.email }, nextIp().ip);
      expect(temporals.length).toBe(before + 1);
      for (const usuario of [antes.email, sinCorreo.email, empleado.email, 'absent@example.invalid', comun]) {
        expect(await service.request({ usuario }, nextIp().ip)).toEqual(uno);
      }
      expect(temporals.length).toBe(before + 1);
    }, 90000);
    it('si el correo falla no queda una temporal vigente que nadie recibió', async () => {
      const a = await account();
      for (let i = 0; i < 3; i++) await failure(login(a.email, 'mala'));
      mail.sendTemporaryPassword.mockRejectedValueOnce(new Error('proveedor caído'));
      await service.request({ usuario: a.email }, nextIp().ip);
      expect(await db.authTempPassword.count({ where: { sujetoId: a.id } })).toBe(0);
    }, 30000);
  });

  it.each(['CAJERO', 'VENDEDOR', 'BODEGUERO'] as Rol[])('denies the legacy email recovery token to %s', async rol => {
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
  it('changes a password only with the current password (no MFA) and invalidates all sessions', async () => {
    const a = await account(false, 'VENDEDOR'), payload = await session(a);
    await expect(service.change(a.identity, { currentPassword: 'wrong', password: replacement })).rejects.toThrow();
    await service.change(a.identity, { currentPassword: password, password: replacement });
    await expect(strategy.validate(payload)).rejects.toThrow();
    // A login that raced with the reset cannot revive the old password's session.
    const raced = await session(a); await expect(strategy.validate(raced)).rejects.toThrow();
  });
  it('Super Admin cambia su contraseña solo con la actual, sin código, y cierra las sesiones de soporte que originó', async () => {
    const sa = await account(true), payload = await session(sa);
    await service.change(sa.identity, { currentPassword: password, password: replacement });
    await expect(strategy.validate(payload)).rejects.toThrow();
  });
  it('enforces idle expiration in backend, while active sessions still validate', async () => {
    const a = await account(false, 'CAJERO'), payload = await session(a);
    await expect(strategy.validate(payload)).resolves.toMatchObject({ sub: a.id });
    await db.sesionAuth.update({ where: { id: payload.sid }, data: { lastActivityAt: new Date(Date.now()-900001) } });
    await expect(strategy.validate(payload)).rejects.toThrow();
  });
  it('supports email-free users and verifies an Admin mailbox without any MFA step', async () => {
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
    // El contrato del login: dos campos. Empresa, rol y MFA ya no se aceptan (el pipe prohíbe propiedades extra).
    await http.post('/api/auth/login').send({ usuario: a.email, password, tenantId: 'A' }).expect(400);
    await http.post('/api/auth/login').send({ usuario: a.email, password, mfaCode: '123456' }).expect(400);
    await http.post('/api/auth/login').send({ password }).expect(400);
    const changed = await http.post('/api/auth/security/change-password').auth(access, { type: 'bearer' }).send({ currentPassword: password, password: replacement }).expect(201);
    expect(changed.headers['cache-control']).toContain('no-store');
    await http.get('/api/auth/me').auth(access, { type: 'bearer' }).expect(401);
    const ok = await http.post('/api/auth/login').send({ usuario: a.email, password: replacement }).expect(200);
    expect(ok.body).toMatchObject({ type: 'tenant', tenant: { id: 'A' }, user: { rol: 'CAJERO' } });
    // Respuesta HTTP de un usuario que no es Admin bloqueado: 403 con el mensaje de contacto, sin datos de la cuenta.
    for (let i = 0; i < 5; i++) await http.post('/api/auth/login').send({ usuario: a.email, password: 'mala-clave' }).expect(401);
    const bloqueo = await http.post('/api/auth/login').send({ usuario: a.email, password: 'mala-clave' }).expect(403);
    expect(bloqueo.body).toMatchObject({ code: 'CUENTA_BLOQUEADA' });
    expect(JSON.stringify(bloqueo.body)).not.toContain(a.id);
    // Admin: la respuesta 401 del tercer fallo anuncia la recuperación y la temporal viaja por la API de cambio obligatorio.
    const admin = await account(false, 'ADMIN', 'A');
    let ultimo: any;
    for (let i = 0; i < 3; i++) ultimo = await http.post('/api/auth/login').send({ usuario: admin.email, password: 'mala-clave' }).expect(401);
    expect(ultimo.body).toMatchObject({ message: 'Credenciales inválidas', recuperacionDisponible: true });
    const temporal = await emitirContrasenaTemporal(db as any, admin, 'TENANT');
    const entrada = await http.post('/api/auth/login').send({ usuario: admin.email, password: temporal }).expect(200);
    expect(entrada.body).toMatchObject({ type: 'password_change_required' });
    expect(entrada.headers['set-cookie']).toBeUndefined();
    await http.post('/api/auth/security/forced-change').send({ token: entrada.body.cambioToken, password: 'Nueva-Clave-2026' }).expect(200);
    await http.post('/api/auth/login').send({ usuario: admin.email, password: 'Nueva-Clave-2026' }).expect(200);
  }, 60000);
});
