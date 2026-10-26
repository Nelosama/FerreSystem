import { ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { PERMITE_CAMBIO_PENDIENTE } from '../decorators/permite-cambio-pendiente.decorator';

export const CODIGO_CAMBIO_OBLIGATORIO = 'CAMBIO_PASSWORD_OBLIGATORIO';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(protected readonly reflector: Reflector) { super(); }

  // Una cuenta que entró con clave temporal o contraseña asignada no ve módulos ni opera hasta cambiarla.
  // El acceso de soporte (de solo lectura y auditado) no depende de la contraseña del usuario.
  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (!(await super.canActivate(context))) return false;
    const user = context.switchToHttp().getRequest().user;
    const permitida = this.reflector.getAllAndOverride<boolean>(PERMITE_CAMBIO_PENDIENTE, [context.getHandler(), context.getClass()]);
    if (user?.debeCambiarPassword && !user.impersonatedBy && !permitida) {
      throw new ForbiddenException({ statusCode: 403, code: CODIGO_CAMBIO_OBLIGATORIO, message: 'Establezca una contraseña nueva antes de continuar' });
    }
    return true;
  }
}
