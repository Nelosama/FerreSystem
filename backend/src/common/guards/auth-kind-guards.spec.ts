import { ForbiddenException } from '@nestjs/common';
import { SuperAdminGuard } from './super-admin.guard';
import { TenantGuard } from './tenant.guard';

describe('Authentication type guards', () => {
  const contextFor = (user: unknown) => ({
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  }) as any;

  it('allows a Super Admin token only through SuperAdminGuard', () => {
    const context = contextFor({ type: 'super_admin', rol: 'SUPER_ADMIN' });

    expect(new SuperAdminGuard().canActivate(context)).toBe(true);
    expect(() => new TenantGuard().canActivate(context)).toThrow(ForbiddenException);
  });

  it('allows a tenant token only through TenantGuard', () => {
    const context = contextFor({ type: 'tenant', rol: 'ADMIN', tenantId: 'tenant-A' });

    expect(new TenantGuard().canActivate(context)).toBe(true);
    expect(() => new SuperAdminGuard().canActivate(context)).toThrow(ForbiddenException);
  });

  it('enforces read-only support on the server and permits explicitly enabled edits', () => {
    const context = (readOnly: boolean, method: string) => ({ switchToHttp: () => ({ getRequest: () => ({
      method, user: { type: 'tenant', tenantId: 't1', impersonatedBy: 'sa1', readOnly },
    }) }) }) as any;
    expect(new TenantGuard().canActivate(context(true, 'GET'))).toBe(true);
    expect(() => new TenantGuard().canActivate(context(true, 'POST'))).toThrow(ForbiddenException);
    expect(new TenantGuard().canActivate(context(false, 'POST'))).toBe(true);
  });
});
