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
import { newTotpSecret, sealSecret, tokenHash, totp, opaqueToken } from '../src/auth/mfa';
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
describe('Authentication recovery on disposable PostgreSQL', () => {
  const root = resolve(__dirname, '..');
  const bin = process.env.PG_BIN || (process.platform === 'win32' ? 'C:/Program Files/PostgreSQL/18/bin' : '/usr/bin');
  const exe = (name: string) => join(bin, name + (process.platform === 'win32' ? '.exe' : ''));
  const password = 'Synthetic-Current-456!', replacement = 'Synthetic-New-789!';
  const values: Record<string, string> = { NODE_ENV: 'test', JWT_SECRET: 'isolated-auth-test-secret-not-production-123456', AUTH_MFA_ENCRYPTION_KEY: 'cd'.repeat(32), AUTH_ACEPTAR_TOKENS_SIN_SESION: 'false' };
  const config = new ConfigService(values), jwt = new JwtService({ secret: values.JWT_SECRET });
  let directory = '', started = false, url = '', db: PrismaClient, service: RecoveryService, auth: AuthService, strategy: JwtStrategy;
  const deliveries: { to: string; token: string; purpose: string }[] = [];
  const mail = {
    send: vi.fn(async (to: string, token: string, purpose: string) => { deliveries.push({ to, token, purpose }); }),
    sendTemporaryPassword: vi.fn(async (to: string, token: string) => { deliveries.push({ to, token, purpose: 'TEMP_PASSWORD' }); }),
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
      // Estado anterior a la recuperación: sin 20261023000000_auth_recovery ni las migraciones de autenticación posteriores.
      if (!/^\d{14}_/.test(file) || file < '20261023000000') cpSync(join(root, 'prisma/migrations', file), join(previous, 'migrations', file), { recursive: true });
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
  const account = async (platform = false, rol: any = 'ADMIN', tenantId = 'A', mfa = true) => {
    const id = randomUUID(), secret = newTotpSecret(), email = `${id}@example.invalid`;
    const data = { id, nombre: id, email, passwordHash: await bcrypt.hash(password, 4), emailVerifiedAt: new Date(), ...(mfa && { mfaSecret: sealSecret(secret, id, config) }) };
    const row = platform ? await db.superAdmin.create({ data }) : await db.usuario.create({ data: { ...data, tenantId, rol, username: 'u-' + id } });
    return { ...row, secret, platform, identity: { sub: id, type: platform ? 'super_admin' : 'tenant', ...(!platform && { tenantId }) } };
  };
  const code = (a: { secret: string }) => totp(a.secret, Math.floor(Date.now()/30000));
  const action = async (a: any, purpose = 'RESET_EMAIL', expiresAt = new Date(Date.now()+600000)) => {
    const token = opaqueToken(); await db.authAction.create({ data: { hash: tokenHash(token), sujetoId: a.id, tipo: a.platform ? 'SUPER_ADMIN' : 'TENANT', tenantId: a.platform ? null : a.tenantId, email: a.email, passwordBinding: tokenHash(a.passwordHash), purpose, expiresAt } }); return token;
  };
  const session = async (a: any) => {
    const sid = randomUUID(); await crearSesion(db, { id: sid, tipo: a.platform ? 'SUPER_ADMIN' : 'TENANT', sujetoId: a.id, tenantId: a.tenantId, expiresAt: new Date(Date.now()+600000), passwordHash: a.passwordHash });
    return { sid, sub: a.id, type: a.platform ? 'super_admin' : 'tenant', tenantId: a.tenantId };
  };
  const reload = (a: any): Promise<any> => a.platform ? db.superAdmin.findUniqueOrThrow({ where: { id: a.id } }) : db.usuario.findUniqueOrThrow({ where: { id: a.id } });
  const fails = (a: any, loginFallos: number) => a.platform ? db.superAdmin.update({ where: { id: a.id }, data: { loginFallos } }) : db.usuario.update({ where: { id: a.id }, data: { loginFallos } });
  const res = () => ({ cookie: vi.fn(), setHeader: vi.fn() } as any);
  it('preserves existing Super Admin credentials through upgrade and repeated deploy; schema has no drift', async () => {
    expect((await db.superAdmin.findUniqueOrThrow({ where: { id: 'existing-SA' } })).passwordHash).toBe(oldHash);
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
  it.each([true, false])('platform=%s: tres fallos permiten una clave temporal de un uso que obliga a cambiar la contraseña y revoca sesiones', async platform => {
    // Sin MFA configurado: el Super Admin no lo requiere y el Admin tampoco depende de él para recuperar.
    const a = await account(platform, 'ADMIN', 'A', false), anterior = await session(a);
    await fails(a, 3);
    const enviadas = deliveries.length;
    await service.request({ email: a.email }, `127.0.2.${platform ? 1 : 2}`);
    expect(deliveries).toHaveLength(enviadas + 1);
    const clave = deliveries.at(-1)!;
    expect(clave).toMatchObject({ to: a.email, purpose: 'TEMP_PASSWORD' });
    // Solo se guarda el hash, con vigencia de 10 minutos.
    const guardada = await db.authAction.findFirstOrThrow({ where: { sujetoId: a.id, purpose: 'TEMP_PASSWORD' } });
    expect(guardada.hash).toBe(tokenHash(clave.token));
    expect(JSON.stringify(guardada)).not.toContain(clave.token);
    expect(guardada.expiresAt.getTime() - Date.now()).toBeGreaterThan(590000);
    expect(guardada.expiresAt.getTime() - Date.now()).toBeLessThanOrEqual(600000);
    // La solicitud no invalida la contraseña actual ni las sesiones: un tercero no puede dejar fuera al titular.
    await expect(strategy.validate(anterior)).resolves.toMatchObject({ sub: a.id });

    const entrada: any = await auth.login({ email: a.email, password: clave.token }, res());
    expect((platform ? entrada.superAdmin : entrada.user).debeCambiarPassword).toBe(true);
    await expect(strategy.validate(anterior)).rejects.toThrow();
    await expect(auth.login({ email: a.email, password: clave.token }, res())).rejects.toThrow('Credenciales inválidas');
    const nueva = await session({ ...a, passwordHash: (await reload(a)).passwordHash });
    await expect(strategy.validate(nueva)).resolves.toMatchObject({ debeCambiarPassword: true });

    await expect(service.completeRequiredChange(a.identity, password)).rejects.toThrow('distinta');
    await service.completeRequiredChange(a.identity, replacement);
    const fresh = await reload(a);
    expect(await bcrypt.compare(replacement, fresh.passwordHash)).toBe(true);
    expect(fresh).toMatchObject({ debeCambiarPassword: false, loginFallos: 0 });
    await expect(strategy.validate(nueva)).rejects.toThrow();
    expect((await auth.login({ email: a.email, password: replacement }, res())).type).toBe(platform ? 'super_admin' : 'tenant');
    expect(await db.authEvent.count({ where: { sujetoId: a.id, event: { in: ['TEMP_PASSWORD_ISSUED', 'TEMP_PASSWORD_USED', 'PASSWORD_CHANGE_REQUIRED'] } } })).toBe(3);
    expect(JSON.stringify(await db.authEvent.findMany({ where: { sujetoId: a.id } }))).not.toContain(clave.token);
  }, 35000);
  it.each(['CAJERO', 'VENDEDOR', 'BODEGUERO'])('%s no recibe clave temporal ni puede usar una aunque exista', async rol => {
    const a = await account(false, rol, 'A', false);
    await fails(a, 5);
    const enviadas = deliveries.length;
    await service.request({ email: a.email }, '127.0.3.1');
    expect(deliveries).toHaveLength(enviadas);
    const token = await action(a, 'TEMP_PASSWORD');
    await expect(auth.login({ email: a.email, password: token }, res())).rejects.toThrow('Credenciales inválidas');
    expect((await reload(a)).passwordHash).toBe(a.passwordHash);
  }, 35000);
  it('uses the same public recovery response for eligible, employee and absent accounts and sends only eligible mail', async () => {
    const admin = await account(false, 'ADMIN', 'A', false), employee = await account(false, 'CAJERO', 'A', false), pocos = await account(false, 'ADMIN', 'A', false);
    await fails(admin, 3); await fails(employee, 3); await fails(pocos, 2);
    const first = await service.request({ email: admin.email }, '127.0.1.1');
    const count = deliveries.length;
    expect(deliveries.at(-1)?.to).toBe(admin.email);
    expect(await service.request({ email: employee.email }, '127.0.1.2')).toEqual(first);
    expect(await service.request({ email: 'absent@example.invalid' }, '127.0.1.3')).toEqual(first);
    // Menos de tres fallos consecutivos: misma respuesta, sin correo.
    expect(await service.request({ email: pocos.email }, '127.0.1.4')).toEqual(first);
    expect(deliveries.length).toBe(count);
  }, 50000);
  it('denies recovery without verified email', async () => {
    const a = await account(false, 'ADMIN', 'A', false);
    await db.usuario.update({ where: { id: a.id }, data: { emailVerifiedAt: null, loginFallos: 3 } });
    const enviadas = deliveries.length;
    await service.request({ email: a.email }, '127.0.4.1');
    expect(deliveries).toHaveLength(enviadas);
    expect(await db.authAction.count({ where: { sujetoId: a.id } })).toBe(0);
  }, 35000);
  it('issues a private employee reset, revokes sessions immediately and rejects foreign tenants and non-admin actors', async () => {
    const admin = await account(false, 'ADMIN', 'A', false), employee = await account(false, 'CAJERO', 'A', false), outsider = await account(false, 'CAJERO', 'B', false);
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
  it('rejects expired, changed-email and changed-password temporary passwords', async () => {
    const a = await account(false, 'ADMIN', 'A', false);
    const expired = await action(a, 'TEMP_PASSWORD', new Date(Date.now()-1));
    await expect(auth.login({ email: a.email, password: expired }, res())).rejects.toThrow('Credenciales inválidas');
    const changedEmail = await action(a, 'TEMP_PASSWORD');
    await db.usuario.update({ where: { id: a.id }, data: { email: `changed-${a.email}` } });
    await expect(auth.login({ email: `changed-${a.email}`, password: changedEmail }, res())).rejects.toThrow('Credenciales inválidas');
    await db.usuario.update({ where: { id: a.id }, data: { email: a.email } });
    const changedPassword = await action(a, 'TEMP_PASSWORD');
    await db.usuario.update({ where: { id: a.id }, data: { passwordHash: await bcrypt.hash(replacement, 4) } });
    await expect(auth.login({ email: a.email, password: changedPassword }, res())).rejects.toThrow('Credenciales inválidas');
    expect((await reload(a)).debeCambiarPassword).toBe(false);
  });
  it('una clave temporal usada a la vez desde dos pestañas solo abre una sesión', async () => {
    const a = await account(true, 'ADMIN', 'A', false);
    const token = await action(a, 'TEMP_PASSWORD');
    const intentos = await Promise.allSettled([auth.login({ email: a.email, password: token }, res()), auth.login({ email: a.email, password: token }, res())]);
    expect(intentos.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    expect(await db.authEvent.count({ where: { sujetoId: a.id, event: 'TEMP_PASSWORD_USED' } })).toBe(1);
  });
  it('changes an employee password only with the current password and invalidates all sessions', async () => {
    const a = await account(false, 'VENDEDOR', 'A', false), payload = await session(a);
    await expect(service.change(a.identity, { currentPassword: 'wrong', password: replacement })).rejects.toThrow();
    await service.change(a.identity, { currentPassword: password, password: replacement });
    await expect(strategy.validate(payload)).rejects.toThrow();
    // A login that raced with the reset cannot revive the old password's session.
    const raced = await session(a); await expect(strategy.validate(raced)).rejects.toThrow();
  });
  it('enforces idle expiration in backend, while active sessions still validate', async () => {
    const a = await account(false, 'CAJERO', 'A', false), payload = await session(a);
    await expect(strategy.validate(payload)).resolves.toMatchObject({ sub: a.id });
    await db.sesionAuth.update({ where: { id: payload.sid }, data: { lastActivityAt: new Date(Date.now()-900001) } });
    await expect(strategy.validate(payload)).rejects.toThrow();
  });
  it('supports email-free users and duplicate identifiers across tenants, but never within one tenant', async () => {
    const a = await account(false, 'CAJERO', 'A', false), b = await account(false, 'CAJERO', 'B', false);
    await db.usuario.update({ where: { id: a.id }, data: { email: null, username: '44556' } });
    await db.usuario.update({ where: { id: b.id }, data: { email: null, username: '44556' } });
    await expect(db.usuario.create({ data: { tenantId: 'A', nombre: 'duplicate', email: null, username: '44556', passwordHash: oldHash } })).rejects.toThrow();
    const res = { cookie: vi.fn(), setHeader: vi.fn() } as any;
    const login = await auth.login({ email: '44556', tenantId: 'A', password }, res);
    expect(login.user?.id).toBe(a.id);
    await expect(auth.login({ email: '44556', password }, res)).rejects.toThrow();
    await db.usuario.update({ where: { id: a.id }, data: { username: 'danielcm' } });
    expect((await auth.login({ email: 'DanielCM', tenantId: 'A', password }, res)).user?.id).toBe(a.id);
  });
  it('Super Admin entra sin MFA aunque tenga un secreto; una cuenta de negocio con MFA acepta un código de emergencia una vez', async () => {
    const platform = await account(true);
    expect((await auth.login({ email: platform.email, password }, res())).type).toBe('super_admin');
    const admin = await account(false, 'ADMIN', 'A', true);
    await expect(auth.login({ email: admin.email, password }, res())).rejects.toMatchObject({ response: { code: 'MFA_REQUERIDO' } });
    const emergency = 'a'.repeat(32);
    await db.authRecoveryCode.create({ data: { hash: tokenHash(emergency), sujetoId: admin.id, tipo: 'TENANT' } });
    expect((await auth.login({ email: admin.email, password, mfaCode: emergency }, res())).type).toBe('tenant');
    await expect(auth.login({ email: admin.email, password, mfaCode: emergency }, res())).rejects.toThrow();
  });
  it('bootstraps platform MFA with password plus mailbox possession and never changes the password', async () => {
    const a = await account(true, 'ADMIN', 'A', false);
    const bootstrap = await action(a, 'BOOTSTRAP_MFA');
    await expect(service.bootstrapMfa(bootstrap, 'wrong')).rejects.toThrow();
    const enrollment = await service.bootstrapMfa(bootstrap, password);
    const result = await service.confirmMfa({ token: enrollment.token, secret: enrollment.secret, mfaCode: totp(enrollment.secret, Math.floor(Date.now()/30000)) });
    expect(result.recoveryCodes).toHaveLength(10);
    expect(await db.authRecoveryCode.count({ where: { sujetoId: a.id } })).toBe(10);
    expect((await db.superAdmin.findUniqueOrThrow({ where: { id: a.id } })).passwordHash).toBe(a.passwordHash);
    await expect(service.bootstrapMfa(bootstrap, password)).rejects.toThrow();
  });
  it('denies impersonated credential operations and direct administrator password assignment', async () => {
    const a = await account(false, 'ADMIN', 'A', false);
    await expect(service.change({ ...a.identity, impersonatedBy: 'SA' }, { currentPassword: password, password: replacement })).rejects.toThrow();
    await expect(new UsuariosService(db as any).update('A', a.id, { password: replacement }, a.id)).rejects.toThrow('enlace privado');
  });
  it('enforces real HTTP validation, origin checks, identity, authorization and password change through NestJS', async () => {
    const a = await account(false, 'CAJERO', 'A', false), payload = await session(a);
    const access = jwt.sign(payload);
    const http = request(app.getHttpServer());
    await http.post('/api/auth/security/change-password').send({ currentPassword: password, password: replacement }).expect(401);
    await http.post('/api/auth/security/change-password').set('Origin', 'https://attacker.invalid').auth(access, { type: 'bearer' }).send({ currentPassword: password, password: replacement }).expect(403);
    await http.post('/api/auth/security/reset').send({ token: 'synthetic', password: 'weak' }).expect(400);
    await http.post('/api/auth/security/admin-reset').auth(access, { type: 'bearer' }).send({ usuarioId: a.id, currentPassword: password }).expect(403);
    const changed = await http.post('/api/auth/security/change-password').auth(access, { type: 'bearer' }).send({ currentPassword: password, password: replacement }).expect(201);
    expect(changed.headers['cache-control']).toContain('no-store');
    await http.get('/api/auth/me').auth(access, { type: 'bearer' }).expect(401);
    await http.post('/api/auth/login').send({ tenantId: 'A', email: a.email, password: replacement }).expect(200);
  });
  it('verifies an Admin mailbox before enrollment, then stores encrypted MFA and only hashed recovery codes', async () => {
    const a = await account(false, 'ADMIN', 'A', false);
    await db.usuario.update({ where: { id: a.id }, data: { emailVerifiedAt: null } });
    await expect(service.enroll(a.identity, password)).rejects.toThrow();
    await service.requestVerification(a.identity);
    const token = deliveries.at(-1)!.token;
    await service.verifyEmail(token); await expect(service.verifyEmail(token)).rejects.toThrow();
    const enrollment = await service.enroll(a.identity, password);
    const confirmed = await service.confirmMfa({ token: enrollment.token, secret: enrollment.secret, mfaCode: totp(enrollment.secret, Math.floor(Date.now()/30000)) });
    const fresh = await db.usuario.findUniqueOrThrow({ where: { id: a.id } });
    expect(fresh.mfaSecret).not.toContain(enrollment.secret);
    const stored = await db.authRecoveryCode.findMany({ where: { sujetoId: a.id } });
    expect(stored).toHaveLength(10);
    expect(stored.map(r => r.hash)).toEqual(expect.arrayContaining(confirmed.recoveryCodes.map(tokenHash)));
  });
  it('HTTP: identificador sin empresa, bloqueo al sexto fallo de un empleado y reactivación por su Admin', async () => {
    const http = request(app.getHttpServer());
    const admin = await account(false, 'ADMIN', 'A', false), cajero = await account(false, 'CAJERO', 'A', false), ajeno = await account(false, 'ADMIN', 'B', false);
    const anterior = await session(cajero);
    // Cinco fallos previos (el límite temporal por cuenta pausa 15 minutos tras el quinto); el sexto bloquea.
    await fails(cajero, 5);
    await http.post('/api/auth/login').send({ email: cajero.username, password: 'Incorrecta-2026' }).expect(401);
    expect((await reload(cajero)).bloqueadoAt).toBeInstanceOf(Date);
    await expect(strategy.validate(anterior)).rejects.toThrow();
    const bloqueada = await http.post('/api/auth/login').send({ email: cajero.username, password }).expect(401);
    expect(bloqueada.body.code).toBe('CUENTA_BLOQUEADA');
    expect(bloqueada.headers['set-cookie']).toBeUndefined();
    expect(await db.authEvent.count({ where: { sujetoId: cajero.id, event: 'ACCOUNT_LOCKED' } })).toBe(1);

    const usuarios = new UsuariosService(db as any);
    await expect(usuarios.desbloquear('B', cajero.id, ajeno.id)).rejects.toThrow();
    await expect(usuarios.desbloquear('A', admin.id, admin.id)).rejects.toThrow();
    await usuarios.desbloquear('A', cajero.id, admin.id);
    expect(await reload(cajero)).toMatchObject({ bloqueadoAt: null, loginFallos: 0, activo: true });
    expect(await db.authEvent.count({ where: { sujetoId: cajero.id, event: 'ACCOUNT_UNLOCKED', actorId: admin.id } })).toBe(1);
    const entrada = await http.post('/api/auth/login').send({ email: cajero.username.toUpperCase(), password }).expect(200);
    expect(entrada.body).toMatchObject({ type: 'tenant', tenant: { id: 'A' }, user: { id: cajero.id, rol: 'CAJERO', debeCambiarPassword: false } });
  });
  it('HTTP: el Super Admin asigna una contraseña en otra empresa; el usuario solo puede cambiarla antes de operar', async () => {
    const http = request(app.getHttpServer());
    const plataforma = await account(true, 'ADMIN', 'A', false), vendedor = await account(false, 'VENDEDOR', 'B', false);
    const usuarios = new UsuariosService(db as any);
    await expect(usuarios.asignarPassword('B', vendedor.id, { password: replacement, currentPassword: 'incorrecta' }, plataforma.id)).rejects.toThrow('Confirme');
    await usuarios.asignarPassword('B', vendedor.id, { password: replacement, currentPassword: password }, plataforma.id);
    const auditoria = await db.$queryRaw<{ datos: unknown }[]>`SELECT datos FROM auditoria_operaciones WHERE entidad_id = ${vendedor.id} AND operacion = 'USUARIO_CAMBIO_PASSWORD'`;
    expect(auditoria).toHaveLength(1);
    expect(JSON.stringify(auditoria)).not.toContain(replacement);
    expect(await db.authEvent.count({ where: { sujetoId: vendedor.id, event: 'PASSWORD_SET_BY_SUPER_ADMIN', actorId: plataforma.id } })).toBe(1);

    const entrada = await http.post('/api/auth/login').send({ email: vendedor.email, password: replacement }).expect(200);
    expect(entrada.body.user.debeCambiarPassword).toBe(true);
    const access = entrada.body.accessToken;
    await http.get('/api/auth/me').auth(access, { type: 'bearer' }).expect(200);
    const bloqueado = await http.post('/api/auth/security/change-password').auth(access, { type: 'bearer' }).send({ currentPassword: replacement, password: 'Otra-Clave-2026' }).expect(403);
    expect(bloqueado.body.code).toBe('CAMBIO_PASSWORD_OBLIGATORIO');
    await http.post('/api/auth/security/required-change').auth(access, { type: 'bearer' }).send({ password: 'weak' }).expect(400);
    await http.post('/api/auth/security/required-change').auth(access, { type: 'bearer' }).send({ password: 'Propia-Clave-2026' }).expect(201);
    await http.get('/api/auth/me').auth(access, { type: 'bearer' }).expect(401);
    const final = await http.post('/api/auth/login').send({ email: vendedor.email, password: 'Propia-Clave-2026' }).expect(200);
    expect(final.body.user.debeCambiarPassword).toBe(false);
  });
});
