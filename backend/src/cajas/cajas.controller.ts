import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CajasService } from './cajas.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { TenantGuard } from '../common/guards/tenant.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { TenantId } from '../common/decorators/tenant-id.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequiredModule } from '../common/decorators/required-module.decorator';
import { AbrirCajaDto } from './dto/abrir-caja.dto';
import { CrearMovimientoDto } from './dto/crear-movimiento.dto';
import { CerrarCajaDto } from './dto/cerrar-caja.dto';

@Controller('cajas')
@RequiredModule('arqueo_caja')
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
export class CajasController {
  constructor(private readonly cajasService: CajasService) {}

  @Post()
  @Roles('ADMIN', 'CAJERO')
  async abrirCaja(
    @TenantId() tenantId: string,
    @CurrentUser('sub') usuarioId: string,
    @Body() dto: AbrirCajaDto,
  ) {
    return this.cajasService.abrirCaja(tenantId, usuarioId, dto);
  }

  @Get('actual')
  @Roles('ADMIN', 'CAJERO')
  async obtenerCajaActual(
    @TenantId() tenantId: string,
    @CurrentUser('sub') usuarioId: string,
  ) {
    return this.cajasService.obtenerCajaActual(tenantId, usuarioId);
  }

  @Get()
  @Roles('ADMIN', 'CAJERO')
  async obtenerHistorial(
    @TenantId() tenantId: string,
    @Query('limit') limit?: string,
  ) {
    const take = limit ? parseInt(limit, 10) : 50;
    return this.cajasService.obtenerHistorial(tenantId, take);
  }

  @Get(':id')
  @Roles('ADMIN', 'CAJERO')
  async obtenerCajaPorId(
    @TenantId() tenantId: string,
    @Param('id') id: string,
  ) {
    return this.cajasService.obtenerCajaPorId(tenantId, id);
  }

  @Post(':id/movimientos')
  @Roles('ADMIN', 'CAJERO')
  async crearMovimiento(
    @TenantId() tenantId: string,
    @Param('id') cajaId: string,
    @CurrentUser('sub') usuarioId: string,
    @Body() dto: CrearMovimientoDto,
  ) {
    return this.cajasService.crearMovimiento(tenantId, cajaId, usuarioId, dto);
  }

  @Get(':id/movimientos')
  @Roles('ADMIN', 'CAJERO')
  async obtenerMovimientos(
    @TenantId() tenantId: string,
    @Param('id') cajaId: string,
  ) {
    return this.cajasService.obtenerMovimientos(tenantId, cajaId);
  }

  @Post(':id/cierre')
  @Roles('ADMIN', 'CAJERO')
  async cerrarCaja(
    @TenantId() tenantId: string,
    @Param('id') cajaId: string,
    @CurrentUser('sub') usuarioCierreId: string,
    @Body() dto: CerrarCajaDto,
  ) {
    return this.cajasService.cerrarCaja(tenantId, cajaId, usuarioCierreId, dto);
  }
}
