import { Inject, Injectable, Logger, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { audit } from '../operaciones/ledger';
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
    const clave = claveLogotipo(tenantId);
    await almacen.guardar(clave, datos, validado.mime);
    const actualizadoAt = new Date();
    await this.prisma.tenant.update({
      where: { id: tenantId },
      data: { logoStorageKey: clave, logoMime: validado.mime, logoBytes: validado.bytes, logoActualizadoAt: actualizadoAt },
    });
    await audit(this.prisma as any, tenantId, superAdminId, 'LOGOTIPO_GUARDAR', tenantId, { mime: validado.mime, bytes: validado.bytes, ancho: validado.ancho, alto: validado.alto, almacen: almacen.nombre, superAdminId });
    return { mime: validado.mime, bytes: validado.bytes, actualizadoAt };
  }

  /** Lee los bytes del logotipo. Devuelve null si el negocio no tiene logotipo. */
  async leer(tenantId: string): Promise<{ datos: Buffer; mime: string } | null> {
    const tenant = await this.negocio(tenantId);
    if (!tenant.logoStorageKey || !tenant.logoMime) return null;
    const datos = await this.almacenConfigurado().leer(claveLogotipo(tenantId));
    if (!datos) {
      // La base indica logotipo pero el almacenamiento no lo tiene: se informa sin exponer la clave.
      this.logger.error(`Logotipo registrado sin objeto en el almacenamiento para el negocio ${tenantId}`);
      throw new NotFoundException('El logotipo no está disponible; vuelva a cargarlo');
    }
    return { datos, mime: tenant.logoMime };
  }

  /** Elimina el logotipo del almacenamiento y de la referencia en PostgreSQL. */
  async eliminar(tenantId: string, superAdminId: string): Promise<void> {
    const tenant = await this.negocio(tenantId);
    if (!tenant.logoStorageKey) throw new NotFoundException('El negocio no tiene logotipo');
    await this.almacenConfigurado().eliminar(claveLogotipo(tenantId));
    await this.prisma.tenant.update({
      where: { id: tenantId },
      data: { logoStorageKey: null, logoMime: null, logoBytes: null, logoActualizadoAt: null },
    });
    await audit(this.prisma as any, tenantId, superAdminId, 'LOGOTIPO_ELIMINAR', tenantId, { superAdminId });
  }
}
