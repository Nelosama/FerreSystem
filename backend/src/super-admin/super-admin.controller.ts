import { CreateUsuarioDto } from '../usuarios/dto/create-usuario.dto';
import { UpdateUsuarioDto } from '../usuarios/dto/update-usuario.dto';
import { SucursalDto, EditarSucursalDto } from './sucursal.dto';
import { Controller, Post, Get, Put, Patch, Delete, Body, Param, UseGuards, Req, Res, HttpCode, HttpStatus, UploadedFile, UseInterceptors, BadRequestException, StreamableFile } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { LIMITE_LOGOTIPO_BYTES } from '../tenants/logotipo-validacion';
import { SuperAdminService } from './super-admin.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { SuperAdminGuard } from '../common/guards/super-admin.guard';
import { OrigenPermitidoGuard } from '../common/guards/origen-permitido.guard';
import type { Request, Response } from 'express';
import { CreateTenantAdminDto, UpdateTenantAdminDto } from './tenant-admin.dto';
import { SupportTokenDto } from './support-token.dto';
import { PermiteSoporteSoloLectura } from '../common/decorators/soporte-solo-lectura.decorator';
import { Query, NotFoundException } from '@nestjs/common';

@Controller('admin')
export class SuperAdminController {
  constructor(private readonly superAdminService: SuperAdminService) {}

