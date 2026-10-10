import { CORE_TENANT_MODULES, DEFAULT_TENANT_MODULES, enabledTenantModules } from '../common/tenant-modules';
import { lockTenant } from '../operaciones/ledger';
import { CreateTenantAdminDto, UpdateTenantAdminDto } from './tenant-admin.dto';
import { Injectable, UnauthorizedException, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import type { Request, Response } from 'express';
import { leerConfiguracionAuth } from '../auth/auth-config';
import { clavesDeLogin, excepcionLimiteLogin, registrarExitoLogin, registrarFalloLogin, segundosBloqueados } from '../auth/login-rate-limit';
import { crearSesion, revocarSesion, revocarSesionesDeSujeto, sesionVigente, sidDeToken } from '../auth/sesiones-auth';

const bearerDe = (req?: Request) => req?.headers?.authorization?.replace(/^Bearer /, '') || undefined;

@Injectable()
export class SuperAdminService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {}

  // Mismo límite de intentos que el login de tenants (por cuenta y por IP).
  async login(loginDto: { email: string; password: string }, res: Response, req?: Request) {
    const claves = clavesDeLogin(loginDto?.email, req?.ip);
    const segundos = await segundosBloqueados(this.prisma, claves);
    if (segundos > 0) {
      res.setHeader('Retry-After', String(segundos));
      throw excepcionLimiteLogin(segundos);
    }
    try {
      const resultado = await this.autenticar(loginDto, res);
      await registrarExitoLogin(this.prisma, claves);
      return resultado;
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        await registrarFalloLogin(this.prisma, claves, leerConfiguracionAuth(this.configService));
      }
      throw error;
    }
  }

  private expiracionRefresh(refreshToken: string): Date {
    const decoded = this.jwtService.decode(refreshToken) as { exp?: number } | null;
    return new Date((decoded?.exp ?? 0) * 1000);
  }

  private async autenticar(loginDto: { email: string; password: string }, res: Response) {
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
    const sid = randomUUID();
    const payload = {
      sub: admin.id,
      email: admin.email,
      rol: 'SUPER_ADMIN',
      type: 'super_admin',
      sid,
    };
    const accessToken = this.jwtService.sign(payload, {
      expiresIn: this.configService.get('JWT_ACCESS_EXPIRES_IN', '15m') as any,
    });
    const refreshToken = this.jwtService.sign({ ...payload, typ: 'refresh' }, {
      expiresIn: this.configService.get('JWT_REFRESH_EXPIRES_IN', '7d') as any,
    });
    await crearSesion(this.prisma, { id: sid, tipo: 'SUPER_ADMIN', sujetoId: admin.id, expiresAt: this.expiracionRefresh(refreshToken) });
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
    if (decoded.typ !== 'refresh' || decoded.type !== 'super_admin' || decoded.rol !== 'SUPER_ADMIN' || !decoded.sub) {
      res.clearCookie('superAdminRefreshToken', { path: '/api/admin/auth' });
      throw new UnauthorizedException('Refresh token de Super Admin inválido');
    }
    if (!decoded.sid || !(await sesionVigente(this.prisma, String(decoded.sid), String(decoded.sub)))) {
      res.clearCookie('superAdminRefreshToken', { path: '/api/admin/auth' });
      throw new UnauthorizedException('Sesión de Super Admin cerrada o vencida');
    }
    const admin = await this.prisma.superAdmin.findUnique({ where: { id: decoded.sub } });
    if (!admin || !admin.activo) {
      res.clearCookie('superAdminRefreshToken', { path: '/api/admin/auth' });
      throw new UnauthorizedException('Super Admin no autorizado');
    }
    const accessToken = this.jwtService.sign(
      { sub: admin.id, email: admin.email, rol: 'SUPER_ADMIN', type: 'super_admin', sid: decoded.sid },
      { expiresIn: this.configService.get('JWT_ACCESS_EXPIRES_IN', '15m') as any },
    );
    return { accessToken };
  }

  async logout(res: Response, req?: Request) {
    res.clearCookie('superAdminRefreshToken', { path: '/admin' });
    res.clearCookie('superAdminRefreshToken', { path: '/api/admin/auth' });
    const sids = new Set([sidDeToken(this.jwtService, req?.cookies?.superAdminRefreshToken), sidDeToken(this.jwtService, bearerDe(req))]);
    for (const sid of sids) {
      if (sid) await revocarSesion(this.prisma, sid, 'LOGOUT');
    }
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

  async supportToken(adminId: string, tenantId: string, usuarioId: string, readOnly = true, autorizacion: { motivo: string; confirmarEscritura?: boolean } = { motivo: '' }) {
    const motivo = autorizacion.motivo?.trim() ?? '';
    if (motivo.length < 10) throw new BadRequestException('Indique el motivo del acceso de soporte (mínimo 10 caracteres)');
    if (!readOnly && autorizacion.confirmarEscritura !== true) throw new ForbiddenException('El modo de escritura requiere autorización explícita');
    const admin = await this.prisma.superAdmin.findUnique({ where: { id: adminId } });
    if (!admin?.activo) throw new UnauthorizedException('Super Admin no autorizado');
    const usuario = await this.prisma.usuario.findFirst({
      where: { id: usuarioId, tenantId, activo: true },
      include: { tenant: true },
    });
    if (!usuario || usuario.tenant.estado !== 'ACTIVO') {
      throw new NotFoundException('Usuario o ferretería no disponible para soporte');
    }
    const soporteSesionId = randomUUID();
    const expiraEn = readOnly ? 15 : 10; // mínimo privilegio: la escritura dura menos
    // Auditoría durable antes de emitir el token: si no se puede registrar, no hay acceso de soporte.
    await this.prisma.auditoriaOperacion.create({
      data: {
        tenantId, usuarioId: usuario.id, operacion: 'SOPORTE_IMPERSONAR', entidadId: usuario.id,
        datos: { superAdminId: adminId, superAdminEmail: admin.email, usuarioEmail: usuario.email, rol: usuario.rol, readOnly, motivo, soporteSesionId, habilitadoEn: new Date().toISOString(), expiraEnMinutos: expiraEn },
      },
    });
    const sid = randomUUID();
    await crearSesion(this.prisma, { id: sid, tipo: 'SOPORTE', sujetoId: usuario.id, tenantId, expiresAt: new Date(Date.now() + expiraEn * 60_000) });
    return {
      accessToken: this.jwtService.sign({
        sub: usuario.id, tenantId, email: usuario.email, rol: usuario.rol,
        type: 'tenant', impersonatedBy: adminId, soporteSesionId, readOnly, sid,
      }, { expiresIn: `${expiraEn}m` }),
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
      const actualizado = await tx.usuario.update({ where: { id: userId }, data: { ...(dto.nombre !== undefined && { nombre: dto.nombre.trim() }), ...(email !== undefined && { email }), ...(dto.activo !== undefined && { activo: dto.activo }), ...(passwordHash && { passwordHash }) }, select: { id: true, tenantId: true, nombre: true, email: true, activo: true, rol: true, createdAt: true } });
      // Cambio de contraseña o desactivación: las sesiones abiertas del administrador dejan de valer.
      if (passwordHash || dto.activo === false) await revocarSesionesDeSujeto(tx, userId, passwordHash ? 'CAMBIO_CONTRASEÑA' : 'USUARIO_DESACTIVADO');
      return actualizado;
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
