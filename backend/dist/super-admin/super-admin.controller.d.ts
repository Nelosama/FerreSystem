import { SuperAdminService } from './super-admin.service';
import type { Response } from 'express';
export declare class SuperAdminController {
    private readonly superAdminService;
    constructor(superAdminService: SuperAdminService);
    login(loginDto: {
        email: string;
        password: string;
    }, res: Response): Promise<{
        accessToken: any;
        superAdmin: {
            id: any;
            nombre: any;
            email: any;
        };
    }>;
    listTenants(): Promise<any>;
    createTenant(dto: {
        nombreComercial: string;
        direccion?: string;
        telefono?: string;
        email?: string;
        adminNombre: string;
        adminEmail: string;
        adminPassword: string;
        colorPrimario?: string;
    }): Promise<any>;
    toggleTenantStatus(id: string, body: {
        estado: 'ACTIVO' | 'SUSPENDIDO';
    }): Promise<any>;
    getTenantModules(id: string): Promise<any>;
    updateTenantModules(id: string, body: {
        modules: {
            moduleKey: string;
            enabled: boolean;
        }[];
    }): Promise<any>;
    updateTenantConfig(id: string, body: {
        nombreComercial?: string;
        direccion?: string;
        telefono?: string;
        email?: string;
        colorPrimario?: string;
        logoUrl?: string;
        modoNavegacion?: 'SIDEBAR' | 'TOPNAV';
        plan?: string;
    }): Promise<any>;
}
