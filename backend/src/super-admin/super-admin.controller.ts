import { Controller, Post, Get, Put, Patch, Body, Param, UseGuards, Req, Res, HttpCode, HttpStatus } from '@nestjs/common';
import { SuperAdminService } from './super-admin.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { SuperAdminGuard } from '../common/guards/super-admin.guard';
import type { Request, Response } from 'express';
import { SupportTokenDto } from './support-token.dto';

@Controller('admin')
export class SuperAdminController {
  constructor(private readonly superAdminService: SuperAdminService) {}

  @Post('auth/login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() loginDto: { email: string; password: string },
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.superAdminService.login(loginDto, res);
  }

  @Post('auth/refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return this.superAdminService.refresh(req.cookies?.superAdminRefreshToken, res);
  }

  @Post('auth/logout')
  @HttpCode(HttpStatus.OK)
  async logout(@Res({ passthrough: true }) res: Response) {
    return this.superAdminService.logout(res);
  }


  @Get('tenants')
  @UseGuards(JwtAuthGuard, SuperAdminGuard)
  async listTenants() {
    return this.superAdminService.listTenants();
  }

  @Post('support/token')
  @UseGuards(JwtAuthGuard, SuperAdminGuard)
  async supportToken(@Req() req: Request & { user: { sub: string } }, @Body() dto: SupportTokenDto) {
    return this.superAdminService.supportToken(req.user.sub, dto.tenantId, dto.usuarioId, dto.readOnly);
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
