import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { enabledTenantModules } from '../common/tenant-modules';
import { normalizeTenantConfiguration, validateTenantConfiguration } from './tenant-configuration';
import { PrismaService } from '../prisma/prisma.service';

const logoStorageKey = (tenant: { logoStorageKey?: string | null }) => tenant.logoStorageKey ?? null;

@Injectable()
export class TenantsService {
  constructor(private prisma: PrismaService) {}

  async getTenantSettings(tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      include: {
        modulos: true,
      },
    });

    if (!tenant) {
      throw new NotFoundException('Ferretería no encontrada');
    }

    // La clave de almacenamiento es interna: el cliente solo recibe metadatos del logotipo.
    const { logoStorageKey: _claveInterna, logoMime, logoBytes, logoActualizadoAt, ...publico } = tenant;
    return {
      ...publico,
      ...normalizeTenantConfiguration(tenant.configuracion),
      logotipo: logoStorageKey(tenant) ? { mime: logoMime, bytes: logoBytes, actualizadoAt: logoActualizadoAt } : null,
      modulosHabilitados: enabledTenantModules(tenant.modulos),
    };
  }

  /**
   * Configuración del negocio. Solo la invoca la ruta del SUPERADMIN (`esSuperAdmin`), que es la única
   * autorizada a cambiar el rubro. El logotipo no se escribe aquí: se gestiona con almacenamiento privado.
   */
  async updateTenantBranding(
    tenantId: string,
    data: {
      nombreComercial?: string;
      direccion?: string;
      telefono?: string;
      email?: string;
      colorPrimario?: string;
      logoUrl?: string | null;
      modoNavegacion?: "SIDEBAR" | "TOPNAV";
      configuracion?: Record<string, any>;
    },
    opciones: { esSuperAdmin?: boolean } = {},
  ) {
    if (data.logoUrl !== undefined) throw new BadRequestException('El logotipo se carga como archivo desde la administración del negocio');
    if (data.modoNavegacion && !['SIDEBAR', 'TOPNAV'].includes(data.modoNavegacion)) throw new BadRequestException('Navegación inválida');
    // Auditoría 12/10 (P3): un color inválido no se guarda; antes la vista previa caía a negro sin aviso.
    if (data.colorPrimario !== undefined && !/^#[0-9A-Fa-f]{6}$/.test(data.colorPrimario)) throw new BadRequestException('Color de marca inválido: use el formato #RRGGBB');
    const configuracion = data.configuracion;
    if (configuracion !== undefined) {
      validateTenantConfiguration(configuracion);
      // FS-10: el rubro del negocio define plantillas y catálogo; solo lo cambia el Super Admin (ruta de soporte).
      // Reenviar el valor vigente sigue permitido, así un guardado de apariencia no falla.
      if (configuracion.rubro !== undefined) {
        const actual = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
        const rubroActual = (actual?.configuracion as Record<string, unknown> | null)?.rubro ?? 'FERRETERIA';
        if (configuracion.rubro !== rubroActual && !opciones.esSuperAdmin) throw new ForbiddenException('El rubro del negocio solo lo configura el Super Admin');
      }
    }
    await this.prisma.tenant.update({
      where: { id: tenantId },
      data: {
        ...(configuracion !== undefined && { configuracion }),
        ...(data.modoNavegacion && { modoNavegacion: data.modoNavegacion }),
        ...(data.nombreComercial && { nombreComercial: data.nombreComercial }),
        ...(data.direccion !== undefined && { direccion: data.direccion }),
        ...(data.telefono !== undefined && { telefono: data.telefono }),
        ...(data.email !== undefined && { email: data.email }),
        ...(data.colorPrimario && { colorPrimario: data.colorPrimario }),
      },
    });
    return this.getTenantSettings(tenantId);
  }
}
