import { Controller, Get, Post, Patch, Body, Param, UseGuards } from '@nestjs/common';
import { CotizacionesService } from './cotizaciones.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { TenantGuard } from '../common/guards/tenant.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { TenantId } from '../common/decorators/tenant-id.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CreateCotizacionDto } from './dto/create-cotizacion.dto';

@Controller('cotizaciones')
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
export class CotizacionesController {
  constructor(private readonly cotizacionesService: CotizacionesService) {}

  @Get()
  async findAll(@TenantId() tenantId: string) {
    return this.cotizacionesService.findAll(tenantId);
  }

  @Get(':id')
  async findById(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.cotizacionesService.findById(tenantId, id);
  }

  @Post()
  @Roles('ADMIN', 'VENDEDOR', 'CAJERO')
  async create(
    @TenantId() tenantId: string,
    @CurrentUser('sub') usuarioId: string,
    @Body() dto: CreateCotizacionDto,
  ) {
    return this.cotizacionesService.create(tenantId, usuarioId, dto);
  }

  @Patch(':id/estado')
  @Roles('ADMIN', 'VENDEDOR', 'CAJERO')
  async updateEstado(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @Body('estado') estado: string,
  ) {
    return this.cotizacionesService.updateEstado(tenantId, id, estado);
  }

  @Post(':id/convertir')
  @Roles('ADMIN', 'CAJERO')
  async convertirAVenta(
    @TenantId() tenantId: string,
    @CurrentUser('sub') usuarioId: string,
    @Param('id') cotizacionId: string,
    @Body('metodoPago') metodoPago?: string,
  ) {
    return this.cotizacionesService.convertirAVenta(tenantId, usuarioId, cotizacionId, metodoPago);
  }
}
