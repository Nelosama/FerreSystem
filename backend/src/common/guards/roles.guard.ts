import { REQUIRED_PERMISSION_KEY } from '../decorators/required-permission.decorator';
import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    const requiredPermission=this.reflector.getAllAndOverride<string>(REQUIRED_PERMISSION_KEY,[context.getHandler(),context.getClass()]);
    const {user}=context.switchToHttp().getRequest();
    if(requiredPermission && user?.rol !== 'ADMIN' && user?.permisosConfigurados && !user.permisos?.includes(requiredPermission))throw new ForbiddenException('No tiene el permiso requerido para esta operación');
    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }


    if (!user || !user.rol) {
      throw new ForbiddenException('No cuenta con los permisos necesarios para realizar esta acción');
    }

    const hasRole = requiredRoles.includes(user.rol);
    if (!hasRole) {
      throw new ForbiddenException('Su rol de usuario no tiene autorización para acceder a esta función');
    }

    return true;
  }
}

