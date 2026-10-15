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
    // Configuración del almacenamiento privado; sin variables devuelve null y los endpoints responden 503.
    { provide: LOGOTIPO_ALMACEN, useFactory: () => crearAlmacenLogotipo() },
  ],
  exports: [TenantsService, TenantLogoService],
})
export class TenantsModule {}
