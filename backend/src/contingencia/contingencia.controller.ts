import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { TenantGuard } from '../common/guards/tenant.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { TenantId } from '../common/decorators/tenant-id.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequiredModule } from '../common/decorators/required-module.decorator';
import { ContingenciaService } from './contingencia.service';
import {
  ActualizarReferenciaDto, ConfigContingenciaDto, LoteOperacionesDto, RegistrarDispositivoDto, ResolverOperacionDto, SolicitarVentanaDto,
} from './dto/contingencia.dto';

// Contingencia offline del POS (efectivo). Apagada por defecto: sin POS_OFFLINE_ENABLED y configuración por empresa, todo responde 403.
@Controller('contingencia')
@RequiredModule('pos')
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
export class ContingenciaController {
  constructor(private readonly service: ContingenciaService) {}

  @Get('configuracion')
  @Roles('ADMIN', 'CAJERO', 'VENDEDOR')
  configuracion(@TenantId() tenantId: string) {
    return this.service.configuracion(tenantId);
  }

  @Patch('configuracion')
  @Roles('ADMIN')
  actualizarConfiguracion(@TenantId() tenantId: string, @CurrentUser('sub') usuarioId: string, @Body() dto: ConfigContingenciaDto) {
    return this.service.actualizarConfiguracion(tenantId, usuarioId, dto);
  }

  @Post('dispositivos')
  @Roles('ADMIN', 'CAJERO')
  registrarDispositivo(@TenantId() tenantId: string, @CurrentUser('sub') usuarioId: string, @Body() dto: RegistrarDispositivoDto) {
    return this.service.registrarDispositivo(tenantId, usuarioId, dto);
  }

  @Get('dispositivos')
  @Roles('ADMIN')
  listarDispositivos(@TenantId() tenantId: string) {
    return this.service.listarDispositivos(tenantId);
  }

  @Post('dispositivos/:id/desactivar')
  @Roles('ADMIN')
  desactivarDispositivo(@TenantId() tenantId: string, @CurrentUser('sub') usuarioId: string, @Param('id') id: string, @Body() body: { motivo?: string }) {
    return this.service.desactivarDispositivo(tenantId, usuarioId, id, String(body?.motivo ?? '').trim().slice(0, 300) || 'Sin motivo indicado');
  }

  @Post('dispositivos/:id/latido')
  @Roles('ADMIN', 'CAJERO', 'VENDEDOR')
  latido(@TenantId() tenantId: string, @CurrentUser('sub') usuarioId: string, @Param('id') id: string, @Body() body: { pendientes?: number }) {
    return this.service.latido(tenantId, usuarioId, id, Number(body?.pendientes ?? 0));
  }

  @Post('ventanas')
  @Roles('ADMIN', 'CAJERO')
  emitirVentana(@TenantId() tenantId: string, @CurrentUser('sub') usuarioId: string, @Body() dto: SolicitarVentanaDto) {
    return this.service.emitirVentana(tenantId, usuarioId, dto);
  }

  @Post('operaciones')
  @Roles('ADMIN', 'CAJERO')
  recibirLote(@TenantId() tenantId: string, @CurrentUser() user: any, @Body() dto: LoteOperacionesDto) {
    return this.service.recibirLote(tenantId, user.sub, user.rol, dto);
  }

  @Get('operaciones/estados')
  @Roles('ADMIN', 'CAJERO')
  estados(@TenantId() tenantId: string, @CurrentUser() user: any, @Query('ids') ids = '') {
    const lista = ids.split(',').map((id) => id.trim()).filter(Boolean).slice(0, 100);
    return this.service.estados(tenantId, user.sub, user.rol, lista);
  }

  @Get('operaciones')
  @Roles('ADMIN')
  listar(
    @TenantId() tenantId: string,
    @Query('estado') estado?: string,
    @Query('desde') desde?: string,
    @Query('hasta') hasta?: string,
    @Query('dispositivoId') dispositivoId?: string,
    @Query('soloRevision') soloRevision?: string,
    @Query('limit') limit?: string,
    @Query('page') page?: string,
  ) {
    return this.service.listar(tenantId, {
      estado, desde, hasta, dispositivoId, soloRevision: soloRevision === 'true',
      limit: Number(limit) || undefined, page: Number(page) || undefined,
    });
  }

  @Get('resumen')
  @Roles('ADMIN')
  resumen(@TenantId() tenantId: string, @Query('fecha') fecha?: string) {
    return this.service.resumen(tenantId, fecha);
  }

  @Post('operaciones/:id/resolver')
  @Roles('ADMIN')
  resolver(@TenantId() tenantId: string, @CurrentUser('sub') usuarioId: string, @Param('id') id: string, @Body() dto: ResolverOperacionDto) {
    return this.service.resolver(tenantId, usuarioId, id, dto);
  }

  @Patch('operaciones/:id/referencia-factura')
  @Roles('ADMIN', 'CAJERO')
  referencia(@TenantId() tenantId: string, @CurrentUser() user: any, @Param('id') id: string, @Body() dto: ActualizarReferenciaDto) {
    return this.service.actualizarReferencia(tenantId, user.sub, user.rol, id, dto.referenciaFacturaExterna);
  }
}
