import { PrismaService } from '../prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
export declare class SuperAdminService {
    private prisma;
    private jwtService;
    private configService;
    constructor(prisma: PrismaService, jwtService: JwtService, configService: ConfigService);
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
    getTenantModules(tenantId: string): Promise<any>;
    updateTenantModules(tenantId: string, modules: {
        moduleKey: string;
        enabled: boolean;
    }[]): Promise<any>;
    updateTenantConfig(tenantId: string, dto: {
        nombreComercial?: string;
        direccion?: string;
        telefono?: string;
        email?: string;
        colorPrimario?: string;
        logoUrl?: string;
        modoNavegacion?: 'SIDEBAR' | 'TOPNAV';
        plan?: string;
    }): Promise<any>;
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
    toggleTenantStatus(tenantId: string, estado: 'ACTIVO' | 'SUSPENDIDO'): Promise<any>;
}
