import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { TenantGuard } from '../common/guards/tenant.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { TenantId } from '../common/decorators/tenant-id.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequiredModule } from '../common/decorators/required-module.decorator';
import { GarantiasService } from './garantias.service';
import { ActualizarCoberturaDto, CrearCoberturaDto } from './dto/garantias.dto';

// Garantías por línea de factura. Crear y editar: solo ADMIN. Consultar: ADMIN y CAJERO.
@Controller('garantias')
@RequiredModule('garantias')
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
export class GarantiasController {
  constructor(private readonly service: GarantiasService) {}

  @Get('facturas/:numero')
  @Roles('ADMIN', 'CAJERO')
  buscarFactura(@TenantId() tenantId: string, @Param('numero') numero: string) {
    return this.service.buscarFactura(tenantId, numero);
  }

  @Get('coberturas')
  @Roles('ADMIN', 'CAJERO')
  listar(@TenantId() tenantId: string, @Query('q') q?: string) {
    return this.service.listar(tenantId, q);
  }

  @Post('coberturas')
  @Roles('ADMIN')
  crear(@TenantId() tenantId: string, @CurrentUser('sub') usuarioId: string, @Body() dto: CrearCoberturaDto) {
    return this.service.crear(tenantId, usuarioId, dto);
  }

  @Patch('coberturas/:id')
  @Roles('ADMIN')
  actualizarDias(
    @TenantId() tenantId: string,
    @CurrentUser('sub') usuarioId: string,
    @Param('id') id: string,
    @Body() dto: ActualizarCoberturaDto,
  ) {
    return this.service.actualizarDias(tenantId, usuarioId, id, dto);
  }
}
