import { Controller, Get, Put, Body, UseGuards } from '@nestjs/common';
import { TenantsService } from './tenants.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { TenantGuard } from '../common/guards/tenant.guard';
import { TenantId } from '../common/decorators/tenant-id.decorator';

@Controller('tenant')
@UseGuards(JwtAuthGuard, TenantGuard)
export class TenantsController {
  constructor(private readonly tenantsService: TenantsService) {}

  @Get('settings')
  async getSettings(@TenantId() tenantId: string) {
    return this.tenantsService.getTenantSettings(tenantId);
  }

  @Put('settings')
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
