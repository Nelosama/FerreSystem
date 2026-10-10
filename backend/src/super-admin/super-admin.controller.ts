import { Controller, Post, Get, Put, Patch, Body, Param, UseGuards, Req, Res, HttpCode, HttpStatus } from '@nestjs/common';
import { SuperAdminService } from './super-admin.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { SuperAdminGuard } from '../common/guards/super-admin.guard';
import type { Request, Response } from 'express';
import { CreateTenantAdminDto, UpdateTenantAdminDto } from './tenant-admin.dto';
import { SupportTokenDto } from './support-token.dto';

@Controller('admin')
export class SuperAdminController {
  constructor(private readonly superAdminService: SuperAdminService) {}

  @Post('auth/login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() loginDto: { email: string; password: string },
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.superAdminService.login(loginDto, res, req);
  }

  @Post('auth/refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return this.superAdminService.refresh(req.cookies?.superAdminRefreshToken, res);
  }

  @Post('auth/logout')
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
  ) {
    return this.superAdminService.createTenant(dto);
  }

  @Patch('tenants/:id/status')
  @UseGuards(JwtAuthGuard, SuperAdminGuard)
  async toggleTenantStatus(
    @Param('id') id: string,
    @Body() body: { estado: 'ACTIVO' | 'SUSPENDIDO' },
  ) {
    return this.superAdminService.toggleTenantStatus(id, body.estado);
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
  ) {
    return this.superAdminService.updateTenantModules(id, body.modules);
  }

  @Post('tenants/:tenantId/admins')
  @UseGuards(JwtAuthGuard, SuperAdminGuard)
  createTenantAdmin(@Param('tenantId') tenantId: string, @Body() dto: CreateTenantAdminDto) {
    return this.superAdminService.createTenantAdmin(tenantId, dto);
  }

  @Patch('tenants/:tenantId/admins/:userId')
  @UseGuards(JwtAuthGuard, SuperAdminGuard)
  updateTenantAdmin(@Param('tenantId') tenantId: string, @Param('userId') userId: string, @Body() dto: UpdateTenantAdminDto) {
    return this.superAdminService.updateTenantAdmin(tenantId, userId, dto);
  }

  @Patch('tenants/:id')
  @UseGuards(JwtAuthGuard, SuperAdminGuard)
  async updateTenantConfig(
    @Param('id') id: string,
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
    return this.superAdminService.updateTenantConfig(id, body);
  }
}
