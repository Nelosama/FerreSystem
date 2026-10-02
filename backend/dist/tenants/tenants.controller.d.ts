import { TenantsService } from './tenants.service';
export declare class TenantsController {
    private readonly tenantsService;
    constructor(tenantsService: TenantsService);
    getSettings(tenantId: string): Promise<{
        modulosHabilitados: string[];
        modulos: {
            id: string;
            tenantId: string;
            moduleKey: string;
            enabled: boolean;
            createdAt: Date;
            updatedAt: Date;
        }[];
        id: string;
        createdAt: Date;
        updatedAt: Date;
        email: string | null;
        nombreComercial: string;
        direccion: string | null;
        telefono: string | null;
        logoUrl: string | null;
        colorPrimario: string;
        modoNavegacion: import(".prisma/client").$Enums.ModoNavegacion;
        plan: string;
        estado: import(".prisma/client").$Enums.EstadoTenant;
    }>;
    updateSettings(tenantId: string, body: {
        nombreComercial?: string;
        direccion?: string;
        telefono?: string;
        email?: string;
        colorPrimario?: string;
        logoUrl?: string;
    }): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        email: string | null;
        nombreComercial: string;
        direccion: string | null;
        telefono: string | null;
        logoUrl: string | null;
        colorPrimario: string;
        modoNavegacion: import(".prisma/client").$Enums.ModoNavegacion;
        plan: string;
        estado: import(".prisma/client").$Enums.EstadoTenant;
    }>;
}
