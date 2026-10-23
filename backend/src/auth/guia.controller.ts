import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Put,
  UseGuards,
} from '@nestjs/common';
import { IsIn, IsString, MaxLength } from 'class-validator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PrismaService } from '../prisma/prisma.service';

class ProgresoGuiaDto {
  @IsIn(['pending', 'active', 'dismissed', 'completed']) status: string;
  @IsString() @MaxLength(80) step: string;
}
type Identity = {
  sub: string;
  tenantId?: string;
  type?: string;
  impersonatedBy?: string;
};

/** No se acepta identidad/tenant desde el cuerpo. La guía nunca llama servicios operativos. */
@Controller('auth/guia')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN', 'CAJERO', 'VENDEDOR', 'BODEGUERO', 'SUPER_ADMIN')
export class GuiaController {
  constructor(private readonly prisma: PrismaService) {}

  private async enabled(user: Identity) {
    if (user.impersonatedBy) return false;
    if (user.type === 'super_admin') return true;
    if (user.type !== 'tenant' || !user.tenantId)
      throw new ForbiddenException();
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: user.tenantId },
      select: { configuracion: true },
    });
    return (
      (tenant?.configuracion as Record<string, unknown> | null)?.modoGuia ===
      true
    );
  }

  @Get()
  async read(@CurrentUser() user: Identity) {
    if (!(await this.enabled(user))) return { enabled: false };
    const actor =
      user.type === 'super_admin'
        ? await this.prisma.superAdmin.findUnique({
            where: { id: user.sub },
            select: { guiaProgreso: true },
          })
        : await this.prisma.usuario.findFirst({
            where: { id: user.sub, tenantId: user.tenantId },
            select: { guiaProgreso: true },
          });
    if (!actor) throw new NotFoundException();
    return { enabled: true, progress: actor.guiaProgreso };
  }

  @Put()
  async save(@CurrentUser() user: Identity, @Body() body: ProgresoGuiaDto) {
    if (!(await this.enabled(user)))
      throw new ForbiddenException('Modo Guía desactivado');
    const guiaProgreso = {
      status: body.status,
      step: body.step,
      version: 1,
      updatedAt: new Date().toISOString(),
    };
    const result =
      user.type === 'super_admin'
        ? await this.prisma.superAdmin.updateMany({
            where: { id: user.sub },
            data: { guiaProgreso },
          })
        : await this.prisma.usuario.updateMany({
            where: { id: user.sub, tenantId: user.tenantId },
            data: { guiaProgreso },
          });
    if (!result.count) throw new NotFoundException();
    return { enabled: true, progress: guiaProgreso };
  }
}
