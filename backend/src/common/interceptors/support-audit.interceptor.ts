import { CallHandler, ExecutionContext, ForbiddenException, Injectable, Logger, NestInterceptor } from '@nestjs/common';
import { Observable, catchError, from, switchMap, tap, throwError } from 'rxjs';
import { PrismaService } from '../../prisma/prisma.service';
import { runWithSupportContext } from '../support-context';

const SAFE_METHODS = ['GET', 'HEAD', 'OPTIONS'];

/**
 * Sesiones de soporte (impersonación): toda petición que modifica datos deja evidencia ANTES de ejecutarse
 * (si no se puede registrar, no se ejecuta) y el resultado después. La identidad sale solo del JWT validado.
 * Nunca se guarda el cuerpo, la query ni cabeceras (contraseñas, tokens).
 */
@Injectable()
export class SupportAuditInterceptor implements NestInterceptor {
  private readonly logger = new Logger(SupportAuditInterceptor.name);
  constructor(private readonly prisma: PrismaService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();
    const request = context.switchToHttp().getRequest();
    const user = request.user;
    if (!user?.impersonatedBy || user.type !== 'tenant') return next.handle();

    const supportContext = { impersonatedBy: String(user.impersonatedBy), soporteSesionId: String(user.soporteSesionId), readOnly: user.readOnly !== false };
    const run = () => new Observable<unknown>(subscriber => runWithSupportContext(supportContext, () => next.handle().subscribe(subscriber)));
    if (SAFE_METHODS.includes(request.method)) return run();

    // Defensa en profundidad: TenantGuard ya bloquea escrituras de solo lectura.
    if (supportContext.readOnly) throw new ForbiddenException('La sesión de soporte está en modo de solo lectura');

    const ruta = request.route?.path ?? 'desconocida';
    const entidadId = String(request.params?.id ?? request.params?.[Object.keys(request.params ?? {})[0]] ?? ruta);
    const base = { metodo: request.method, ruta, params: request.params ?? {}, _soporte: { superAdminId: supportContext.impersonatedBy, soporteSesionId: supportContext.soporteSesionId, readOnly: false } };
    const registrar = (operacion: string, extra: Record<string, unknown>) => this.prisma.auditoriaOperacion.create({
      data: { tenantId: String(user.tenantId), usuarioId: String(user.sub), operacion, entidadId, datos: { ...base, ...extra } as any },
    });

    return from(registrar('SOPORTE_ESCRITURA_INICIO', { resultado: 'INICIADA' })).pipe(
      switchMap(() => run()),
      tap(() => void registrar('SOPORTE_ESCRITURA_RESULTADO', { resultado: 'OK' }).catch(error => this.logger.error(`No se pudo registrar el resultado de soporte: ${error?.message}`))),
      catchError(error => {
        void registrar('SOPORTE_ESCRITURA_RESULTADO', { resultado: 'ERROR', estado: error?.status ?? 500 }).catch(e => this.logger.error(`No se pudo registrar el error de soporte: ${e?.message}`));
        return throwError(() => error);
      }),
    );
  }
}
