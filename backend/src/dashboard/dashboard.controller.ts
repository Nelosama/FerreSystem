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
  async getDashboard(@TenantId() tenantId: string, @CurrentUser('rol') rol?: string) {
    // BODEGUERO no lee ventas (mismo criterio que GET /ventas): recibe solo el resumen operativo de existencias y cotizaciones.
    if (rol === 'BODEGUERO') return this.dashboardService.getResumenOperativo(tenantId);
    return this.dashboardService.getDashboardData(tenantId);
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
