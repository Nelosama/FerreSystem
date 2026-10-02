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
        accessToken: string;
        superAdmin: {
            id: string;
            nombre: string;
            email: string;
        };
    }>;
    refresh(refreshToken: string | undefined, res: Response): Promise<{
        accessToken: string;
    }>;
    logout(res: Response): {
        success: boolean;
        message: string;
    };
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
    getTenantModules(tenantId: string): Promise<{
        id: string;
        tenantId: string;
        moduleKey: string;
        enabled: boolean;
        createdAt: Date;
        updatedAt: Date;
    }[]>;
    updateTenantModules(tenantId: string, modules: {
        moduleKey: string;
        enabled: boolean;
    }[]): Promise<{
        id: string;
        tenantId: string;
        moduleKey: string;
        enabled: boolean;
        createdAt: Date;
        updatedAt: Date;
    }[]>;
    updateTenantConfig(tenantId: string, dto: {
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
        modulosHabilitados: string[];
        adminUsuario: {
            id: string;
            nombre: string;
            email: string;
            rol: import(".prisma/client").$Enums.Rol;
        };
    }>;
    toggleTenantStatus(tenantId: string, estado: 'ACTIVO' | 'SUSPENDIDO'): Promise<{
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
