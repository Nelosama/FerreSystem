import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit() {
    try {
      await this.$connect();
      this.logger.log('✅ Conexión exitosa a la base de datos PostgreSQL');
    } catch {
      this.logger.error('❌ Error crítico al conectar a PostgreSQL');
    }
  }

  async onModuleDestroy() {
    try {
      await this.$disconnect();
    } catch {
      // Ignorar errores al desconectar si no había conexión previa
    }
  }
}
