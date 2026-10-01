import { ForbiddenException } from '@nestjs/common';
import { TenantModuleGuard } from './tenant-module.guard';

describe('TenantModuleGuard', () => {
  const requiredModule = 'pos';
  let reflector: any;
  let prisma: any;
  let guard: TenantModuleGuard;

  const createContext = (user: unknown, headers: Record<string, string>) => ({
    getHandler: vi.fn(),
    getClass: vi.fn(),
    switchToHttp: () => ({ getRequest: () => ({ user, headers }) }),
  }) as any;

  beforeEach(() => {
    reflector = { getAllAndOverride: vi.fn().mockReturnValue(requiredModule) };
    prisma = { tenantModule: { findUnique: vi.fn().mockResolvedValue({ enabled: true }) } };
    guard = new TenantModuleGuard(reflector, prisma);
  });

  it('uses the authenticated tenant claim even when a different tenant header is sent', async () => {
    await expect(
      guard.canActivate(createContext({ type: 'tenant', tenantId: 'tenant-A' }, { 'x-tenant-id': 'tenant-B' })),
    ).resolves.toBe(true);

    expect(prisma.tenantModule.findUnique).toHaveBeenCalledWith({
      where: { tenantId_moduleKey: { tenantId: 'tenant-A', moduleKey: requiredModule } },
    });
  });

  it('does not accept the tenant header when the authenticated claim is absent', async () => {
    await expect(
      guard.canActivate(createContext({ type: 'tenant' }, { 'x-tenant-id': 'tenant-B' })),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(prisma.tenantModule.findUnique).not.toHaveBeenCalled();
  });
});