import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUsuarioDto } from './dto/create-usuario.dto';
import { UpdateUsuarioDto } from './dto/update-usuario.dto';
import * as bcrypt from 'bcrypt';

@Injectable()
export class UsuariosService {
  constructor(private prisma: PrismaService) {}

  async findAll(tenantId: string) {
    return this.prisma.usuario.findMany({
      where: { tenantId },
      select: {
        id: true,
        tenantId: true,
        nombre: true,
        email: true,
        rol: true,
        activo: true,
        permisos: true,
        permisosConfigurados:true,
        descuentoMaximo: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findById(tenantId: string, id: string) {
    const usuario = await this.prisma.usuario.findFirst({
      where: { id, tenantId },
      select: {
        id: true,
        tenantId: true,
        nombre: true,
        email: true,
        rol: true,
        activo: true,
        permisos: true,
        permisosConfigurados:true,
        descuentoMaximo: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!usuario) {
      throw new NotFoundException('Usuario no encontrado');
    }

    return usuario;
  }

  async create(tenantId: string, dto: CreateUsuarioDto) {
    const emailNormalized = dto.email.toLowerCase().trim();

    const existente = await this.prisma.usuario.findFirst({
      where: { tenantId, email: emailNormalized },
    });

    if (existente) {
      throw new BadRequestException('Ya existe un usuario con este correo electrónico en esta ferretería');
    }

    if (!dto.password) throw new BadRequestException('Defina una contraseña para el nuevo usuario');
    const passwordToHash = dto.password;
    const passwordHash = await bcrypt.hash(passwordToHash, 10);

    const usuario = await this.prisma.usuario.create({
      data: {
        tenantId,
        nombre: dto.nombre.trim(),
        email: emailNormalized,
        passwordHash,
        rol: dto.rol || 'CAJERO',
        permisos: dto.permisos || [],
        permisosConfigurados:dto.permisos!==undefined,
        descuentoMaximo: dto.descuentoMaximo ?? 0,
        activo: dto.activo ?? true,
      },
      select: {
        id: true,
        tenantId: true,
        nombre: true,
        email: true,
        rol: true,
        activo: true,
        permisos: true,
        permisosConfigurados:true,
        descuentoMaximo: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return usuario;
  }

  async update(tenantId: string, id: string, dto: UpdateUsuarioDto) {
    await this.findById(tenantId, id);

    const dataToUpdate: any = {};

    if (dto.nombre !== undefined) {
      dataToUpdate.nombre = dto.nombre.trim();
    }

    if (dto.email !== undefined) {
      const emailNormalized = dto.email.toLowerCase().trim();
      const existente = await this.prisma.usuario.findFirst({
        where: { tenantId, email: emailNormalized, NOT: { id } },
      });
      if (existente) {
        throw new BadRequestException('Ya existe otro usuario registrado con este correo electrónico');
      }
      dataToUpdate.email = emailNormalized;
    }

    if (dto.password) {
      dataToUpdate.passwordHash = await bcrypt.hash(dto.password, 10);
    }

    if (dto.rol !== undefined) {
      dataToUpdate.rol = dto.rol;
    }

    if (dto.permisos !== undefined) {dataToUpdate.permisos = dto.permisos;dataToUpdate.permisosConfigurados=true;}
    if (dto.descuentoMaximo !== undefined) dataToUpdate.descuentoMaximo = dto.descuentoMaximo;
    if (dto.activo !== undefined) {
      dataToUpdate.activo = dto.activo;
    }

    return this.prisma.usuario.update({
      where: { id },
      data: dataToUpdate,
      select: {
        id: true,
        tenantId: true,
        nombre: true,
        email: true,
        rol: true,
        activo: true,
        permisos: true,
        permisosConfigurados:true,
        descuentoMaximo: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async remove(tenantId: string, id: string) {
    await this.findById(tenantId, id);
    return this.prisma.usuario.update({
      data: { activo:false },
      where: { id },
      select: { id: true, nombre: true, email: true },
    });
  }
}

