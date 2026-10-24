import { Reflector } from '@nestjs/core';
import { ExecutionContext } from '@nestjs/common';
import { TenantModuleGuard } from './tenant-module.guard';
import { JwtAuthGuard } from './jwt-auth.guard';
import { PrismaService } from '../../prisma/prisma.service';

describe('TenantModuleGuard', () => {
  afterEach(() => vi.restoreAllMocks());

  it('autentica antes de consultar módulos cuando se ejecuta como guard global', async () => {
    const request: any = { headers: { 'x-tenant-id': 'tenant-ajeno' } };
    const context = { switchToHttp: () => ({ getRequest: () => request }), getHandler: () => null, getClass: () => null } as unknown as ExecutionContext;
    const auth = vi.spyOn(JwtAuthGuard.prototype, 'canActivate').mockImplementation(async () => {
      request.user = { tenantId: 'tenant-autenticado', type: 'tenant' };
      return true;
    });
    const findUnique = vi.fn().mockResolvedValue({ enabled: true });
    const guard = new TenantModuleGuard({ getAllAndOverride: () => 'pos' } as unknown as Reflector, { tenantModule: { findUnique } } as unknown as PrismaService);
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(auth).toHaveBeenCalledOnce();
    expect(findUnique).toHaveBeenCalledWith({ where: { tenantId_moduleKey: { tenantId: 'tenant-autenticado', moduleKey: 'pos' } } });
  });

  it('mantiene rutas públicas sin consultar JWT y rechaza módulos deshabilitados', async () => {
    const request = { user: { tenantId: 'tenant-1', type: 'tenant' } };
    const context = { switchToHttp: () => ({ getRequest: () => request }), getHandler: () => null, getClass: () => null } as unknown as ExecutionContext;
    const auth = vi.spyOn(JwtAuthGuard.prototype, 'canActivate');
    const reflector = { getAllAndOverride: vi.fn().mockReturnValue(undefined) };
    const findUnique = vi.fn().mockResolvedValue({ enabled: false });
    const guard = new TenantModuleGuard(reflector as unknown as Reflector, { tenantModule: { findUnique } } as unknown as PrismaService);
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(auth).not.toHaveBeenCalled();
    reflector.getAllAndOverride.mockReturnValue('pos');
    await expect(guard.canActivate(context)).rejects.toThrow('no está habilitado');
  });

  describe('módulo de activación explícita (contabilidad)', () => {
    const contexto = (request: any) => ({ switchToHttp: () => ({ getRequest: () => request }), getHandler: () => null, getClass: () => null }) as unknown as ExecutionContext;
    const guardia = (findUnique: any, modulo = 'contabilidad') => new TenantModuleGuard({ getAllAndOverride: () => modulo } as unknown as Reflector, { tenantModule: { findUnique } } as unknown as PrismaService);
    const request = () => ({ user: { tenantId: 'tenant-1', type: 'tenant', rol: 'ADMIN' } });

    it('rechaza cuando no existe ningún registro del módulo', async () => {
      await expect(guardia(vi.fn().mockResolvedValue(null)).canActivate(contexto(request()))).rejects.toThrow('no está habilitado');
    });
    it('rechaza cuando el registro existe pero está deshabilitado', async () => {
      await expect(guardia(vi.fn().mockResolvedValue({ enabled: false })).canActivate(contexto(request()))).rejects.toThrow('no está habilitado');
    });
    it('permite solo con registro explícito habilitado', async () => {
      await expect(guardia(vi.fn().mockResolvedValue({ enabled: true })).canActivate(contexto(request()))).resolves.toBe(true);
    });
    it('un módulo heredado sigue permitido sin registro', async () => {
      await expect(guardia(vi.fn().mockResolvedValue(null), 'pos').canActivate(contexto(request()))).resolves.toBe(true);
    });
    it('el Super Admin conserva el acceso sin consultar módulos', async () => {
      const findUnique = vi.fn();
      const superAdmin = { user: { type: 'super_admin', rol: 'SUPER_ADMIN' } };
      await expect(guardia(findUnique).canActivate(contexto(superAdmin))).resolves.toBe(true);
      expect(findUnique).not.toHaveBeenCalled();
    });
  });
});
