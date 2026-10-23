import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { REQUIRED_MODULE_KEY } from '../decorators/required-module.decorator';
import { PrismaService } from '../../prisma/prisma.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { moduleEnabled } from '../tenant-modules';

@Injectable()
export class TenantModuleGuard extends JwtAuthGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private prisma: PrismaService,
  ) { super(); }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredModule = this.reflector.getAllAndOverride<string | string[] | { anyOf: string[] }>(
      REQUIRED_MODULE_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredModule) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    // Los guards globales se ejecutan antes de los JwtAuthGuard de los controllers.
    if (!request.user) await super.canActivate(context);
    const user = request.user;

    // Super Admin bypass
    if (user?.rol === 'SUPER_ADMIN' || user?.rol === 'SUPERADMIN' || user?.type === 'super_admin') {
      return true;
    }

    const tenantId = user?.tenantId;

    if (!tenantId) {
      throw new ForbiddenException('Tenant ID no encontrado en la petición');
    }

    const anyOf = typeof requiredModule === 'object' && !Array.isArray(requiredModule) ? requiredModule.anyOf : null;
    const requiredModules = anyOf ?? (Array.isArray(requiredModule) ? requiredModule : [requiredModule as string]);
    for (const moduleKey of requiredModules) {
      const tenantModule = await this.prisma.tenantModule.findUnique({
        where: { tenantId_moduleKey: { tenantId, moduleKey } },
      });
      // Missing records retain legacy availability (except opt-in modules); explicit records are authoritative.
      const enabled = moduleEnabled(moduleKey, tenantModule);
      if (anyOf && enabled) return true;
      if (!anyOf && !enabled) {
        throw new ForbiddenException(`El módulo "${moduleKey}" no está habilitado para su suscripción.`);
      }
    }
    if (anyOf) throw new ForbiddenException(`Ninguno de los módulos "${anyOf.join(', ')}" está habilitado para su suscripción.`);
    return true;
  }
}
