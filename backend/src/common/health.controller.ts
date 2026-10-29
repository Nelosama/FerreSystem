import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}
  // Liveness: el proceso responde. No consulta la base para que una caída temporal de PostgreSQL no reinicie el servicio.
  @Get('live')
  live() { return { status: 'ok' }; }
  // Readiness: el servicio puede atender peticiones (base disponible).
  @Get()
  async ready() {
    try { await this.prisma.$queryRaw`SELECT 1`; return { status: 'ok' }; }
    catch { throw new ServiceUnavailableException('Servicio temporalmente no disponible'); }
  }
}
