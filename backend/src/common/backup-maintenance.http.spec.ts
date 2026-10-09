import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { BackupStatusController } from './backup-status.controller';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { workerStatus } from './backup-worker-status';

describe('FS-41 maintenance authorization', () => {
  let app: INestApplication;
  let directory: string;
  beforeAll(async () => {
    directory = await mkdtemp(join(tmpdir(), 'fs41-http-'));
    vi.stubEnv('FERRE_BACKUP_STATUS_FILE', join(directory, 'latest-status.json'));
    await writeFile(join(directory, 'latest-status.json'), JSON.stringify({ version: 2, lastAttempt: new Date().toISOString(), success: false, errorCode: 'UPLOAD', history: [] }));
    const module = await Test.createTestingModule({ controllers: [BackupStatusController] })
      .overrideGuard(JwtAuthGuard).useValue({ canActivate(context) {
        const req = context.switchToHttp().getRequest();
        req.user = { rol: req.headers['x-role'], type: req.headers['x-type'], tenantId: req.headers['x-tenant'] };
        return !!req.user.rol;
      } }).compile();
    app = module.createNestApplication(); await app.init();
  });
  afterAll(async () => { await app?.close(); vi.unstubAllEnvs(); await rm(directory, { recursive: true, force: true }); });
  it.each(['ADMIN', 'CAJERO', 'VENDEDOR', 'BODEGUERO'])('denies %s for both routes and tenants', async role => {
    for (const path of ['/maintenance/backup', '/admin/maintenance/backup']) for (const tenant of ['a', 'b']) {
      await request(app.getHttpServer()).get(path).set('x-role', role).set('x-type', 'tenant').set('x-tenant', tenant).expect(403);
    }
  });
  it('requires both signed super admin role and token type; supports canonical admin route', async () => {
    await request(app.getHttpServer()).get('/admin/maintenance/backup').set('x-role', 'SUPER_ADMIN').set('x-type', 'tenant').expect(403);
    const response = await request(app.getHttpServer()).get('/admin/maintenance/backup').set('x-role', 'SUPER_ADMIN').set('x-type', 'super_admin').expect(200);
    expect(response.body).toMatchObject({ success: false, errorCode: 'UPLOAD' });
  });
  it('does not treat boolean-only or stale evidence as healthy; redacts history', () => {
    const value = { version: 2, lastAttempt: new Date(Date.now() - 7 * 86400000).toISOString(), success: true, restoreTested: true, private: 'secret' };
    const result = workerStatus({ ...value, history: [value] });
    expect(result).toMatchObject({ success: false, stale: true });
    expect(JSON.stringify(result)).not.toContain('secret');
    expect(workerStatus({ ...value, encrypted: true, destinationVerified: true, verifiedAt: new Date().toISOString(), snapshot: 'a'.repeat(64), sha256: 'b'.repeat(64) })).toMatchObject({ success: true, stale: true });
  });
});
