import { Controller, Post, Get, Patch, Body, Param, UseGuards, Res, HttpCode, HttpStatus } from '@nestjs/common';
import { SuperAdminService } from './super-admin.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { SuperAdminGuard } from '../common/guards/super-admin.guard';
import type { Response } from 'express';

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

  @Get('tenants')
  @UseGuards(JwtAuthGuard, SuperAdminGuard)
  async listTenants() {
    return this.superAdminService.listTenants();
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
}
