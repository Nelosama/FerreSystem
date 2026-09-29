import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
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
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: TenantModuleGuard,
    },
  ],
})
export class AppModule {}
