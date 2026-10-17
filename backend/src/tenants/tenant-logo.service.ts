import { Inject, Injectable, Logger, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { randomUUID } from 'node:crypto';
import { audit, lockTenant } from '../operaciones/ledger';
import { claveLogotipo, LOGOTIPO_ALMACEN, type AlmacenLogotipo } from './logotipo-almacen';
import { validarLogotipo } from './logotipo-validacion';

export interface LogotipoPublico {
  mime: string;
  bytes: number;
  actualizadoAt: Date;
}

/**
 * Logotipo corporativo por negocio. La clave de almacenamiento se deriva del identificador del negocio
 * en el servidor: el cliente nunca elige rutas, por lo que un negocio no puede tocar el archivo de otro.
 */
@Injectable()
export class TenantLogoService {
  private readonly logger = new Logger(TenantLogoService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(LOGOTIPO_ALMACEN) private readonly almacen: AlmacenLogotipo | null,
  ) {}

  private almacenConfigurado(): AlmacenLogotipo {
    if (!this.almacen) throw new ServiceUnavailableException('El almacenamiento de logotipos no está configurado en el servidor');
    return this.almacen;
  }

  private async negocio(tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId }, select: { id: true, logoStorageKey: true, logoMime: true, logoBytes: true, logoActualizadoAt: true } });
    if (!tenant) throw new NotFoundException('Ferretería no encontrada');
    return tenant;
  }

  /** Guarda o reemplaza el logotipo y registra el cambio en auditoría. */
  async guardar(tenantId: string, datos: Buffer, mimeDeclarado: string | undefined, superAdminId: string): Promise<LogotipoPublico> {
    await this.negocio(tenantId);
    const validado = validarLogotipo(datos, mimeDeclarado);
    const almacen = this.almacenConfigurado();
    const clave = `${claveLogotipo(tenantId)}/${randomUUID()}`;
    if (!almacen.usarTransaccion) await almacen.guardar(clave, datos, validado.mime);
    const actualizadoAt = new Date();
    // El objeto previo no se sobrescribe. Solo un commit de referencia + auditoría publica el nuevo.
    // En PostgreSQL los bytes comparten transacción. En almacenes externos un commit ambiguo
    // conserva el candidato; nunca se elimina un posible objeto vigente.
    const anterior = await this.prisma.$transaction(async tx => {
      await lockTenant(tx, tenantId);
      if (almacen.usarTransaccion) await almacen.usarTransaccion(tx).guardar(clave, datos, validado.mime);
      const previo = await tx.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { logoStorageKey: true } });
      await tx.tenant.update({ where: { id: tenantId }, data: { logoStorageKey: clave, logoMime: validado.mime, logoBytes: validado.bytes, logoActualizadoAt: actualizadoAt } });
      await audit(tx, tenantId, superAdminId, 'LOGOTIPO_GUARDAR', tenantId, { mime: validado.mime, bytes: validado.bytes, ancho: validado.ancho, alto: validado.alto, almacen: almacen.nombre, superAdminId });
      return previo.logoStorageKey;
    });
    if (anterior) await this.limpiar(anterior);
    return { mime: validado.mime, bytes: validado.bytes, actualizadoAt };
  }

  /** Lee los bytes del logotipo. Devuelve null si el negocio no tiene logotipo. */
  async leer(tenantId: string): Promise<{ datos: Buffer; mime: string } | null> {
    const tenant = await this.negocio(tenantId);
    if (!tenant.logoStorageKey || !tenant.logoMime) return null;
    const datos = await this.almacenConfigurado().leer(this.claveDelNegocio(tenantId, tenant.logoStorageKey));
    if (!datos) {
      // La base indica logotipo pero el almacenamiento no lo tiene: se informa sin exponer la clave.
      this.logger.error(`Logotipo registrado sin objeto en el almacenamiento para el negocio ${tenantId}`);
      throw new NotFoundException('El logotipo no está disponible; vuelva a cargarlo');
    }
    return { datos, mime: tenant.logoMime };
  }

  /** Elimina el logotipo del almacenamiento y de la referencia en PostgreSQL. */
  async eliminar(tenantId: string, superAdminId: string): Promise<void> {
    const clave = await this.prisma.$transaction(async tx => {
      await lockTenant(tx, tenantId);
      const tenant = await tx.tenant.findUnique({ where: { id: tenantId } });
      if (!tenant?.logoStorageKey) throw new NotFoundException('El negocio no tiene logotipo');
      this.claveDelNegocio(tenantId, tenant.logoStorageKey);
      await tx.tenant.update({ where: { id: tenantId }, data: { logoStorageKey: null, logoMime: null, logoBytes: null, logoActualizadoAt: null } });
      await audit(tx, tenantId, superAdminId, 'LOGOTIPO_ELIMINAR', tenantId, { superAdminId });
      return tenant.logoStorageKey;
    });
    await this.limpiar(clave);
  }

  private claveDelNegocio(tenantId: string, clave: string) {
    const prefijo = claveLogotipo(tenantId);
    if (clave !== prefijo && !new RegExp(`^${prefijo}/[A-Za-z0-9-]+$`).test(clave)) throw new ServiceUnavailableException('Referencia de logotipo inválida');
    return clave;
  }

  private async limpiar(clave: string) {
    try { await this.almacenConfigurado().eliminar(clave); }
    catch { this.logger.warn('No se pudo limpiar un logotipo anterior; la referencia vigente se conserva'); }
  }
}
