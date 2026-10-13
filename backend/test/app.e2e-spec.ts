import { Test } from '@nestjs/testing';
import { type INestApplication } from '@nestjs/common';
import request from 'supertest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createServer } from 'node:net';
import { randomBytes } from 'node:crypto';
import { AppModule } from '../src/app.module';

// Replaces Nest's obsolete Hello World scaffold. Starts the complete application
// on its own migrated PostgreSQL cluster and verifies outage/recovery via HTTP.
// No .env connection is used: URLs and signing keys are overridden before init.
describe('Disponibilidad y recuperación de la aplicación real', () => {
  const bin = process.env.PG_BIN || '/usr/lib/postgresql/16/bin';
  const backend = resolve(__dirname, '..');
  const keys = ['DATABASE_URL', 'DIRECT_URL', 'JWT_SECRET', 'CONTINGENCIA_CLAVE_OPERACIONES', 'CONTINGENCIA_CLAVE_ANTERIOR', 'CONTINGENCIA_TRANSICION_HASTA'];
  const previous = new Map(keys.map(key => [key, process.env[key]]));
  let app: INestApplication | undefined;
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
    } finally { start(); }
  }, 15000);

  it('recupera readiness tras reiniciar PostgreSQL sin reiniciar la aplicación', async () => {
    await request(app!.getHttpServer()).get('/api/health').expect(200).expect({ status: 'ok' });
  });
});
