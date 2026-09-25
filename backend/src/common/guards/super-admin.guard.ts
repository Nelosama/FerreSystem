import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';

@Injectable()
export class SuperAdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user || user.type !== 'super_admin' || user.rol !== 'SUPER_ADMIN') {
      throw new ForbiddenException('Acceso exclusivo para Super Administradores de la plataforma SaaS');
    }

    return true;
  }
}
