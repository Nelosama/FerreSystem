import { SuperAdminService } from './super-admin.service';
import type { Request, Response } from 'express';
export declare class SuperAdminController {
    private readonly superAdminService;
    constructor(superAdminService: SuperAdminService);
    login(loginDto: {
        email: string;
        password: string;
    }, res: Response): Promise<{
        accessToken: string;
        superAdmin: {
            id: string;
            nombre: string;
            email: string;
        };
    }>;
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
    }[]>;
    createTenant(dto: {
        nombreComercial: string;
        direccion?: string;
        telefono?: string;
        email?: string;
        adminNombre: string;
        adminEmail: string;
        adminPassword: string;
        colorPrimario?: string;
    }): Promise<{
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
