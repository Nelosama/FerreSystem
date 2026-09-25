import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ProductosService } from './productos.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { TenantGuard } from '../common/guards/tenant.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { TenantId } from '../common/decorators/tenant-id.decorator';
import { CreateProductoDto, UpdateProductoDto } from './dto/create-producto.dto';

@Controller('productos')
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

  @Get(':id')
  async findById(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.productosService.findById(tenantId, id);
  }

  @Post()
  @Roles('ADMIN', 'BODEGUERO')
  async create(
    @TenantId() tenantId: string,
    @Body() dto: CreateProductoDto,
  ) {
    return this.productosService.create(tenantId, dto);
  }

  @Put(':id')
  @Roles('ADMIN', 'BODEGUERO')
  async update(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @Body() dto: UpdateProductoDto,
  ) {
    return this.productosService.update(tenantId, id, dto);
  }

  @Delete(':id')
  @Roles('ADMIN')
  async delete(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.productosService.delete(tenantId, id);
  }
}
