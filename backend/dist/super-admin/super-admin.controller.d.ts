import { SuperAdminService } from './super-admin.service';
import type { Response } from 'express';
import type { Request } from 'express';
import { CreateTenantDto } from './dto/create-tenant.dto';
export declare class SuperAdminController {
    private readonly superAdminService;
    constructor(superAdminService: SuperAdminService);
    refresh(req: Request, res: Response): Promise<{
        accessToken: string;
    }>;
    logout(res: Response): Promise<{
        success: boolean;
        message: string;
    }>;
    listTenants(): Promise<{
        id: string;
        nombreComercial: string;
        direccion: string;
        telefono: string;
        email: string;
        logoUrl: string;
        colorPrimario: string;
        modoNavegacion: import(".prisma/client").$Enums.ModoNavegacion;
        plan: string;
        estado: import(".prisma/client").$Enums.EstadoTenant;
        createdAt: Date;
        updatedAt: Date;
        cantidadUsuarios: number;
        cantidadProductos: number;
        cantidadVentas: number;
        modulosHabilitados: string[];
        usuarios: {
            id: string;
            createdAt: Date;
            email: string;
            nombre: string;
            activo: boolean;
        }[];
    }[]>;
    createTenant(dto: CreateTenantDto): Promise<{
        tenant: {
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
        };
        modulosHabilitados: string[];
        adminUsuario: {
            id: string;
            nombre: string;
            email: string;
            rol: import(".prisma/client").$Enums.Rol;
        };
    }>;
    toggleTenantStatus(id: string, body: {
        estado: 'ACTIVO' | 'SUSPENDIDO';
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
    getTenantModules(id: string): Promise<{
        id: string;
        tenantId: string;
        moduleKey: string;
        enabled: boolean;
        createdAt: Date;
        updatedAt: Date;
    }[]>;
    updateTenantModules(id: string, body: {
        modules: {
            moduleKey: string;
            enabled: boolean;
        }[];
    }): Promise<{
        id: string;
        tenantId: string;
        moduleKey: string;
        enabled: boolean;
        createdAt: Date;
        updatedAt: Date;
    }[]>;
    updateTenantConfig(id: string, body: {
        nombreComercial?: string;
        direccion?: string;
        telefono?: string;
        email?: string;
        colorPrimario?: string;
        logoUrl?: string;
        modoNavegacion?: 'SIDEBAR' | 'TOPNAV';
        plan?: string;
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
