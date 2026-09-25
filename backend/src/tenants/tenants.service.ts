import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class TenantsService {
  constructor(private prisma: PrismaService) {}

  async getTenantSettings(tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
    });

    if (!tenant) {
      throw new NotFoundException('Ferretería no encontrada');
    }

    return tenant;
  }

  async updateTenantBranding(
    tenantId: string,
    data: {
      nombreComercial?: string;
      direccion?: string;
      telefono?: string;
      email?: string;
      colorPrimario?: string;
      logoUrl?: string;
    },
  ) {
    return this.prisma.tenant.update({
      where: { id: tenantId },
      data: {
        ...(data.nombreComercial && { nombreComercial: data.nombreComercial }),
        ...(data.direccion !== undefined && { direccion: data.direccion }),
        ...(data.telefono !== undefined && { telefono: data.telefono }),
        ...(data.email !== undefined && { email: data.email }),
        ...(data.colorPrimario && { colorPrimario: data.colorPrimario }),
        ...(data.logoUrl !== undefined && { logoUrl: data.logoUrl }),
      },
    });
  }
}
