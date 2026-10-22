import { Controller, Get, UseGuards } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { TenantGuard } from '../common/guards/tenant.guard';
import { TenantId } from '../common/decorators/tenant-id.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@Controller('dashboard')
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
@Roles('ADMIN', 'BODEGUERO', 'VENDEDOR')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get()
  async getDashboard(@TenantId() tenantId: string, @CurrentUser() usuario: { rol?: string; permisosConfigurados?: boolean; permisos?: string[] }) {
    return this.dashboardService.getAuthorizedDashboard(tenantId, usuario);
  }

  /** Pendientes del usuario autenticado (contadores del inicio). CAJERO solo cuenta sus entregas. */
  @Get('pendientes')
  @Roles('ADMIN', 'BODEGUERO', 'VENDEDOR', 'CAJERO')
  async getPendientes(
    @TenantId() tenantId: string,
    @CurrentUser() usuario: { sub?: string; rol?: string; permisos?: string[]; permisosConfigurados?: boolean },
  ) {
    return this.dashboardService.getPendientes(tenantId, usuario);
  }
}
