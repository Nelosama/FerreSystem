import { Controller, Get, Put, Body, UseGuards } from '@nestjs/common';
import { TenantsService } from './tenants.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { TenantGuard } from '../common/guards/tenant.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { TenantId } from '../common/decorators/tenant-id.decorator';

@Controller('tenant')
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
export class TenantsController {
  constructor(private readonly tenantsService: TenantsService) {}

  @Get('settings')
  @Roles('ADMIN')
  async getSettings(@TenantId() tenantId: string) {
    return this.tenantsService.getTenantSettings(tenantId);
  }

  @Put('settings')
  @Roles('ADMIN')
  async updateSettings(
    @TenantId() tenantId: string,
    @Body()
    body: {
      nombreComercial?: string;
      direccion?: string;
      telefono?: string;
      email?: string;
      colorPrimario?: string;
      logoUrl?: string;
    },
  ) {
    return this.tenantsService.updateTenantBranding(tenantId, body);
  }
}
