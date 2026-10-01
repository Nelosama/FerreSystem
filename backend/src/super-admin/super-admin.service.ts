import { Injectable, UnauthorizedException, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import type { Response } from 'express';

@Injectable()
export class SuperAdminService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {}

<<<<<<< Updated upstream
  async login(loginDto: { email: string; password: string }, res: Response) {
    const { email, password } = loginDto;

    const admin = await this.prisma.superAdmin.findUnique({
      where: { email: email.toLowerCase().trim() },
    });

    if (!admin || !admin.activo) {
      throw new UnauthorizedException('Credenciales de Super Admin inválidas');
    }

    const passwordValido = await bcrypt.compare(password, admin.passwordHash);
    if (!passwordValido) {
      throw new UnauthorizedException('Credenciales de Super Admin inválidas');
    }

    const payload = {
      sub: admin.id,
      email: admin.email,
      rol: 'SUPER_ADMIN',
      type: 'super_admin',
    };

    const accessToken = this.jwtService.sign(payload, {
      expiresIn: this.configService.get('JWT_ACCESS_EXPIRES_IN', '15m') as any,
    });

    const refreshToken = this.jwtService.sign(payload, {
      expiresIn: this.configService.get('JWT_REFRESH_EXPIRES_IN', '7d') as any,
    });

    const isProduction = this.configService.get('NODE_ENV') === 'production';
    res.cookie('superAdminRefreshToken', refreshToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: '/admin',
    });

    return {
      accessToken,
      superAdmin: {
        id: admin.id,
        nombre: admin.nombre,
        email: admin.email,
      },
    };
=======
  async refresh(refreshToken: string | undefined, res: Response) {
    if (!refreshToken) {
      throw new UnauthorizedException('No se encontró el refresh token de Super Admin');
    }

    let decoded: any;
    try {
      decoded = this.jwtService.verify(refreshToken);
    } catch {
      res.clearCookie('superAdminRefreshToken', { path: '/api/admin/auth' });
      throw new UnauthorizedException('Refresh token de Super Admin expirado o inválido');
    }

    if (decoded.type !== 'super_admin' || decoded.rol !== 'SUPER_ADMIN' || !decoded.sub) {
      res.clearCookie('superAdminRefreshToken', { path: '/api/admin/auth' });
      throw new UnauthorizedException('Refresh token de Super Admin inválido');
    }

    const admin = await this.prisma.superAdmin.findUnique({ where: { id: decoded.sub } });
    if (!admin || !admin.activo) {
      res.clearCookie('superAdminRefreshToken', { path: '/api/admin/auth' });
      throw new UnauthorizedException('Super Admin no autorizado');
    }

    const accessToken = this.jwtService.sign(
      { sub: admin.id, email: admin.email, rol: 'SUPER_ADMIN', type: 'super_admin' },
      { expiresIn: this.configService.get('JWT_ACCESS_EXPIRES_IN', '15m') as any },
    );
    return { accessToken };
  }

  logout(res: Response) {
    res.clearCookie('superAdminRefreshToken', { path: '/api/admin/auth' });
    return { success: true, message: 'Sesión de Super Admin cerrada correctamente' };
>>>>>>> Stashed changes
  }

  async listTenants() {
    const tenants = await this.prisma.tenant.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        modulos: true,
        _count: {
          select: {
            usuarios: true,
            productos: true,
            ventas: true,
          },
        },
      },
    });

    return tenants.map((t) => ({
      id: t.id,
      nombreComercial: t.nombreComercial,
      direccion: t.direccion,
      telefono: t.telefono,
      email: t.email,
      logoUrl: t.logoUrl,
      colorPrimario: t.colorPrimario,
      modoNavegacion: t.modoNavegacion,
      plan: t.plan,
      estado: t.estado,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
      cantidadUsuarios: t._count.usuarios,
      cantidadProductos: t._count.productos,
      cantidadVentas: t._count.ventas,
      modulosHabilitados: t.modulos.filter((m) => m.enabled).map((m) => m.moduleKey),
    }));
  }

  async getTenantModules(tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      include: { modulos: true },
    });

    if (!tenant) {
      throw new NotFoundException('Ferretería no encontrada');
    }

    return tenant.modulos;
  }

  async updateTenantModules(tenantId: string, modules: { moduleKey: string; enabled: boolean }[]) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
    });

    if (!tenant) {
      throw new NotFoundException('Ferretería no encontrada');
    }

    return this.prisma.$transaction(async (tx) => {
      for (const item of modules) {
        await tx.tenantModule.upsert({
          where: {
            tenantId_moduleKey: {
              tenantId,
              moduleKey: item.moduleKey,
            },
          },
          update: { enabled: item.enabled },
          create: {
            tenantId,
            moduleKey: item.moduleKey,
            enabled: item.enabled,
          },
        });
      }

      const updatedModules = await tx.tenantModule.findMany({
        where: { tenantId },
      });

      return updatedModules;
    });
  }

  async updateTenantConfig(
    tenantId: string,
    dto: {
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
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
    });

    if (!tenant) {
      throw new NotFoundException('Ferretería no encontrada');
    }

    return this.prisma.tenant.update({
      where: { id: tenantId },
      data: {
        ...(dto.nombreComercial ? { nombreComercial: dto.nombreComercial } : {}),
        ...(dto.direccion !== undefined ? { direccion: dto.direccion } : {}),
        ...(dto.telefono !== undefined ? { telefono: dto.telefono } : {}),
        ...(dto.email !== undefined ? { email: dto.email } : {}),
        ...(dto.colorPrimario ? { colorPrimario: dto.colorPrimario } : {}),
        ...(dto.logoUrl !== undefined ? { logoUrl: dto.logoUrl } : {}),
        ...(dto.modoNavegacion ? { modoNavegacion: dto.modoNavegacion } : {}),
        ...(dto.plan ? { plan: dto.plan } : {}),
      },
    });
  }

  async createTenant(dto: {
    nombreComercial: string;
    direccion?: string;
    telefono?: string;
    email?: string;
    adminNombre: string;
    adminEmail: string;
    adminPassword: string;
    colorPrimario?: string;
  }) {
    const emailNormalizado = dto.adminEmail.toLowerCase().trim();

    // Iniciar transacción de base de datos
    return this.prisma.$transaction(async (tx) => {
      // 1. Crear el tenant
      const tenant = await tx.tenant.create({
        data: {
          nombreComercial: dto.nombreComercial,
          direccion: dto.direccion,
          telefono: dto.telefono,
          email: dto.email,
          colorPrimario: dto.colorPrimario || '#EA580C',
        },
      });

      // 2. Crear las secuencias transaccionales iniciales para ventas y cotizaciones
      await tx.secuenciaTenant.createMany({
        data: [
          { tenantId: tenant.id, tipo: 'VENTA', ultimoNumero: 0 },
          { tenantId: tenant.id, tipo: 'COTIZACION', ultimoNumero: 0 },
        ],
      });

      // 3. Crear los módulos por defecto asignados al nuevo tenant
      const defaultModules = [
        'pos',
        'cotizaciones',
        'pedidos_especiales',
        'apartados',
        'inventario',
        'ordenes_compra',
        'transferencias_sucursal',
        'garantias',
        'listas_precio',
        'usuarios',
        'comisiones_venta',
        'arqueo_caja',
        'reportes',
        'configuracion',
      ];

      await tx.tenantModule.createMany({
        data: defaultModules.map((moduleKey) => ({
          tenantId: tenant.id,
          moduleKey,
          enabled: true,
        })),
      });

      // 3. Crear el usuario Administrador del tenant
      const passwordHash = await bcrypt.hash(dto.adminPassword, 10);
      const adminUsuario = await tx.usuario.create({
        data: {
          tenantId: tenant.id,
          nombre: dto.adminNombre,
          email: emailNormalizado,
          passwordHash,
          rol: 'ADMIN',
          activo: true,
        },
      });

      return {
        tenant,
        adminUsuario: {
          id: adminUsuario.id,
          nombre: adminUsuario.nombre,
          email: adminUsuario.email,
          rol: adminUsuario.rol,
        },
      };
    });
  }

  async toggleTenantStatus(tenantId: string, estado: 'ACTIVO' | 'SUSPENDIDO') {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
    });

    if (!tenant) {
      throw new NotFoundException('Ferretería no encontrada');
    }

    return this.prisma.tenant.update({
      where: { id: tenantId },
      data: { estado },
    });
  }
}
