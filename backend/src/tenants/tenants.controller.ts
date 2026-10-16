import { Controller, Get, Put, Body, Res, StreamableFile, NotFoundException, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { TenantsService } from './tenants.service';
import { TenantLogoService } from './tenant-logo.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { TenantGuard } from '../common/guards/tenant.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { TenantId } from '../common/decorators/tenant-id.decorator';

@Controller('tenant')
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
export class TenantsController {
  constructor(
    private readonly tenantsService: TenantsService,
    private readonly tenantLogoService: TenantLogoService,
  ) {}

  @Get('settings')
  async getSettings(@TenantId() tenantId: string) {
    return this.tenantsService.getTenantSettings(tenantId);
  }

  /**
   * La configuración del negocio es exclusiva del SUPERADMIN. Un token de tenant nunca lleva ese rol,
   * así que ADMIN, CAJERO, VENDEDOR y BODEGUERO reciben 403. La edición real está en /admin/tenants/:id/settings.
   */
  @Put('settings')
  @Roles('SUPERADMIN')
  async updateSettings(
    @TenantId() tenantId: string,
    @Body()
    body: {
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
    return this.tenantsService.updateTenantBranding(tenantId, body, { esSuperAdmin: true });
  }

  /** Logotipo del negocio autenticado. Cualquier usuario del negocio puede leer el suyo; nunca el de otro. */
  @Get('logo')
  async getLogo(@TenantId() tenantId: string, @Res({ passthrough: true }) res: Response) {
    const logotipo = await this.tenantLogoService.leer(tenantId);
    if (!logotipo) throw new NotFoundException('El negocio no tiene logotipo');
    res.setHeader('Cache-Control', 'no-store, private');
    return new StreamableFile(logotipo.datos, { type: logotipo.mime });
  }
}
