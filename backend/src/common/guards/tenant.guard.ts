import { Injectable, CanActivate, ExecutionContext, ForbiddenException, Logger, Optional } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class TenantGuard implements CanActivate {
  private readonly logger = new Logger(TenantGuard.name);
  constructor(@Optional() private readonly prisma?: PrismaService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user || user.type !== 'tenant' || !user.tenantId) {
      throw new ForbiddenException('Acceso restringido a usuarios de tenant autorizados');
    }

    if (user.impersonatedBy && user.readOnly && !['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
      this.registrarDenegacion(request, user);
      throw new ForbiddenException('La sesión de soporte está en modo de solo lectura');
    }
    return true;
  }

  /** Evidencia (sin cuerpo ni cabeceras) del intento de escritura bloqueado; no condiciona el rechazo. */
  private registrarDenegacion(request: any, user: any) {
    const ruta = request.route?.path ?? 'desconocida';
    void this.prisma?.auditoriaOperacion.create({
      data: {
        tenantId: String(user.tenantId), usuarioId: String(user.sub), operacion: 'SOPORTE_ESCRITURA_DENEGADA', entidadId: String(request.params?.id ?? ruta),
        datos: { metodo: request.method, ruta, _soporte: { superAdminId: String(user.impersonatedBy), soporteSesionId: String(user.soporteSesionId), readOnly: true, resultado: 'DENEGADA' } },
      },
    }).catch(error => this.logger.error(`No se pudo registrar la denegación de soporte: ${error?.message}`));
  }
}
