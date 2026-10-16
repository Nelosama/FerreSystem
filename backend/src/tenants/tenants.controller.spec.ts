import { Test, TestingModule } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { TenantsController } from './tenants.controller';
import { TenantsService } from './tenants.service';
import { TenantLogoService } from './tenant-logo.service';
import { ROLES_KEY } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';

describe('TenantsController Security', () => {
  let controller: TenantsController;
  let reflector: Reflector;

  const mockTenantsService = {
    getTenantSettings: vi.fn(),
    updateTenantBranding: vi.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [TenantsController],
      providers: [
        Reflector,
        {
          provide: TenantsService,
          useValue: mockTenantsService,
        },
        { provide: TenantLogoService, useValue: { leer: vi.fn() } },
      ],
    }).compile();

    controller = module.get<TenantsController>(TenantsController);
    reflector = module.get<Reflector>(Reflector);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should have RolesGuard applied at controller level', () => {
    const guards = Reflect.getMetadata('__guards__', TenantsController);
    expect(guards).toBeDefined();
    expect(guards).toContain(RolesGuard);
  });

  it('should require SUPERADMIN role for updateSettings endpoint', () => {
    const roles = reflector.get<string[]>(ROLES_KEY, controller.updateSettings);
    expect(roles).toEqual(['SUPERADMIN']);
  });
});
