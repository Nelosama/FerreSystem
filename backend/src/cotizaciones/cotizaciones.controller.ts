import { Controller, Get, Post, Patch, Body, Param, UseGuards } from '@nestjs/common';
import { CotizacionesService } from './cotizaciones.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { TenantGuard } from '../common/guards/tenant.guard';
import { TenantId } from '../common/decorators/tenant-id.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@Controller('cotizaciones')
@UseGuards(JwtAuthGuard, TenantGuard)
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
  async create(
    @TenantId() tenantId: string,
    @CurrentUser('sub') usuarioId: string,
    @Body()
    body: {
      clienteId: string;
      fechaValidez?: string;
      descuento?: number;
      notas?: string;
      detalles: {
        productoId: string;
        cantidad: number;
        precioUnitario?: number;
      }[];
    },
  ) {
    return this.cotizacionesService.create(tenantId, usuarioId, body);
  }

  @Patch(':id/estado')
  async updateEstado(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @Body('estado') estado: any,
  ) {
    return this.cotizacionesService.updateEstado(tenantId, id, estado);
  }

  @Post(':id/convertir')
  async convertirAVenta(
    @TenantId() tenantId: string,
    @CurrentUser('sub') usuarioId: string,
    @Param('id') id: string,
    @Body('metodoPago') metodoPago?: any,
  ) {
    return this.cotizacionesService.convertirAVenta(tenantId, usuarioId, id, metodoPago);
  }
}
