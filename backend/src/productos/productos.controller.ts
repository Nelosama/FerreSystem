import { RequiredPermission } from '../common/decorators/required-permission.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ProductosService } from './productos.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { TenantGuard } from '../common/guards/tenant.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { TenantId } from '../common/decorators/tenant-id.decorator';
import { RequiredModule } from '../common/decorators/required-module.decorator';
import { CreateProductoDto, UpdateProductoDto } from './dto/create-producto.dto';

@Controller('productos')
@RequiredModule('inventario')
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
export class ProductosController {
  constructor(private readonly productosService: ProductosService) {}

  @Get()
  async findAll(
    @TenantId() tenantId: string,
    @Query('search') search?: string,
    @Query('categoriaId') categoriaId?: string,
  ) {
    return this.productosService.findAll(tenantId, search, categoriaId);
  }

  @Get('alertas/stock-bajo')
  async getLowStock(@TenantId() tenantId: string) {
    return this.productosService.getLowStock(tenantId);
  }

  @Get('comercial')
  @RequiredPermission('pos.vender')
  @RequiredModule('pos')
  @Roles('ADMIN','CAJERO','VENDEDOR')
  comercial(@TenantId() tenantId:string) { return this.productosService.comercial(tenantId); }

  @Get(':id')
  async findById(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.productosService.findById(tenantId, id);
  }

  @Post()
  @RequiredPermission('inventario.editar')
  @Roles('ADMIN', 'BODEGUERO')
  async create(
    @TenantId() tenantId: string,
    @Body() dto: CreateProductoDto,
    @CurrentUser('sub') userId: string,
  ) {
    return this.productosService.create(tenantId, dto, userId);
  }

  @Put(':id')
  @RequiredPermission('inventario.editar')
  @Roles('ADMIN', 'BODEGUERO')
  async update(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @Body() dto: UpdateProductoDto,
    @CurrentUser('sub') userId: string,
  ) {
    return this.productosService.update(tenantId, id, dto, userId);
  }

  @Delete(':id')
  @RequiredPermission('inventario.editar')
  @Roles('ADMIN')
  async delete(@TenantId() tenantId: string, @Param('id') id: string, @CurrentUser('sub') userId:string) {
    return this.productosService.delete(tenantId, id, userId);
  }
}

