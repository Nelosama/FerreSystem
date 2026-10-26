import { AuthService } from '../auth/auth.service';
import { LoginDto } from '../auth/dto/login.dto';
import { exigirIdentificadorUnico } from '../auth/identidad-login';
import { UsuariosService } from '../usuarios/usuarios.service';
import { CreateUsuarioDto } from '../usuarios/dto/create-usuario.dto';
import { UpdateUsuarioDto } from '../usuarios/dto/update-usuario.dto';
import { EditarSucursalDto } from './sucursal.dto';
import { refreshCookieOptions } from '../auth/refresh-cookie';
import { DEFAULT_TENANT_MODULES, enabledTenantModules, moduleDependencyErrors } from '../common/tenant-modules';
import { audit, lockTenant } from '../operaciones/ledger';
import { consultarAuditoria } from '../operaciones/auditoria-consulta';
import { TenantsService } from '../tenants/tenants.service';
import { TenantLogoService } from '../tenants/tenant-logo.service';
import { CreateTenantAdminDto, UpdateTenantAdminDto } from './tenant-admin.dto';
import { Injectable, UnauthorizedException, NotFoundException, BadRequestException, ForbiddenException, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import type { Request, Response } from 'express';
import { leerConfiguracionAuth } from '../auth/auth-config';
import { crearSesion, revocarSesion, revocarSesionesDeSujeto, rotarRefresh, sidDeToken } from '../auth/sesiones-auth';
import { isPasswordAllowed, PASSWORD_POLICY_MESSAGE } from '../common/password-policy';

const bearerDe = (req?: Request) => req?.headers?.authorization?.replace(/^Bearer /, '') || undefined;

@Injectable()
export class SuperAdminService {
  private readonly logger = new Logger(SuperAdminService.name);
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private configService: ConfigService,
    private tenantsService: TenantsService,
    private tenantLogoService: TenantLogoService,
  ) {}

  async usuariosNegocio(tenantId: string) {
    await this.existeNegocio(tenantId);
    return new UsuariosService(this.prisma).findAll(tenantId);
  }
  crearUsuarioNegocio(tenantId: string, dto: CreateUsuarioDto, actor: string) {
    return new UsuariosService(this.prisma).create(tenantId, dto, actor, true);
  }
  editarUsuarioNegocio(tenantId: string, id: string, dto: UpdateUsuarioDto, actor: string) {
    return new UsuariosService(this.prisma).update(tenantId, id, dto, actor, true);
  }
  desactivarUsuarioNegocio(tenantId: string, id: string, actor: string) {
    return new UsuariosService(this.prisma).update(tenantId, id, { activo: false }, actor, true);
  }
  async sucursalesNegocio(tenantId: string) {
    await this.existeNegocio(tenantId);
    return this.prisma.sucursal.findMany({ where: { tenantId }, orderBy: { createdAt: 'asc' } });
  }
  async guardarSucursal(tenantId: string, id: string | undefined, dto: EditarSucursalDto, actor: string) {
    return this.prisma.$transaction(async tx => {
      await lockTenant(tx, tenantId);
      if (!await tx.tenant.findUnique({ where: { id: tenantId } })) throw new NotFoundException('Negocio no encontrado');
      if (id && !await tx.sucursal.findFirst({ where: { id, tenantId } })) throw new NotFoundException('Sucursal no encontrada');
      const nombre = dto.nombre?.trim();
      if (nombre && await tx.sucursal.findFirst({ where: { tenantId, nombre, ...(id && { id: { not: id } }) } })) throw new BadRequestException('Ya existe una sucursal con este nombre');
      const data = { ...(nombre !== undefined && { nombre }), ...(dto.direccion !== undefined && { direccion: dto.direccion.trim() }), ...(dto.telefono !== undefined && { telefono: dto.telefono.trim() }), ...(dto.activa !== undefined && { activa: dto.activa }) };
      const actual = id ? await tx.sucursal.update({ where: { id }, data }) : await tx.sucursal.create({ data: { ...data, nombre: nombre!, tenantId } });
      await audit(tx, tenantId, actor, id ? dto.activa === false ? 'SUCURSAL_DESACTIVAR' : 'SUCURSAL_EDITAR' : 'SUCURSAL_CREAR', actual.id, { sucursal: actual, superAdminId: actor });
      return actual;
    });
  }
  async auditoriaPlataforma() {
    return this.prisma.auditoriaOperacion.findMany({ take: 200, orderBy: { createdAt: 'desc' } });
  }

  private async existeNegocio(tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId }, select: { id: true } });
    if (!tenant) throw new NotFoundException('Ferretería no encontrada');
  }

  /** Configuración completa del negocio seleccionado (mismo servicio que usa el negocio, sin su rol). */
  async configuracionNegocio(tenantId: string) {
    await this.existeNegocio(tenantId);
    return this.tenantsService.getTenantSettings(tenantId);
  }

  async actualizarConfiguracionNegocio(tenantId: string, superAdminId: string, cambios: Parameters<TenantsService['updateTenantBranding']>[1]) {
    await this.existeNegocio(tenantId);
    const actualizado = await this.tenantsService.updateTenantBranding(tenantId, cambios, { esSuperAdmin: true });
    await audit(this.prisma as any, tenantId, superAdminId, 'CONFIGURACION_NEGOCIO_ACTUALIZAR', tenantId, { superAdminId, campos: Object.keys(cambios) });
    return actualizado;
  }

  /** Auditoría del negocio seleccionado. Solo lectura; la consulta se limita al identificador recibido. */
  async auditoriaNegocio(tenantId: string, page: number) {
    await this.existeNegocio(tenantId);
    return consultarAuditoria(this.prisma as any, tenantId, page);
  }

  logotipoNegocio(tenantId: string) {
    return this.tenantLogoService.leer(tenantId);
  }

  guardarLogotipoNegocio(tenantId: string, superAdminId: string, datos: Buffer, mime: string | undefined) {
    return this.tenantLogoService.guardar(tenantId, datos, mime, superAdminId);
  }

  eliminarLogotipoNegocio(tenantId: string, superAdminId: string) {
    return this.tenantLogoService.eliminar(tenantId, superAdminId);
  }

  // Login heredado de la plataforma: el mismo flujo que /auth/login (límites, contador por cuenta, contraseña temporal y MFA
  // obligatorio), restringido a cuentas de Super Admin. Cualquier otra cuenta falla igual que una inexistente.
  async login(loginDto: LoginDto, res: Response, req?: Request) {
    const resultado: any = await new AuthService(this.prisma, this.jwtService, this.configService).login(loginDto, res, req, { soloPlataforma: true });
    if (resultado?.type === 'super_admin') return { accessToken: resultado.accessToken, superAdmin: resultado.superAdmin };
    return resultado;
  }

  async refresh(refreshToken: string | undefined, res: Response) {
    if (!refreshToken) {
      throw new UnauthorizedException('No se encontró el refresh token de Super Admin');
    }
    let decoded: any;
    try {
      decoded = this.jwtService.verify(refreshToken);
    } catch {
      res.clearCookie('superAdminRefreshToken', refreshCookieOptions(this.configService, true));
      throw new UnauthorizedException('Refresh token de Super Admin expirado o inválido');
    }
    if (decoded.typ !== 'refresh' || decoded.type !== 'super_admin' || decoded.rol !== 'SUPER_ADMIN' || !decoded.sub) {
      res.clearCookie('superAdminRefreshToken', refreshCookieOptions(this.configService, true));
      throw new UnauthorizedException('Refresh token de Super Admin inválido');
    }
    if (!decoded.sid || decoded.mfa !== true) {
      res.clearCookie('superAdminRefreshToken', refreshCookieOptions(this.configService, true));
      throw new UnauthorizedException('Sesión de Super Admin cerrada o vencida');
    }
    const admin = await this.prisma.superAdmin.findUnique({ where: { id: decoded.sub } });
    if (!admin || !admin.activo) {
      res.clearCookie('superAdminRefreshToken', refreshCookieOptions(this.configService, true));
      throw new UnauthorizedException('Super Admin no autorizado');
    }
    // H-04: misma rotación y detección de reutilización que el refresh de negocio.
    const rotacion = await rotarRefresh(this.prisma, {
      sid: String(decoded.sid), sujetoId: String(decoded.sub), passwordHash: admin.passwordHash, jti: typeof decoded.jti === 'string' ? decoded.jti : undefined,
      graciaMs: leerConfiguracionAuth(this.configService).graciaRefreshSegundos * 1000,
    });
    if (rotacion.estado !== 'ROTADA' && rotacion.estado !== 'GRACIA') {
      if (rotacion.estado === 'REUTILIZADA') this.logger.warn(`[AUTH] Refresh de Super Admin reutilizado: sesión ${String(decoded.sid)} revocada`);
      res.clearCookie('superAdminRefreshToken', refreshCookieOptions(this.configService, true));
      throw new UnauthorizedException('Sesión de Super Admin cerrada o vencida');
    }
    const payload = { sub: admin.id, email: admin.email, rol: 'SUPER_ADMIN', type: 'super_admin', mfa: true, sid: decoded.sid };
    const accessToken = this.jwtService.sign(payload, { expiresIn: this.configService.get('JWT_ACCESS_EXPIRES_IN', '15m') as any });
    const restanteMs = rotacion.expiresAt.getTime() - Date.now();
    const nuevoRefresh = this.jwtService.sign({ ...payload, typ: 'refresh' }, { expiresIn: Math.max(1, Math.floor(restanteMs / 1000)), jwtid: rotacion.jti });
    res.cookie('superAdminRefreshToken', nuevoRefresh, { ...refreshCookieOptions(this.configService, true), maxAge: Math.max(0, restanteMs) });
    return { accessToken };
  }

  async logout(res: Response, req?: Request) {
    res.clearCookie('superAdminRefreshToken', { ...refreshCookieOptions(this.configService, true), path: '/admin' });
    res.clearCookie('superAdminRefreshToken', refreshCookieOptions(this.configService, true));
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
            sucursales: true,
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
      cantidadSucursales: t._count.sucursales,
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

  /** Usuarios reales y activos de una empresa, elegibles para soporte. Nunca devuelve hashes ni permisos internos. */
  async listSoporteUsuarios(tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId }, select: { id: true, estado: true } });
    if (!tenant) throw new NotFoundException('Ferretería no encontrada');
    const usuarios = await this.prisma.usuario.findMany({
      where: { tenantId, activo: true },
      select: { id: true, nombre: true, email: true, rol: true },
      orderBy: [{ rol: 'asc' }, { nombre: 'asc' }],
    });
    return { tenantId, estado: tenant.estado, usuarios };
  }

  /**
   * Finaliza la sesión de soporte del token presentado: revoca su `sid` (el token deja de autorizar aunque no haya vencido)
   * y deja constancia de quién la inició y cuándo terminó. Solo lo puede llamar la propia sesión de soporte.
   */
  async finalizarSoporte(usuario: { sub: string; tenantId?: string; impersonatedBy?: string; soporteSesionId?: string; sid?: string; readOnly?: boolean }) {
    if (!usuario.impersonatedBy || !usuario.soporteSesionId || !usuario.tenantId) {
      throw new ForbiddenException('Esta acción solo aplica a una sesión de soporte activa');
    }
    if (usuario.sid) await revocarSesion(this.prisma, usuario.sid, 'SOPORTE_FINALIZADO');
    await this.prisma.auditoriaOperacion.create({
      data: {
        tenantId: usuario.tenantId, usuarioId: usuario.sub, operacion: 'SOPORTE_FINALIZAR', entidadId: usuario.sub,
        datos: { superAdminId: usuario.impersonatedBy, soporteSesionId: usuario.soporteSesionId, readOnly: usuario.readOnly !== false, finalizadoEn: new Date().toISOString(), resultado: 'FINALIZADA' },
      },
    });
    return { success: true, message: 'Sesión de soporte finalizada' };
  }

  /** Trazabilidad de sesiones de soporte: inicio, fin, modo, motivo, identidad original y escrituras auditadas. */
  async trazaSoporte(tenantId?: string, limite = 100) {
    const operaciones = ['SOPORTE_IMPERSONAR', 'SOPORTE_FINALIZAR', 'SOPORTE_ESCRITURA_INICIO', 'SOPORTE_ESCRITURA_RESULTADO', 'SOPORTE_ESCRITURA_DENEGADA'];
    const filas = await this.prisma.auditoriaOperacion.findMany({
      where: { operacion: { in: operaciones }, ...(tenantId ? { tenantId } : {}) },
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(limite, 1), 200),
    });
    return filas.map((f) => {
      const datos = (f.datos ?? {}) as Record<string, any>;
      const soporte = datos._soporte ?? {};
      return {
        id: f.id,
        fecha: f.createdAt,
        operacion: f.operacion,
        tenantId: f.tenantId,
        usuarioId: f.usuarioId,
        usuarioEmail: datos.usuarioEmail ?? null,
        superAdminId: datos.superAdminId ?? soporte.superAdminId ?? null,
        superAdminEmail: datos.superAdminEmail ?? null,
        soporteSesionId: datos.soporteSesionId ?? soporte.soporteSesionId ?? null,
        modo: (datos.readOnly ?? soporte.readOnly) === false ? 'ESCRITURA' : 'SOLO_LECTURA',
        motivo: datos.motivo ?? null,
        resultado: datos.resultado ?? soporte.resultado ?? null,
        metodo: datos.metodo ?? null,
        ruta: datos.ruta ?? null,
      };
    });
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

  async updateTenantModules(tenantId: string, modules: { moduleKey: string; enabled: boolean }[], actorId?: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
    });
    if (!tenant) {
      throw new NotFoundException('Ferretería no encontrada');
    }
    if (!Array.isArray(modules) || modules.length > DEFAULT_TENANT_MODULES.length || modules.some(item => !item || !DEFAULT_TENANT_MODULES.includes(item.moduleKey) || typeof item.enabled !== 'boolean') || new Set(modules.map(item => item.moduleKey)).size !== modules.length) {
      throw new BadRequestException('Módulos inválidos: use claves del catálogo, booleanos y sin duplicados');
    }
    return this.prisma.$transaction(async (tx) => {
      await lockTenant(tx, tenantId);
      const before = await tx.tenantModule.findMany({ where: { tenantId } });
      const effective = enabledTenantModules([...modules, ...before.filter(record => !modules.some(item => item.moduleKey === record.moduleKey))]);
      const conflicts = moduleDependencyErrors(effective);
      if (conflicts.length) throw new BadRequestException(`Dependencias requeridas: ${conflicts.join(', ')}`);
      for (const item of modules) {
        const enabled = item.enabled;
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
      await tx.tenant.update({ where: { id: tenantId }, data: { updatedAt: new Date() } });
      const updatedModules = await tx.tenantModule.findMany({
        where: { tenantId },
      });
      if (actorId) await audit(tx, tenantId, actorId, 'ACTUALIZAR_SERVICIOS', tenantId, { before, modules: updatedModules, superAdminId: actorId });
      return updatedModules;
    });
  }

  async updateTenantConfig(
    tenantId: string,
    adminId: string,
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
    if (dto.logoUrl !== undefined) throw new BadRequestException('El logotipo se carga como archivo en la administración del negocio');
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) {
      throw new NotFoundException('Ferretería no encontrada');
    }
    const actualizado = await this.prisma.tenant.update({
      where: { id: tenantId },
      data: {
        ...(dto.nombreComercial ? { nombreComercial: dto.nombreComercial } : {}),
        ...(dto.direccion !== undefined ? { direccion: dto.direccion } : {}),
        ...(dto.telefono !== undefined ? { telefono: dto.telefono } : {}),
        ...(dto.email !== undefined ? { email: dto.email } : {}),
        ...(dto.colorPrimario ? { colorPrimario: dto.colorPrimario } : {}),
        ...(dto.modoNavegacion ? { modoNavegacion: dto.modoNavegacion } : {}),
        ...(dto.plan ? { plan: dto.plan } : {}),
      },
    });
    await audit(this.prisma as any, tenantId, adminId, 'NEGOCIO_ACTUALIZAR', tenantId, { superAdminId: adminId, campos: Object.keys(dto) });
    return actualizado;
  }

  async createTenantAdmin(tenantId: string, dto: CreateTenantAdminDto, actorId?: string) {
    const passwordHash = await bcrypt.hash(dto.password, 10);
    return this.prisma.$transaction(async tx => {
      await lockTenant(tx, tenantId);
      if (!await tx.tenant.findUnique({ where: { id: tenantId } })) throw new NotFoundException('Empresa no encontrada');
      const email = dto.email.trim().toLowerCase();
      if (await tx.usuario.findFirst({ where: { tenantId, email } })) throw new BadRequestException('Correo ya registrado en esta empresa');
      await exigirIdentificadorUnico(tx, { email });
      const creado = await tx.usuario.create({ data: { tenantId, nombre: dto.nombre.trim(), email, passwordHash, rol: 'ADMIN', activo: dto.activo ?? true }, select: { id: true, tenantId: true, nombre: true, email: true, activo: true, rol: true, createdAt: true } });
      if (actorId) await audit(tx, tenantId, actorId, 'USUARIO_CREAR', creado.id, { usuario: creado, superAdminId: actorId });
      return creado;
    });
  }

  async updateTenantAdmin(tenantId: string, userId: string, dto: UpdateTenantAdminDto, actorId?: string) {
    if (dto.password) throw new BadRequestException('Use el enlace privado de restablecimiento');
    const passwordHash = undefined;
    return this.prisma.$transaction(async tx => {
      await lockTenant(tx, tenantId);
      const current = await tx.usuario.findFirst({ where: { id: userId, tenantId, rol: 'ADMIN' } });
      if (!current) throw new NotFoundException('Administrador no encontrado en esta empresa');
      if (current.activo && dto.activo === false && await tx.usuario.count({ where: { tenantId, rol: 'ADMIN', activo: true } }) <= 1) throw new BadRequestException('Conserve al menos un administrador activo');
      const email = dto.email?.trim().toLowerCase();
      if (email && await tx.usuario.findFirst({ where: { tenantId, email, id: { not: userId } } })) throw new BadRequestException('Correo ya registrado en esta empresa');
      if (email && email !== current.email) await exigirIdentificadorUnico(tx, { email, excluirId: userId });
      const actualizado = await tx.usuario.update({ where: { id: userId }, data: { ...(dto.nombre !== undefined && { nombre: dto.nombre.trim() }), ...(email !== undefined && { email, emailVerifiedAt: null }), ...(dto.activo !== undefined && { activo: dto.activo }), ...(passwordHash && { passwordHash }) }, select: { id: true, tenantId: true, nombre: true, email: true, activo: true, rol: true, createdAt: true } });
      // Cambio de contraseña o desactivación: las sesiones abiertas del administrador dejan de valer.
      if (passwordHash || dto.activo === false) await revocarSesionesDeSujeto(tx, userId, passwordHash ? 'CAMBIO_CONTRASEÑA' : 'USUARIO_DESACTIVADO');
      if (actorId) await audit(tx, tenantId, actorId, dto.activo === false ? 'USUARIO_DESACTIVAR' : 'USUARIO_EDITAR', userId, { usuario: actualizado, cambioPassword: !!passwordHash, superAdminId: actorId });
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
  }, actorId?: string) {
    if (!isPasswordAllowed(dto.adminPassword)) throw new BadRequestException(PASSWORD_POLICY_MESSAGE);
    const emailNormalizado = dto.adminEmail.toLowerCase().trim();
    return this.prisma.$transaction(async (tx) => {
      await exigirIdentificadorUnico(tx, { email: emailNormalizado });
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
      if (actorId) await audit(tx, tenant.id, actorId, 'CREAR_TENANT', tenant.id, { nombreComercial: tenant.nombreComercial, adminId: adminUsuario.id, superAdminId: actorId });
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

  async toggleTenantStatus(tenantId: string, estado: 'ACTIVO' | 'SUSPENDIDO', actorId?: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
    });
    if (!tenant) {
      throw new NotFoundException('Ferretería no encontrada');
    }
    return this.prisma.$transaction(async tx => {
      await lockTenant(tx, tenantId);
      const actualizado = await tx.tenant.update({ where: { id: tenantId }, data: { estado } });
      if (actorId) await audit(tx, tenantId, actorId, 'CAMBIO_ESTADO_TENANT', tenantId, { estado, superAdminId: actorId });
      return actualizado;
    });
  }
}
