import { RequiredPermission } from '../common/decorators/required-permission.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Controller, ForbiddenException, Get, Patch, Post, Put, Delete, Body, Param, Query, UseGuards, UseInterceptors } from '@nestjs/common';
import { ProductoResponseInterceptor } from './producto-response.interceptor';
import { ProductosService } from './productos.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { TenantGuard } from '../common/guards/tenant.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { TenantId } from '../common/decorators/tenant-id.decorator';
import { RequiredModule } from '../common/decorators/required-module.decorator';
import { CambiarPreciosProductoDto, CreateProductoDto, UpdateProductoDto } from './dto/create-producto.dto';

@Controller('productos')
@RequiredModule('inventario')
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
@UseInterceptors(ProductoResponseInterceptor)
export class ProductosController {
  constructor(private readonly productosService: ProductosService) {}

  @Get()
  async findAll(
    @TenantId() tenantId: string,
    @CurrentUser() usuario: { rol?: string },
    @Query('search') search?: string,
    @Query('categoriaId') categoriaId?: string,
    @Query('incluirInactivos') incluirInactivos?: string,
    @Query('pendientes') pendientes?: string,
  ) {
    // Ver inactivos es parte de la reactivación, que solo puede hacer el administrador.
    if ((incluirInactivos === 'true' || pendientes === 'true') && usuario?.rol !== 'ADMIN') {
      throw new ForbiddenException('Solo el administrador puede ver productos inactivos o pendientes');
    }
    return this.productosService.findAll(tenantId, search, categoriaId, incluirInactivos === 'true', pendientes === 'true');
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

  /** Precios y aprobación para venta: solo el administrador. */
  @Patch(':id/precios')
  @RequiredPermission('inventario.editar')
  @Roles('ADMIN')
  async cambiarPrecios(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @Body() dto: CambiarPreciosProductoDto,
    @CurrentUser('sub') userId: string,
  ) {
    return this.productosService.cambiarPrecios(tenantId, id, dto, userId);
  }

  @Delete(':id')
  @RequiredPermission('inventario.editar')
  @Roles('ADMIN')
  async delete(@TenantId() tenantId: string, @Param('id') id: string, @CurrentUser('sub') userId:string) {
    return this.productosService.delete(tenantId, id, userId);
  }
}

