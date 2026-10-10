import { RequiredPermission } from '../common/decorators/required-permission.decorator';
import { Controller, Get, Post, Put, Patch, Body, Param, UseGuards } from '@nestjs/common';
import { CotizacionesService } from './cotizaciones.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { TenantGuard } from '../common/guards/tenant.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { TenantId } from '../common/decorators/tenant-id.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequiredModule } from '../common/decorators/required-module.decorator';
import { CreateCotizacionDto } from './dto/create-cotizacion.dto';

@Controller('cotizaciones')
@RequiredModule('cotizaciones')
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
// Cotizaciones incluyen contacto y RTN de clientes: el acceso por defecto es comercial, no de bodega.
@Roles('ADMIN', 'CAJERO', 'VENDEDOR')
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
  @RequiredPermission('cotizaciones.crear')
  @Roles('ADMIN', 'VENDEDOR', 'CAJERO')
  async create(
    @TenantId() tenantId: string,
    @CurrentUser('sub') usuarioId: string,
    @Body() dto: CreateCotizacionDto,
  ) {
    return this.cotizacionesService.create(tenantId, usuarioId, dto);
  }

  @Put(':id')
  @RequiredPermission('cotizaciones.crear')
  @Roles('ADMIN', 'VENDEDOR', 'CAJERO')
  async update(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @Body() dto: CreateCotizacionDto,
  ) {
    return this.cotizacionesService.update(tenantId, id, dto);
  }

  @Post(':id/duplicar')
  @Roles('ADMIN', 'VENDEDOR', 'CAJERO')
  async duplicate(
    @TenantId() tenantId: string,
    @CurrentUser('sub') usuarioId: string,
    @Param('id') id: string,
  ) {
    return this.cotizacionesService.duplicate(tenantId, usuarioId, id);
  }

  @Patch(':id/estado')
  @RequiredPermission('cotizaciones.aprobar')
  @Roles('ADMIN', 'VENDEDOR', 'CAJERO')
  async updateEstado(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @Body('estado') estado: string,
  ) {
    return this.cotizacionesService.updateEstado(tenantId, id, estado);
  }

  @RequiredModule('cotizaciones', 'pos')
  @Post(':id/convertir')
  @RequiredPermission('cotizaciones.convertir_venta')
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