  @Post('auth/login')
  @UseGuards(OrigenPermitidoGuard)
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() loginDto: { email: string; password: string },
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.superAdminService.login(loginDto, res, req);
  }

  @Post('auth/refresh')
  @UseGuards(OrigenPermitidoGuard)
  @HttpCode(HttpStatus.OK)
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return this.superAdminService.refresh(req.cookies?.superAdminRefreshToken, res);
  }

  @Post('auth/logout')
  @UseGuards(OrigenPermitidoGuard)
  @HttpCode(HttpStatus.OK)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return this.superAdminService.logout(res, req);
  }


  @Get('tenants')
  @UseGuards(JwtAuthGuard, SuperAdminGuard)
  async listTenants() {
    return this.superAdminService.listTenants();
  }

  @Post('support/token')
  @UseGuards(JwtAuthGuard, SuperAdminGuard)
  async supportToken(@Req() req: Request & { user: { sub: string } }, @Body() dto: SupportTokenDto) {
    return this.superAdminService.supportToken(req.user.sub, dto.tenantId, dto.usuarioId, dto.readOnly ?? true, { motivo: dto.motivo, confirmarEscritura: dto.confirmarEscritura === true });
  }

  @Get('tenants/:id/usuarios')
  @UseGuards(JwtAuthGuard, SuperAdminGuard)
  async listSoporteUsuarios(@Param('id') id: string, @Query('gestion') gestion?: string) {
    if (gestion === 'true') return this.superAdminService.usuariosNegocio(id);
    return this.superAdminService.listSoporteUsuarios(id);
  }

  @Post('tenants/:id/usuarios')
  @UseGuards(JwtAuthGuard, SuperAdminGuard)
  crearUsuario(@Param('id') tenantId: string, @Body() dto: CreateUsuarioDto, @Req() req: Request & { user: { sub: string } }) {
    return this.superAdminService.crearUsuarioNegocio(tenantId, dto, req.user.sub);
  }
  @Patch('tenants/:id/usuarios/:userId')
  @UseGuards(JwtAuthGuard, SuperAdminGuard)
  editarUsuario(@Param('id') tenantId: string, @Param('userId') id: string, @Body() dto: UpdateUsuarioDto, @Req() req: Request & { user: { sub: string } }) {
    return this.superAdminService.editarUsuarioNegocio(tenantId, id, dto, req.user.sub);
  }
  @Delete('tenants/:id/usuarios/:userId')
  @UseGuards(JwtAuthGuard, SuperAdminGuard)
  desactivarUsuario(@Param('id') tenantId: string, @Param('userId') id: string, @Req() req: Request & { user: { sub: string } }) {
    return this.superAdminService.desactivarUsuarioNegocio(tenantId, id, req.user.sub);
  }
  @Get('tenants/:id/sucursales')
  @UseGuards(JwtAuthGuard, SuperAdminGuard)
  sucursales(@Param('id') id: string) { return this.superAdminService.sucursalesNegocio(id); }
  @Post('tenants/:id/sucursales')
  @UseGuards(JwtAuthGuard, SuperAdminGuard)
  crearSucursal(@Param('id') id: string, @Body() dto: SucursalDto, @Req() req: Request & { user: { sub: string } }) {
    return this.superAdminService.guardarSucursal(id, undefined, dto, req.user.sub);
  }
  @Patch('tenants/:id/sucursales/:sucursalId')
  @UseGuards(JwtAuthGuard, SuperAdminGuard)
  editarSucursal(@Param('id') id: string, @Param('sucursalId') sucursalId: string, @Body() dto: EditarSucursalDto, @Req() req: Request & { user: { sub: string } }) {
    return this.superAdminService.guardarSucursal(id, sucursalId, dto, req.user.sub);
  }
  @Delete('tenants/:id/sucursales/:sucursalId')
  @UseGuards(JwtAuthGuard, SuperAdminGuard)
  desactivarSucursal(@Param('id') id: string, @Param('sucursalId') sucursalId: string, @Req() req: Request & { user: { sub: string } }) {
    return this.superAdminService.guardarSucursal(id, sucursalId, { activa: false }, req.user.sub);
  }
  @Get('auditoria')
  @UseGuards(JwtAuthGuard, SuperAdminGuard)
  auditoriaPlataforma() { return this.superAdminService.auditoriaPlataforma(); }

  @Post('support/finalizar')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @PermiteSoporteSoloLectura()
  async finalizarSoporte(@Req() req: Request & { user: { sub: string; tenantId?: string; impersonatedBy?: string; soporteSesionId?: string; sid?: string; readOnly?: boolean } }) {
    return this.superAdminService.finalizarSoporte(req.user);
  }

  @Get('soporte/trazas')
  @UseGuards(JwtAuthGuard, SuperAdminGuard)
  async trazaSoporte(@Query('tenantId') tenantId?: string, @Query('limite') limite?: string) {
    return this.superAdminService.trazaSoporte(tenantId || undefined, Number(limite) || 100);
  }

  @Post('tenants')
  @UseGuards(JwtAuthGuard, SuperAdminGuard)
  async createTenant(
    @Body()
    dto: {
      nombreComercial: string;
      direccion?: string;
      telefono?: string;
      email?: string;
      adminNombre: string;
      adminEmail: string;
      adminPassword: string;
      colorPrimario?: string;
    },
    @Req() req: Request & { user: { sub: string } },
  ) {
    return this.superAdminService.createTenant(dto, req.user.sub);
  }

  @Patch('tenants/:id/status')
  @UseGuards(JwtAuthGuard, SuperAdminGuard)
  async toggleTenantStatus(
    @Param('id') id: string,
    @Body() body: { estado: 'ACTIVO' | 'SUSPENDIDO' },
    @Req() req: Request & { user: { sub: string } },
  ) {
    return this.superAdminService.toggleTenantStatus(id, body.estado, req.user.sub);
  }

  @Get('tenants/:id/modules')
  @UseGuards(JwtAuthGuard, SuperAdminGuard)
  async getTenantModules(@Param('id') id: string) {
    return this.superAdminService.getTenantModules(id);
  }

  @Put('tenants/:id/modules')
  @UseGuards(JwtAuthGuard, SuperAdminGuard)
  async updateTenantModules(
    @Param('id') id: string,
    @Body() body: { modules: { moduleKey: string; enabled: boolean }[] },
    @Req() req: Request & { user: { sub: string } },
  ) {
    return this.superAdminService.updateTenantModules(id, body.modules, req.user.sub);
  }

  @Post('tenants/:tenantId/admins')
  @UseGuards(JwtAuthGuard, SuperAdminGuard)
  createTenantAdmin(@Param('tenantId') tenantId: string, @Body() dto: CreateTenantAdminDto, @Req() req: Request & { user: { sub: string } }) {
    return this.superAdminService.createTenantAdmin(tenantId, dto, req.user.sub);
  }

  @Patch('tenants/:tenantId/admins/:userId')
  @UseGuards(JwtAuthGuard, SuperAdminGuard)
  updateTenantAdmin(@Param('tenantId') tenantId: string, @Param('userId') userId: string, @Body() dto: UpdateTenantAdminDto, @Req() req: Request & { user: { sub: string } }) {
    return this.superAdminService.updateTenantAdmin(tenantId, userId, dto, req.user.sub);
  }

  /** Configuración del negocio seleccionado. Solo SUPERADMIN; el negocio no tiene acceso a esta ruta. */
  @Get('tenants/:id/settings')
  @UseGuards(JwtAuthGuard, SuperAdminGuard)
  async getTenantSettingsAdmin(@Param('id') id: string) {
    return this.superAdminService.configuracionNegocio(id);
  }

  @Put('tenants/:id/settings')
  @UseGuards(JwtAuthGuard, SuperAdminGuard)
  async updateTenantSettingsAdmin(
    @Param('id') id: string,
    @Req() req: Request & { user: { sub: string } },
    @Body()
    body: {
      nombreComercial?: string;
      direccion?: string;
      telefono?: string;
      email?: string;
      colorPrimario?: string;
      modoNavegacion?: 'SIDEBAR' | 'TOPNAV';
      configuracion?: Record<string, any>;
    },
  ) {
    return this.superAdminService.actualizarConfiguracionNegocio(id, req.user.sub, body);
  }

  @Get('tenants/:id/auditoria')
  @UseGuards(JwtAuthGuard, SuperAdminGuard)
  async auditoriaNegocio(@Param('id') id: string, @Query('page') page?: string) {
    return this.superAdminService.auditoriaNegocio(id, Number(page));
  }

  @Get('tenants/:id/logo')
  @UseGuards(JwtAuthGuard, SuperAdminGuard)
  async getTenantLogoAdmin(@Param('id') id: string, @Res({ passthrough: true }) res: Response) {
    const logotipo = await this.superAdminService.logotipoNegocio(id);
    if (!logotipo) throw new NotFoundException('El negocio no tiene logotipo');
    res.setHeader('Cache-Control', 'no-store, private');
    return new StreamableFile(logotipo.datos, { type: logotipo.mime });
  }

  @Post('tenants/:id/logo')
  @UseGuards(JwtAuthGuard, SuperAdminGuard)
  @UseInterceptors(FileInterceptor('archivo', { storage: memoryStorage(), limits: { fileSize: LIMITE_LOGOTIPO_BYTES, files: 1 } }))
  async uploadTenantLogo(@Param('id') id: string, @Req() req: Request & { user: { sub: string } }, @UploadedFile() archivo?: { buffer: Buffer; mimetype?: string }) {
    if (!archivo?.buffer) throw new BadRequestException('Seleccione un archivo de logotipo (PNG, JPG o WEBP)');
    return this.superAdminService.guardarLogotipoNegocio(id, req.user.sub, archivo.buffer, archivo.mimetype);
  }

  @Delete('tenants/:id/logo')
  @UseGuards(JwtAuthGuard, SuperAdminGuard)
  async deleteTenantLogo(@Param('id') id: string, @Req() req: Request & { user: { sub: string } }) {
    await this.superAdminService.eliminarLogotipoNegocio(id, req.user.sub);
    return { eliminado: true };
  }

  @Patch('tenants/:id')
  @UseGuards(JwtAuthGuard, SuperAdminGuard)
  async updateTenantConfig(
    @Param('id') id: string,
    @Req() req: Request & { user: { sub: string } },
    @Body()
    body: {
      nombreComercial?: string;
      direccion?: string;
      telefono?: string;
      email?: string;
      colorPrimario?: string;
      logoUrl?: string;
      modoNavegacion?: 'SIDEBAR' | 'TOPNAV';
      plan?: string;
    },
  ) {
    return this.superAdminService.updateTenantConfig(id, req.user.sub, body);
  }
}
