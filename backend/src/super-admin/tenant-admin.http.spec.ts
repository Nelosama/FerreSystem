import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { SuperAdminController } from './super-admin.controller';
import { SuperAdminService } from './super-admin.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';

describe('API de administradores de empresa', () => {
  let app: INestApplication;
  const service = { createTenantAdmin: vi.fn().mockResolvedValue({ id: 'admin-A' }), updateTenantAdmin: vi.fn().mockResolvedValue({ id: 'admin-A' }) };
  beforeAll(async () => {
    const module = await Test.createTestingModule({ controllers: [SuperAdminController], providers: [{ provide: SuperAdminService, useValue: service }] })
      .overrideGuard(JwtAuthGuard).useValue({ canActivate(context: any) {
        const req = context.switchToHttp().getRequest();
        const role = req.headers['x-test-role'];
        req.user = role === 'SUPERADMIN' ? { type: 'super_admin', rol: 'SUPER_ADMIN' } : { type: 'tenant', rol: role, tenantId: 'A' };
        return true;
      } }).compile();
    app = module.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });
  afterAll(async () => { await app?.close(); });
  beforeEach(() => { vi.clearAllMocks(); });
  it.each(['ADMIN', 'CAJERO', 'VENDEDOR', 'BODEGUERO'])('rechaza token tenant %s para crear o editar administradores de plataforma', async role => {
    await request(app.getHttpServer()).post('/admin/tenants/A/admins').set('x-test-role', role).send({}).expect(403);
    await request(app.getHttpServer()).patch('/admin/tenants/A/admins/admin-A').set('x-test-role', role).send({}).expect(403);
    expect(service.createTenantAdmin).not.toHaveBeenCalled(); expect(service.updateTenantAdmin).not.toHaveBeenCalled();
  });
  it('acepta Super Admin y descarta cambios de empresa o rol del body', async () => {
    await request(app.getHttpServer()).post('/admin/tenants/A/admins').set('x-test-role', 'SUPERADMIN').send({ nombre: 'Admin', email: 'admin@example.test', password: 'SecurePassword123', tenantId: 'B', rol: 'SUPER_ADMIN' }).expect(201);
    expect(service.createTenantAdmin).toHaveBeenCalledWith('A', expect.objectContaining({ nombre: 'Admin' }));
    const body = service.createTenantAdmin.mock.calls[0][1]; expect(body.tenantId).toBeUndefined(); expect(body.rol).toBeUndefined();
  });
  it('rechaza contraseña corta antes de llamar al servicio', async () => {
    await request(app.getHttpServer()).patch('/admin/tenants/A/admins/admin-A').set('x-test-role', 'SUPERADMIN').send({ password: 'short' }).expect(400);
    expect(service.updateTenantAdmin).not.toHaveBeenCalled();
  });
});
