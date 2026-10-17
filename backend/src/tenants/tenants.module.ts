import { PrismaService } from '../prisma/prisma.service';
import { Module } from '@nestjs/common';
import { TenantsService } from './tenants.service';
import { TenantsController } from './tenants.controller';
import { TenantLogoService } from './tenant-logo.service';
import { LOGOTIPO_ALMACEN, crearAlmacenLogotipo } from './logotipo-almacen';

@Module({
  controllers: [TenantsController],
  providers: [
    TenantsService,
    TenantLogoService,
    // PostgreSQL persistente por defecto; se mantienen los proveedores explícitos.
    { provide: LOGOTIPO_ALMACEN, inject: [PrismaService], useFactory: (prisma: PrismaService) => crearAlmacenLogotipo(process.env, prisma) },
  ],
  exports: [TenantsService, TenantLogoService],
})
export class TenantsModule {}
