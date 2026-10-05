import { RequiredPermission } from '../common/decorators/required-permission.decorator';
import { Controller, Get, Post, Body, Param, Query, UseGuards } from '@nestjs/common';
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
export class VentasController {
  constructor(private readonly ventasService: VentasService) {}

  @Get()
  async findAll(@TenantId() tenantId: string, @Query('limit') limit?: string, @Query('page') page?: string) {
    const take = Math.min(500,Math.max(1,Math.floor(Number(limit)) || 50));
    const pageNumber = Math.max(0,Math.floor(Number(page) || 0));
    return this.ventasService.findAll(tenantId, take, pageNumber);
  }

  @Get(':id')
  async findById(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.ventasService.findById(tenantId, id);
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

