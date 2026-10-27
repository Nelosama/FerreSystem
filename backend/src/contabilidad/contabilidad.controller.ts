import { Body, Controller, Get, Param, ParseIntPipe, Post, Put, Query, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { TenantGuard } from '../common/guards/tenant.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { RequiredModule } from '../common/decorators/required-module.decorator';
import { RequiredPermission } from '../common/decorators/required-permission.decorator';
import { TenantId } from '../common/decorators/tenant-id.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ContabilidadService } from './contabilidad.service';
import { MODULO_CONTABILIDAD, PERMISOS_CONTABILIDAD as P } from './permisos';
import {
  AsientoDto, CaiDto, CerrarVigenciaDto, ConfiguracionFiscalDto, CorreccionDocumentoDto, CuentaDto, DocumentoFiscalDto, MotivoDto,
  ReglaRetencionDto, RetencionDto, ReversionDto, TasaDto,
} from './contabilidad.dto';

// Módulo opcional por empresa (sin registro habilitado no responde). ADMIN y CONTADOR; reabrir período solo ADMIN.
@Controller('contabilidad')
@RequiredModule(MODULO_CONTABILIDAD)
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
@Roles('ADMIN', 'CONTADOR')
export class ContabilidadController {
  constructor(private readonly service: ContabilidadService) {}

  @Get('configuracion') @RequiredPermission(P.ver) configuracion(@TenantId() t: string) { return this.service.configuracion(t); }
  @Put('configuracion') @RequiredPermission(P.configurar) guardarConfiguracion(@TenantId() t: string, @CurrentUser('sub') u: string, @Body() dto: ConfiguracionFiscalDto) { return this.service.guardarConfiguracion(t, u, dto); }
  @Post('tasas') @RequiredPermission(P.configurar) crearTasa(@TenantId() t: string, @CurrentUser('sub') u: string, @Body() dto: TasaDto) { return this.service.crearTasa(t, u, dto); }
  @Post('tasas/:id/cerrar-vigencia') @RequiredPermission(P.configurar) cerrarTasa(@TenantId() t: string, @CurrentUser('sub') u: string, @Param('id') id: string, @Body() dto: CerrarVigenciaDto) { return this.service.cerrarVigenciaTasa(t, u, id, dto); }
  @Post('reglas-retencion') @RequiredPermission(P.configurar) crearRegla(@TenantId() t: string, @CurrentUser('sub') u: string, @Body() dto: ReglaRetencionDto) { return this.service.crearRegla(t, u, dto); }
  @Post('reglas-retencion/:id/cerrar-vigencia') @RequiredPermission(P.configurar) cerrarRegla(@TenantId() t: string, @CurrentUser('sub') u: string, @Param('id') id: string, @Body() dto: CerrarVigenciaDto) { return this.service.cerrarVigenciaRegla(t, u, id, dto); }
  @Post('cai') @RequiredPermission(P.configurar) crearCai(@TenantId() t: string, @CurrentUser('sub') u: string, @Body() dto: CaiDto) { return this.service.crearCai(t, u, dto); }
  @Post('cai/:id/desactivar') @RequiredPermission(P.configurar) desactivarCai(@TenantId() t: string, @CurrentUser('sub') u: string, @Param('id') id: string, @Body() dto: MotivoDto) { return this.service.desactivarCai(t, u, id, dto.motivo); }

  @Get('documentos') @RequiredPermission(P.ver) documentos(@TenantId() t: string, @Query('anio', ParseIntPipe) anio: number, @Query('mes', ParseIntPipe) mes: number, @Query('direccion') direccion?: string) { return this.service.documentos(t, anio, mes, direccion); }
  @Post('documentos') @RequiredPermission(P.registrar) crearDocumento(@TenantId() t: string, @CurrentUser('sub') u: string, @Body() dto: DocumentoFiscalDto) { return this.service.crearDocumento(t, u, dto); }
  @Post('documentos/:id/correccion') @RequiredPermission(P.registrar) corregirDocumento(@TenantId() t: string, @CurrentUser('sub') u: string, @Param('id') id: string, @Body() dto: CorreccionDocumentoDto) { return this.service.corregirDocumento(t, u, id, dto); }
  @Post('documentos/:id/anular') @RequiredPermission(P.registrar) anularDocumento(@TenantId() t: string, @CurrentUser('sub') u: string, @Param('id') id: string, @Body() dto: MotivoDto) { return this.service.anularDocumento(t, u, id, dto.motivo); }
  @Post('documentos/:id/retenciones') @RequiredPermission(P.registrar) crearRetencion(@TenantId() t: string, @CurrentUser('sub') u: string, @Param('id') id: string, @Body() dto: RetencionDto) { return this.service.crearRetencion(t, u, id, dto); }
  @Get('retenciones') @RequiredPermission(P.ver) retenciones(@TenantId() t: string, @Query('anio', ParseIntPipe) anio: number, @Query('mes', ParseIntPipe) mes: number) { return this.service.retenciones(t, anio, mes); }
  @Post('retenciones/:id/anular') @RequiredPermission(P.registrar) anularRetencion(@TenantId() t: string, @CurrentUser('sub') u: string, @Param('id') id: string, @Body() dto: MotivoDto) { return this.service.anularRetencion(t, u, id, dto.motivo); }

  @Get('libros/ventas') @RequiredPermission(P.ver) libroVentas(@TenantId() t: string, @Query('anio', ParseIntPipe) anio: number, @Query('mes', ParseIntPipe) mes: number) { return this.service.libroVentas(t, anio, mes); }
  @Get('libros/compras') @RequiredPermission(P.ver) libroCompras(@TenantId() t: string, @Query('anio', ParseIntPipe) anio: number, @Query('mes', ParseIntPipe) mes: number) { return this.service.libroCompras(t, anio, mes); }
  @Get('resumen-isv') @RequiredPermission(P.ver) resumenIsv(@TenantId() t: string, @Query('anio', ParseIntPipe) anio: number, @Query('mes', ParseIntPipe) mes: number) { return this.service.resumenIsv(t, anio, mes); }
  @Get('conciliacion') @RequiredPermission(P.ver) conciliacion(@TenantId() t: string, @Query('anio', ParseIntPipe) anio: number, @Query('mes', ParseIntPipe) mes: number) { return this.service.conciliacion(t, anio, mes); }
  @Get('ajustes') @RequiredPermission(P.ver) ajustes(@TenantId() t: string, @Query('anio', ParseIntPipe) anio: number, @Query('mes', ParseIntPipe) mes: number) { return this.service.ajustes(t, anio, mes); }
  // Formato por defecto: Excel. CSV y PDF son alternativas; el libro del mes solo existe en Excel.
  @Get('exportar/:reporte') @RequiredPermission(P.ver)
  async exportar(@TenantId() t: string, @CurrentUser('sub') u: string, @Param('reporte') reporte: string, @Query('anio', ParseIntPipe) anio: number, @Query('mes') mes: string | undefined, @Query('formato') formato: string | undefined, @Query('direccion') direccion: string | undefined, @Query('cuentaId') cuentaId: string | undefined, @Query('tipo') tipo: string | undefined, @Res() res: Response) {
    const archivo = await this.service.exportar(t, u, reporte, anio, mes === undefined || mes === '' ? undefined : Number(mes), formato || 'xlsx', direccion || undefined, cuentaId || undefined, tipo || undefined);
    res.setHeader('Content-Type', archivo.tipo);
    res.setHeader('Content-Disposition', `attachment; filename="${archivo.nombre}"`);
    // Sin esto, un navegador en otro origen no puede leer el nombre del archivo.
    res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition');
    res.setHeader('Cache-Control', 'no-store');
    res.send(archivo.contenido);
  }

  @Get('periodos') @RequiredPermission(P.ver) periodos(@TenantId() t: string, @Query('anio', ParseIntPipe) anio: number) { return this.service.periodos(t, anio); }
  @Post('periodos/:anio/:mes/cerrar') @RequiredPermission(P.cerrarPeriodo) cerrarPeriodo(@TenantId() t: string, @CurrentUser('sub') u: string, @Param('anio', ParseIntPipe) anio: number, @Param('mes', ParseIntPipe) mes: number, @Body() dto: MotivoDto) { return this.service.cerrarPeriodo(t, u, anio, mes, dto.motivo); }
  @Post('periodos/:anio/:mes/reabrir') @Roles('ADMIN') reabrirPeriodo(@TenantId() t: string, @CurrentUser('sub') u: string, @Param('anio', ParseIntPipe) anio: number, @Param('mes', ParseIntPipe) mes: number, @Body() dto: MotivoDto) { return this.service.reabrirPeriodo(t, u, anio, mes, dto.motivo); }

  @Get('cuentas') @RequiredPermission(P.ver) cuentas(@TenantId() t: string) { return this.service.cuentas(t); }
  @Post('cuentas') @RequiredPermission(P.registrar) crearCuenta(@TenantId() t: string, @CurrentUser('sub') u: string, @Body() dto: CuentaDto) { return this.service.crearCuenta(t, u, dto); }
  @Get('asientos') @RequiredPermission(P.ver) asientos(@TenantId() t: string, @Query('anio', ParseIntPipe) anio: number, @Query('mes', ParseIntPipe) mes: number) { return this.service.asientos(t, anio, mes); }
  @Post('asientos') @RequiredPermission(P.registrar) crearAsiento(@TenantId() t: string, @CurrentUser('sub') u: string, @Body() dto: AsientoDto) { return this.service.crearAsiento(t, u, dto); }
  @Post('asientos/:id/revertir') @RequiredPermission(P.registrar) revertirAsiento(@TenantId() t: string, @CurrentUser('sub') u: string, @Param('id') id: string, @Body() dto: ReversionDto) { return this.service.revertirAsiento(t, u, id, dto); }
  @Get('mayor') @RequiredPermission(P.ver) mayor(@TenantId() t: string, @Query('cuentaId') cuentaId: string, @Query('anio', ParseIntPipe) anio: number, @Query('mes', ParseIntPipe) mes: number) { return this.service.mayor(t, cuentaId, anio, mes); }
  // Cartera CxC/CxP al corte: lectura de la operación, sin permisos de escritura sobre cobros ni pagos.
  @Get('cartera') @RequiredPermission(P.ver) cartera(@TenantId() t: string, @Query('tipo') tipo: string, @Query('corte') corte?: string) { return this.service.cartera(t, tipo, corte); }
  @Get('balanza') @RequiredPermission(P.ver) balanza(@TenantId() t: string, @Query('anio', ParseIntPipe) anio: number, @Query('mes', ParseIntPipe) mes: number) { return this.service.balanza(t, anio, mes); }
}
