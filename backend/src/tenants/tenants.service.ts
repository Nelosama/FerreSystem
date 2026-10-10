import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { enabledTenantModules } from '../common/tenant-modules';
import { normalizeTenantConfiguration, validateTenantConfiguration } from './tenant-configuration';
import { PrismaService } from '../prisma/prisma.service';

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

    return {
      ...tenant,
      ...normalizeTenantConfiguration(tenant.configuracion),
      modulosHabilitados: enabledTenantModules(tenant.modulos),
    };
  }

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
  ) {
    if (data.modoNavegacion && !['SIDEBAR', 'TOPNAV'].includes(data.modoNavegacion)) throw new BadRequestException('Navegación inválida');
    const configuracion = data.configuracion;
    if (configuracion !== undefined) {
      validateTenantConfiguration(configuracion);
      // FS-10: el rubro del negocio define plantillas y catálogo; solo lo cambia el Super Admin (ruta de soporte).
      // Reenviar el valor vigente sigue permitido, así un guardado de apariencia no falla.
      if (configuracion.rubro !== undefined) {
        const actual = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
        const rubroActual = (actual?.configuracion as Record<string, unknown> | null)?.rubro ?? 'FERRETERIA';
        if (configuracion.rubro !== rubroActual) throw new ForbiddenException('El rubro del negocio solo lo configura el Super Admin');
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
        ...(data.logoUrl !== undefined && { logoUrl: data.logoUrl }),
      },
    });
    return this.getTenantSettings(tenantId);
  }
}
