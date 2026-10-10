import { RequiredPermission } from '../common/decorators/required-permission.decorator';
import { Controller, Get, Post, Body, Param, Query, UseGuards, ParseUUIDPipe } from '@nestjs/common';
import { VentasService } from './ventas.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { TenantGuard } from '../common/guards/tenant.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { TenantId } from '../common/decorators/tenant-id.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequiredModule } from '../common/decorators/required-module.decorator';
import { CreateVentaDto } from './dto/create-venta.dto';

@Controller('ventas')
@RequiredModule('pos')
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
// Lectura de ventas (datos de clientes, RTN y totales): nunca para BODEGUERO. Las rutas con @Roles propias lo sobrescriben.
@Roles('ADMIN', 'CAJERO', 'VENDEDOR')
export class VentasController {
  constructor(private readonly ventasService: VentasService) {}

  @Get()
  async findAll(@TenantId() tenantId: string, @Query('limit') limit?: string, @Query('page') page?: string, @CurrentUser() user?: any) {
    const take = Math.min(500,Math.max(1,Math.floor(Number(limit)) || 50));
    const pageNumber = Math.max(0,Math.floor(Number(page) || 0));
    return this.ventasService.findAll(tenantId, take, pageNumber, user?.rol === 'CAJERO' ? user.sub : undefined);
  }

  @Get('solicitudes/:id')
  async findSolicitud(
    @TenantId() tenantId: string,
    @CurrentUser('sub') usuarioId: string,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.ventasService.findSolicitud(tenantId, usuarioId, id);
  }

  @Get(':id')
  async findById(@TenantId() tenantId: string, @Param('id') id: string, @CurrentUser() user?: any) {
    return this.ventasService.findById(tenantId, id, user?.rol === 'CAJERO' ? user.sub : undefined);
  }

  @Post()
  @RequiredPermission('pos.vender')
  @Roles('ADMIN', 'CAJERO', 'VENDEDOR')
  async create(
    @TenantId() tenantId: string,
    @CurrentUser('sub') usuarioId: string,
    @Body() dto: CreateVentaDto,
  ) {
    return this.ventasService.create(tenantId, usuarioId, dto);
  }
}
