import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ProductosService } from './productos.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { TenantGuard } from '../common/guards/tenant.guard';
import { TenantId } from '../common/decorators/tenant-id.decorator';

@Controller('productos')
@UseGuards(JwtAuthGuard, TenantGuard)
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
  async create(
    @TenantId() tenantId: string,
    @Body()
    body: {
      codigo: string;
      codigoBarras?: string;
      nombre: string;
      descripcion?: string;
      categoriaId?: string;
      precioVenta: number;
      precioCosto: number;
      stockActual: number;
      stockMinimo: number;
      unidadMedida?: any;
    },
  ) {
    return this.productosService.create(tenantId, body);
  }

  @Put(':id')
  async update(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @Body()
    body: {
      codigo?: string;
      codigoBarras?: string;
      nombre?: string;
      descripcion?: string;
      categoriaId?: string;
      precioVenta?: number;
      precioCosto?: number;
      stockActual?: number;
      stockMinimo?: number;
      unidadMedida?: any;
    },
  ) {
    return this.productosService.update(tenantId, id, body);
  }

  @Delete(':id')
  async delete(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.productosService.delete(tenantId, id);
  }
}
