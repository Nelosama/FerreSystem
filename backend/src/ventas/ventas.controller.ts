import { Controller, Get, Post, Body, Param, Query, UseGuards } from '@nestjs/common';
import { VentasService } from './ventas.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { TenantGuard } from '../common/guards/tenant.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { TenantId } from '../common/decorators/tenant-id.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CreateVentaDto } from './dto/create-venta.dto';

@Controller('ventas')
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
export class VentasController {
  constructor(private readonly ventasService: VentasService) {}

  @Get()
  async findAll(@TenantId() tenantId: string, @Query('limit') limit?: string) {
    const take = limit ? parseInt(limit, 10) : 50;
    return this.ventasService.findAll(tenantId, take);
  }

  @Get(':id')
  async findById(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.ventasService.findById(tenantId, id);
  }

  @Post()
  @Roles('ADMIN', 'CAJERO', 'VENDEDOR')
  async create(
    @TenantId() tenantId: string,
    @CurrentUser('sub') usuarioId: string,
    @Body() dto: CreateVentaDto,
  ) {
    return this.ventasService.create(tenantId, usuarioId, dto);
  }
}
