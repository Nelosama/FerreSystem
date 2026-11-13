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
import { ConvertirCotizacionDto, CreateCotizacionDto, EstadoCotizacionDto, RegularizarIsvDto } from './dto/create-cotizacion.dto';

@Controller('cotizaciones')
@RequiredModule('cotizaciones')
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
// Cotizaciones incluyen contacto y RTN de clientes: el acceso por defecto es comercial, no de bodega.
@Roles('ADMIN', 'CAJERO', 'VENDEDOR')
export class CotizacionesController {
  constructor(private readonly cotizacionesService: CotizacionesService) {}

  @Get()
  async findAll(@TenantId() tenantId: string, @CurrentUser('rol') rol?: string) {
    return this.cotizacionesService.findAll(tenantId, rol);
  }

  @Get(':id')
  async findById(@TenantId() tenantId: string, @Param('id') id: string, @CurrentUser('rol') rol?: string) {
    return this.cotizacionesService.findById(tenantId, id, rol);
  }

  @Post()
  @RequiredPermission('cotizaciones.crear')
  @Roles('ADMIN', 'VENDEDOR', 'CAJERO')
  async create(
    @TenantId() tenantId: string,
    @CurrentUser('sub') usuarioId: string,
    @Body() dto: CreateCotizacionDto,
    @CurrentUser('rol') rol?: string,
  ) {
    return this.cotizacionesService.create(tenantId, usuarioId, dto, undefined, rol);
  }

  @Put(':id')
  @RequiredPermission('cotizaciones.crear')
  @Roles('ADMIN', 'VENDEDOR', 'CAJERO')
  async update(
    @TenantId() tenantId: string,
    @CurrentUser('sub') usuarioId: string,
    @Param('id') id: string,
    @Body() dto: CreateCotizacionDto,
    @CurrentUser('rol') rol?: string,
  ) {
    return this.cotizacionesService.update(tenantId, id, dto, usuarioId, rol);
  }

  @Post(':id/duplicar')
  @Roles('ADMIN', 'VENDEDOR', 'CAJERO')
  async duplicate(
    @TenantId() tenantId: string,
    @CurrentUser('sub') usuarioId: string,
    @Param('id') id: string,
    @CurrentUser('rol') rol?: string,
  ) {
    return this.cotizacionesService.duplicate(tenantId, usuarioId, id, rol);
  }

  // P3: crea una cotización nueva con tasa autorizada a partir de una antigua con tasa no autorizada; la original no cambia.
  @Post(':id/regularizar-isv')
  @Roles('ADMIN')
  async regularizarIsv(
    @TenantId() tenantId: string,
    @CurrentUser('sub') usuarioId: string,
    @Param('id') id: string,
    @Body() dto: RegularizarIsvDto,
  ) {
    return this.cotizacionesService.regularizarIsv(tenantId, usuarioId, id, dto);
  }

  @Patch(':id/estado')
  @RequiredPermission('cotizaciones.aprobar')
  @Roles('ADMIN', 'VENDEDOR', 'CAJERO')
  async updateEstado(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @Body() dto: EstadoCotizacionDto,
    @CurrentUser('rol') rol?: string,
  ) {
    return this.cotizacionesService.updateEstado(tenantId, id, dto.estado, rol);
  }

  // Pide al ADMIN que autorice el descuento (o lo vuelve a pedir tras un rechazo). Pedirlo nunca lo aprueba.
  @Post(':id/autorizacion-descuento')
  @RequiredPermission('cotizaciones.crear')
  @Roles('ADMIN', 'VENDEDOR', 'CAJERO')
  async solicitarAutorizacionDescuento(
    @TenantId() tenantId: string,
    @CurrentUser('sub') usuarioId: string,
    @Param('id') id: string,
    @CurrentUser('rol') rol?: string,
  ) {
    return this.cotizacionesService.solicitarAutorizacionDescuento(tenantId, usuarioId, id, rol);
  }

  // Cancela la solicitud pendiente (si la hay) y deja la cotización al precio original, sin descuentos.
  @Post(':id/quitar-descuento')
  @RequiredPermission('cotizaciones.crear')
  @Roles('ADMIN', 'VENDEDOR', 'CAJERO')
  async quitarDescuento(
    @TenantId() tenantId: string,
    @CurrentUser('sub') usuarioId: string,
    @Param('id') id: string,
    @CurrentUser('rol') rol?: string,
  ) {
    return this.cotizacionesService.quitarDescuento(tenantId, usuarioId, id, rol);
  }

  @RequiredModule('cotizaciones', 'pos')
  @Post(':id/convertir')
  @RequiredPermission('cotizaciones.convertir_venta')
  @Roles('ADMIN', 'CAJERO')
  async convertirAVenta(
    @TenantId() tenantId: string,
    @CurrentUser('sub') usuarioId: string,
    @Param('id') cotizacionId: string,
    @Body() dto: ConvertirCotizacionDto,
  ) {
    return this.cotizacionesService.convertirAVenta(tenantId, usuarioId, cotizacionId, dto.metodoPago, dto.pagoElectronico, dto.excepcionPrecio);
  }
}

