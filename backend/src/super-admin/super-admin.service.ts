import { CORE_TENANT_MODULES, DEFAULT_TENANT_MODULES, enabledTenantModules } from '../common/tenant-modules';
import { lockTenant } from '../operaciones/ledger';
import { CreateTenantAdminDto, UpdateTenantAdminDto } from './tenant-admin.dto';
import { Injectable, UnauthorizedException, NotFoundException, BadRequestException } from '@nestjs/common';
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
      sameSite: isProduction ? 'none' : 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: '/api/admin/auth',
    });
    return {
      accessToken,
      superAdmin: {
        id: admin.id,
        nombre: admin.nombre,
        email: admin.email,
      },
    };
  }

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
    res.clearCookie('superAdminRefreshToken', { path: '/admin' });
    res.clearCookie('superAdminRefreshToken', { path: '/api/admin/auth' });
    return { success: true, message: 'Sesión de Super Admin cerrada correctamente' };
  }

  async listTenants() {
    const tenants = await this.prisma.tenant.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        modulos: true,
        usuarios: {
          select: { id: true, nombre: true, email: true, rol: true, activo: true, createdAt: true },
          orderBy: { createdAt: 'asc' },
        },
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
      usuarios: t.usuarios,
      cantidadProductos: t._count.productos,
      cantidadVentas: t._count.ventas,
      modulosHabilitados: enabledTenantModules(t.modulos),
    }));
  }

  async supportToken(adminId: string, tenantId: string, usuarioId: string, readOnly = true) {
    const admin = await this.prisma.superAdmin.findUnique({ where: { id: adminId } });
    if (!admin?.activo) throw new UnauthorizedException('Super Admin no autorizado');
    const usuario = await this.prisma.usuario.findFirst({
      where: { id: usuarioId, tenantId, activo: true },
      include: { tenant: true },
    });
    if (!usuario || usuario.tenant.estado !== 'ACTIVO') {
      throw new NotFoundException('Usuario o ferretería no disponible para soporte');
    }
    // Auditoría durable antes de emitir el token: si no se puede registrar, no hay acceso de soporte.
    await this.prisma.auditoriaOperacion.create({
      data: {
        tenantId, usuarioId: usuario.id, operacion: 'SOPORTE_IMPERSONAR', entidadId: usuario.id,
        datos: { superAdminId: adminId, superAdminEmail: admin.email, usuarioEmail: usuario.email, rol: usuario.rol, readOnly, expiraEnMinutos: 15 },
      },
    });
    return {
      accessToken: this.jwtService.sign({
        sub: usuario.id, tenantId, email: usuario.email, rol: usuario.rol,
        type: 'tenant', impersonatedBy: adminId, readOnly,
      }, { expiresIn: '15m' }),
      user: { id: usuario.id, nombre: usuario.nombre, email: usuario.email, rol: usuario.rol, activo: usuario.activo },
    };
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
        const enabled = CORE_TENANT_MODULES.includes(item.moduleKey) || item.enabled;
        await tx.tenantModule.upsert({
          where: {
            tenantId_moduleKey: {
              tenantId,
              moduleKey: item.moduleKey,
            },
          },
          update: { enabled },
          create: {
            tenantId,
            moduleKey: item.moduleKey,
            enabled,
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
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
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

  async createTenantAdmin(tenantId: string, dto: CreateTenantAdminDto) {
    const passwordHash = await bcrypt.hash(dto.password, 10);
    return this.prisma.$transaction(async tx => {
      await lockTenant(tx, tenantId);
      if (!await tx.tenant.findUnique({ where: { id: tenantId } })) throw new NotFoundException('Empresa no encontrada');
      const email = dto.email.trim().toLowerCase();
      if (await tx.usuario.findFirst({ where: { tenantId, email } })) throw new BadRequestException('Correo ya registrado en esta empresa');
      return tx.usuario.create({ data: { tenantId, nombre: dto.nombre.trim(), email, passwordHash, rol: 'ADMIN', activo: dto.activo ?? true }, select: { id: true, tenantId: true, nombre: true, email: true, activo: true, rol: true, createdAt: true } });
    });
  }

  async updateTenantAdmin(tenantId: string, userId: string, dto: UpdateTenantAdminDto) {
    const passwordHash = dto.password ? await bcrypt.hash(dto.password, 10) : undefined;
    return this.prisma.$transaction(async tx => {
      await lockTenant(tx, tenantId);
      const current = await tx.usuario.findFirst({ where: { id: userId, tenantId, rol: 'ADMIN' } });
      if (!current) throw new NotFoundException('Administrador no encontrado en esta empresa');
      if (current.activo && dto.activo === false && await tx.usuario.count({ where: { tenantId, rol: 'ADMIN', activo: true } }) <= 1) throw new BadRequestException('Conserve al menos un administrador activo');
      const email = dto.email?.trim().toLowerCase();
      if (email && await tx.usuario.findFirst({ where: { tenantId, email, id: { not: userId } } })) throw new BadRequestException('Correo ya registrado en esta empresa');
      return tx.usuario.update({ where: { id: userId }, data: { ...(dto.nombre !== undefined && { nombre: dto.nombre.trim() }), ...(email !== undefined && { email }), ...(dto.activo !== undefined && { activo: dto.activo }), ...(passwordHash && { passwordHash }) }, select: { id: true, tenantId: true, nombre: true, email: true, activo: true, rol: true, createdAt: true } });
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
    return this.prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({
        data: {
          nombreComercial: dto.nombreComercial,
          direccion: dto.direccion,
          telefono: dto.telefono,
          email: dto.email,
          colorPrimario: dto.colorPrimario || '#EA580C',
        },
      });
      await tx.secuenciaTenant.createMany({
        data: [
          { tenantId: tenant.id, tipo: 'VENTA', ultimoNumero: 0 },
          { tenantId: tenant.id, tipo: 'COTIZACION', ultimoNumero: 0 },
        ],
      });
      const defaultModules = DEFAULT_TENANT_MODULES;
      await tx.tenantModule.createMany({
        data: defaultModules.map((moduleKey) => ({
          tenantId: tenant.id,
          moduleKey,
          enabled: true,
        })),
      });
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
