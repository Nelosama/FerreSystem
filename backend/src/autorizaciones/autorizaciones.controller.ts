import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { TenantGuard } from '../common/guards/tenant.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { TenantId } from '../common/decorators/tenant-id.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequiredModule } from '../common/decorators/required-module.decorator';
import { AutorizacionesService } from './autorizaciones.service';
import { DecisionAutorizacionDto, ListarAutorizacionesDto } from './autorizaciones.dto';

// Solicitudes de autorización. En esta etapa solo existen las de descuento de cotización, por eso el módulo requerido.
@Controller('autorizaciones')
@RequiredModule('cotizaciones')
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
@Roles('ADMIN', 'CAJERO', 'VENDEDOR')
export class AutorizacionesController {
  constructor(private readonly service: AutorizacionesService) {}

  @Get()
  listar(@TenantId() tenantId: string, @CurrentUser('sub') usuarioId: string, @Query() filtro: ListarAutorizacionesDto) {
    return this.service.listar(tenantId, usuarioId, filtro.estado, filtro.page);
  }

  // Consultar una solicitud (por ejemplo, al abrirla desde un aviso) nunca la aprueba.
  @Get(':id')
  consultar(@TenantId() tenantId: string, @CurrentUser('sub') usuarioId: string, @Param('id') id: string) {
    return this.service.consultar(tenantId, usuarioId, id);
  }

  @Post(':id/aprobar')
  @Roles('ADMIN')
  aprobar(@TenantId() tenantId: string, @CurrentUser('sub') usuarioId: string, @Param('id') id: string, @Body() dto: DecisionAutorizacionDto) {
    return this.service.aprobar(tenantId, usuarioId, id, dto.motivo);
  }

  @Post(':id/rechazar')
  @Roles('ADMIN')
  rechazar(@TenantId() tenantId: string, @CurrentUser('sub') usuarioId: string, @Param('id') id: string, @Body() dto: DecisionAutorizacionDto) {
    return this.service.rechazar(tenantId, usuarioId, id, dto.motivo);
  }

  @Post(':id/cancelar')
  cancelar(@TenantId() tenantId: string, @CurrentUser('sub') usuarioId: string, @Param('id') id: string) {
    return this.service.cancelar(tenantId, usuarioId, id);
  }
}
