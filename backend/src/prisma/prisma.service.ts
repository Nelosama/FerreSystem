import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit() {
    try {
      await this.$connect();
      this.logger.log('✅ Conexión exitosa a la base de datos PostgreSQL');
    } catch (error: any) {
      this.logger.warn('⚠️ No se pudo conectar a la base de datos PostgreSQL. El servidor funcionará en modo de reserva.');
      this.logger.warn(`   Razón: ${error.message || 'Verifique que PostgreSQL esté corriendo y DATABASE_URL sea correcta en backend/.env'}`);
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
