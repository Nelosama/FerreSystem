import { Controller, Get, INestApplication, UseGuards } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import request from 'supertest';
import { JwtStrategy } from '../../auth/jwt.strategy';
import { PrismaService } from '../../prisma/prisma.service';
import { RequiredModule } from '../decorators/required-module.decorator';
import { JwtAuthGuard } from './jwt-auth.guard';
import { TenantGuard } from './tenant.guard';
import { TenantModuleGuard } from './tenant-module.guard';

@Controller('guard-test')
class GuardTestController {
  @Get()
  @RequiredModule('pos')
  @UseGuards(JwtAuthGuard, TenantGuard)
  get() { return { ok: true }; }
}

describe('Guard de módulos / HTTP real', () => {
  let app: INestApplication;
  const findUnique = vi.fn();

  afterEach(async () => { await app?.close(); });

  it('autentica sin x-tenant-id, rechaza anónimos y aplica módulos deshabilitados', async () => {
    findUnique.mockResolvedValue({ enabled: true });
    const module = await Test.createTestingModule({
      imports: [PassportModule.register({ defaultStrategy: 'jwt' }), JwtModule.register({ secret: 'test-only-secret' })],
      controllers: [GuardTestController],
      providers: [
        JwtStrategy,
        { provide: ConfigService, useValue: { get: (key: string) => key === 'JWT_SECRET' ? 'test-only-secret' : undefined } },
        { provide: PrismaService, useValue: { tenantModule: { findUnique } } },
        { provide: APP_GUARD, useClass: TenantModuleGuard },
      ],
    }).compile();
    app = module.createNestApplication();
    await app.init();
    const token = module.get(JwtService).sign({ sub: 'user-1', type: 'tenant', tenantId: 'tenant-1', rol: 'CAJERO' });
    await request(app.getHttpServer()).get('/guard-test').set('Authorization', `Bearer ${token}`).expect(200);
    expect(findUnique).toHaveBeenCalledWith({ where: { tenantId_moduleKey: { tenantId: 'tenant-1', moduleKey: 'pos' } } });
    await request(app.getHttpServer()).get('/guard-test').expect(401);
    findUnique.mockResolvedValue({ enabled: false });
    await request(app.getHttpServer()).get('/guard-test').set('Authorization', `Bearer ${token}`).expect(403);
  });
});
