import { Test } from '@nestjs/testing';
import { type INestApplication } from '@nestjs/common';
import request from 'supertest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createServer } from 'node:net';
import { randomBytes, randomUUID } from 'node:crypto';
import * as bcrypt from 'bcrypt';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

// Replaces Nest's obsolete Hello World scaffold. Starts the complete application
// on its own migrated PostgreSQL cluster and verifies outage/recovery via HTTP.
// No .env connection is used: URLs and signing keys are overridden before init.
describe('Disponibilidad y recuperación de la aplicación real', () => {
  const bin = process.env.PG_BIN || '/usr/lib/postgresql/16/bin';
  const backend = resolve(__dirname, '..');
  const keys = ['DATABASE_URL', 'DIRECT_URL', 'JWT_SECRET', 'CONTINGENCIA_CLAVE_OPERACIONES', 'CONTINGENCIA_CLAVE_ANTERIOR', 'CONTINGENCIA_TRANSICION_HASTA'];
  const previous = new Map(keys.map(key => [key, process.env[key]]));
  let app: INestApplication | undefined;
  let prisma: PrismaService, token: string, supportToken: string, superToken: string;
  const tenantId = randomUUID(), otherTenantId = randomUUID();
  const userId = randomUUID(), otherUserId = randomUUID();
  const password = `Recovery-${randomBytes(16).toString('hex')}!`;
  let directory = '', port = 0, started = false;
  const pg = (name: string, args: string[]) => execFileSync(join(bin, name), args, { stdio: 'pipe', timeout: 60000 });
  const start = () => {
    pg('pg_ctl', ['-D', join(directory, 'data'), '-l', join(directory, 'postgres.log'), '-o', `-h 127.0.0.1 -p ${port} -k ${directory}`, '-w', 'start']);
    started = true;
  };
  const stop = () => { pg('pg_ctl', ['-D', join(directory, 'data'), '-m', 'fast', '-w', 'stop']); started = false; };

  beforeAll(async () => {
    directory = mkdtempSync(join(tmpdir(), 'ferre-health-recovery-'));
    const listener = createServer();
    await new Promise<void>((done, fail) => { listener.once('error', fail); listener.listen(0, '127.0.0.1', done); });
    port = (listener.address() as { port: number }).port;
    await new Promise<void>(done => listener.close(() => done()));
    pg('initdb', ['-D', join(directory, 'data'), '-U', 'postgres', '-A', 'trust', '--locale=C', '-E', 'UTF8']);
    start();
    const url = `postgresql://postgres@127.0.0.1:${port}/postgres?connect_timeout=2`;
    Object.assign(process.env, { DATABASE_URL: url, DIRECT_URL: url, JWT_SECRET: randomBytes(32).toString('hex'), CONTINGENCIA_CLAVE_OPERACIONES: randomBytes(32).toString('hex') });
    delete process.env.CONTINGENCIA_CLAVE_ANTERIOR;
    delete process.env.CONTINGENCIA_TRANSICION_HASTA;
    execFileSync(process.execPath, ['node_modules/prisma/build/index.js', 'migrate', 'deploy'], { cwd: backend, env: process.env, stdio: 'pipe', timeout: 120000 });
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
    prisma = app.get(PrismaService);
    const passwordHash = await bcrypt.hash(password, 4);
    await prisma.tenant.createMany({ data: [
      { id: tenantId, nombreComercial: 'Recuperación A' },
      { id: otherTenantId, nombreComercial: 'Recuperación B' },
    ] });
    await prisma.usuario.createMany({ data: [
      { id: userId, tenantId, nombre: 'Administrador A', email: 'admin.a@recovery.invalid', passwordHash, rol: 'ADMIN' },
      { id: otherUserId, tenantId: otherTenantId, nombre: 'Administrador B', email: 'admin.b@recovery.invalid', passwordHash, rol: 'ADMIN' },
    ] });
    const login = await request(app.getHttpServer()).post('/api/auth/login')
      .send({ tenantId, email: 'admin.a@recovery.invalid', password }).expect(200);
    token = login.body.accessToken;
    expect(token).toEqual(expect.any(String));
    await request(app.getHttpServer()).get('/api/usuarios').auth(token, { type: 'bearer' }).expect(200);
    await prisma.superAdmin.create({ data: {
      nombre: 'Soporte de recuperación', email: 'support@recovery.invalid', passwordHash,
    } });
    const superLogin = await request(app.getHttpServer()).post('/api/admin/auth/login')
      .send({ email: 'support@recovery.invalid', password }).expect(200);
    superToken = superLogin.body.accessToken;
    const eligible = await request(app.getHttpServer()).get(`/api/admin/tenants/${tenantId}/usuarios`)
      .auth(superToken, { type: 'bearer' }).expect(200);
    expect(eligible.body.usuarios).toEqual([
      { id: userId, nombre: 'Administrador A', email: 'admin.a@recovery.invalid', rol: 'ADMIN' },
    ]);
    const support = await request(app.getHttpServer()).post('/api/admin/support/token')
      .auth(superToken, { type: 'bearer' })
      .send({ tenantId, usuarioId: userId, readOnly: true, motivo: 'Verificar recuperación aislada' }).expect(201);
    supportToken = support.body.accessToken;
    await request(app.getHttpServer()).get('/api/usuarios').auth(supportToken, { type: 'bearer' }).expect(200);
  }, 180000);

  afterAll(async () => {
    try { await app?.close(); }
    finally {
      if (started) stop();
      if (directory) rmSync(directory, { recursive: true, force: true });
      for (const [key, value] of previous) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
    }
  });

  it('readiness responde 200 con PostgreSQL conectado y las rutas privadas exigen sesión', async () => {
    await request(app!.getHttpServer()).get('/api/health').expect(200).expect({ status: 'ok' });
    await request(app!.getHttpServer()).get('/api/auth/me').expect(401);
    await request(app!.getHttpServer()).get('/api/usuarios').expect(401);
  });

  it('durante una caída real de PostgreSQL responde 503 sin revelar la conexión', async () => {
    stop();
    try {
      const response = await request(app!.getHttpServer()).get('/api/health').expect(503);
      expect(response.body.message).toBe('Servicio temporalmente no disponible');
      expect(JSON.stringify(response.body)).not.toMatch(/postgresql:|127\.0\.0\.1|password|Prisma/);
      const privateResponse = await request(app!.getHttpServer()).get('/api/auth/me')
        .auth(token, { type: 'bearer' }).expect(503);
      expect(privateResponse.body.message).toBe('Servicio temporalmente no disponible');
      expect(JSON.stringify(privateResponse.body)).not.toMatch(/postgresql:|127\.0\.0\.1|password|Prisma/);
    } finally { start(); }
  }, 15000);

  it('recupera readiness tras reiniciar PostgreSQL sin reiniciar la aplicación', async () => {
    // Stale pooled connections may fail on the first read after restart.
    // Require bounded recovery with the same process/client, without reconnect hooks.
    await vi.waitFor(async () => {
      await request(app!.getHttpServer()).get('/api/health').expect(200).expect({ status: 'ok' });
    }, { timeout: 5000, interval: 100 });
  });

  it('la sesión anterior a la caída recupera lecturas sin cruzar empresas', async () => {
    await vi.waitFor(async () => {
      const me = await request(app!.getHttpServer()).get('/api/auth/me').auth(token, { type: 'bearer' }).expect(200);
      expect(me.body.user.sub).toBe(userId);
    }, { timeout: 5000, interval: 100 });
    const users = await request(app!.getHttpServer()).get('/api/usuarios')
      .auth(token, { type: 'bearer' }).set('x-tenant-id', otherTenantId).expect(200);
    expect(users.body.map((user: { id: string }) => user.id)).toEqual([userId]);
    await request(app!.getHttpServer()).get(`/api/usuarios/${otherUserId}`)
      .auth(token, { type: 'bearer' }).expect(404);
  });

  it('recupera escrituras auditadas y la desactivación sigue revocando sesiones', async () => {
    const created = await request(app!.getHttpServer()).post('/api/usuarios').auth(token, { type: 'bearer' })
      .send({ nombre: 'Cajero recuperado', email: 'cajero@recovery.invalid', password, rol: 'CAJERO' }).expect(201);
    const login = await request(app!.getHttpServer()).post('/api/auth/login')
      .send({ tenantId, email: 'cajero@recovery.invalid', password }).expect(200);
    await request(app!.getHttpServer()).get('/api/auth/me').auth(login.body.accessToken, { type: 'bearer' }).expect(200);
    await request(app!.getHttpServer()).get('/api/usuarios').auth(login.body.accessToken, { type: 'bearer' }).expect(403);
    await request(app!.getHttpServer()).delete(`/api/usuarios/${created.body.id}`).auth(token, { type: 'bearer' }).expect(200);
    expect(await prisma.usuario.findUniqueOrThrow({ where: { id: created.body.id } })).toMatchObject({ tenantId, activo: false });
    expect(await prisma.auditoriaOperacion.count({ where: {
      tenantId, usuarioId: userId, entidadId: created.body.id, operacion: 'USUARIO_DESACTIVAR',
    } })).toBe(1);
    await request(app!.getHttpServer()).get('/api/auth/me').auth(login.body.accessToken, { type: 'bearer' }).expect(401);
  });

  it('el soporte anterior a la caída conserva solo lectura y puede revocarse con trazabilidad real', async () => {
    await request(app!.getHttpServer()).get('/api/usuarios').auth(supportToken, { type: 'bearer' }).expect(200);
    await request(app!.getHttpServer()).get(`/api/usuarios/${otherUserId}`)
      .auth(supportToken, { type: 'bearer' }).expect(404);
    await request(app!.getHttpServer()).post('/api/usuarios').auth(supportToken, { type: 'bearer' })
      .send({ nombre: 'Escritura prohibida', email: 'blocked@recovery.invalid', password, rol: 'CAJERO' }).expect(403);
    expect(await prisma.usuario.count({ where: { email: 'blocked@recovery.invalid' } })).toBe(0);
    await request(app!.getHttpServer()).post('/api/admin/support/finalizar')
      .auth(supportToken, { type: 'bearer' }).expect(200);
    const session = await prisma.sesionAuth.findFirstOrThrow({ where: { tenantId, sujetoId: userId, tipo: 'SOPORTE' } });
    expect(session.revokedAt).toBeInstanceOf(Date);
    expect(session.revocationMotivo).toBe('SOPORTE_FINALIZADO');
    await request(app!.getHttpServer()).get('/api/usuarios').auth(supportToken, { type: 'bearer' }).expect(401);
    await request(app!.getHttpServer()).post('/api/admin/support/finalizar')
      .auth(supportToken, { type: 'bearer' }).expect(401);
    const traces = await request(app!.getHttpServer()).get('/api/admin/soporte/trazas')
      .query({ tenantId }).auth(superToken, { type: 'bearer' }).expect(200);
    const supportAudit = await prisma.auditoriaOperacion.findMany({ where: { tenantId, operacion: 'SOPORTE_FINALIZAR' } });
    expect(supportAudit).toHaveLength(1);
    expect(JSON.stringify(traces.body)).toContain(supportAudit[0].id);
    await request(app!.getHttpServer()).get('/api/auth/me').auth(token, { type: 'bearer' }).expect(200);
  });
});
