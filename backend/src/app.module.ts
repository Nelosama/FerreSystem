import { BackupStatusController } from './common/backup-status.controller';
import { SupportAuditInterceptor } from './common/interceptors/support-audit.interceptor';
import { HealthController } from './common/health.controller';
import { OperacionesModule } from './operaciones/operaciones.module';
import { EntregasModule } from './entregas/entregas.module';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { CashierResponseInterceptor } from './common/interceptors/cashier-response.interceptor';
import { PrismaModule } from './prisma/prisma.module';
import { TenantModuleGuard } from './common/guards/tenant-module.guard';
import { AuthModule } from './auth/auth.module';
import { SuperAdminModule } from './super-admin/super-admin.module';
import { TenantsModule } from './tenants/tenants.module';
import { ProductosModule } from './productos/productos.module';
import { ClientesModule } from './clientes/clientes.module';
import { VentasModule } from './ventas/ventas.module';
import { CotizacionesModule } from './cotizaciones/cotizaciones.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { UsuariosModule } from './usuarios/usuarios.module';
import { LevantamientosModule } from './levantamientos/levantamientos.module';
import { ProveedoresModule } from './proveedores/proveedores.module';
import { GarantiasModule } from './garantias/garantias.module';
import { ContingenciaModule } from './contingencia/contingencia.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '.env.local'],
    }),
    PrismaModule,
    AuthModule,
    SuperAdminModule,
    TenantsModule,
    ProductosModule,
    ClientesModule,
    VentasModule,
    CotizacionesModule,
    DashboardModule,
    UsuariosModule,
    LevantamientosModule,
    OperacionesModule,
    EntregasModule,
    ProveedoresModule,
    GarantiasModule,
    ContingenciaModule,
  ],
  controllers: [HealthController, BackupStatusController],
  providers: [
    { provide: APP_INTERCEPTOR, useClass: SupportAuditInterceptor },
    { provide: APP_INTERCEPTOR, useClass: CashierResponseInterceptor },
    {
      provide: APP_GUARD,
      useClass: TenantModuleGuard,
    },
  ],
})
export class AppModule {}

