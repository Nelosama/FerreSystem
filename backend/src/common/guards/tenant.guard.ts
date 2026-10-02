import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';

@Injectable()
export class TenantGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user || user.type !== 'tenant' || !user.tenantId) {
      throw new ForbiddenException('Acceso restringido a usuarios de tenant autorizados');
    }

    if (user.impersonatedBy && user.readOnly && !['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
      throw new ForbiddenException('La sesión de soporte está en modo de solo lectura');
    }
    return true;
  }
}
