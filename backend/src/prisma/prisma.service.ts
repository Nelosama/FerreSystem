import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit() {
    if (process.env.NODE_ENV === 'production' && !process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL must be configured in production.');
    }

    try {
      await this.$connect();
      this.logger.log('✅ Conexión exitosa a la base de datos PostgreSQL');
    } catch (error: any) {
      this.logger.error('❌ Error crítico al conectar a PostgreSQL:', error?.stack || error?.message || error);
      if (process.env.NODE_ENV === 'production') {
        throw error;
      }
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
