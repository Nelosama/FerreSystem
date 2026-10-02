import { PrismaService } from '../prisma/prisma.service';
export declare class TenantsService {
    private prisma;
    constructor(prisma: PrismaService);
    getTenantSettings(tenantId: string): Promise<any>;
    updateTenantBranding(tenantId: string, data: {
        nombreComercial?: string;
        direccion?: string;
        telefono?: string;
        email?: string;
        colorPrimario?: string;
        logoUrl?: string;
    }): Promise<any>;
}
