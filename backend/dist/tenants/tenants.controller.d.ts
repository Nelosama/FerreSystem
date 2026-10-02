import { TenantsService } from './tenants.service';
export declare class TenantsController {
    private readonly tenantsService;
    constructor(tenantsService: TenantsService);
    getSettings(tenantId: string): Promise<any>;
    updateSettings(tenantId: string, body: {
        nombreComercial?: string;
        direccion?: string;
        telefono?: string;
        email?: string;
        colorPrimario?: string;
        logoUrl?: string;
    }): Promise<any>;
}
