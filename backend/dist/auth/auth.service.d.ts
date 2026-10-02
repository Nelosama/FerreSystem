import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import type { Request, Response } from 'express';
import { LoginDto } from './dto/login.dto';
export declare class AuthService {
    private prisma;
    private jwtService;
    private configService;
    private readonly logger;
    constructor(prisma: PrismaService, jwtService: JwtService, configService: ConfigService);
    login(loginDto: LoginDto, res: Response, req?: Request): Promise<{
        type: "super_admin";
        accessToken: any;
        superAdmin: {
            id: any;
            nombre: any;
            email: any;
        };
        user?: undefined;
        tenant?: undefined;
    } | {
        type: "tenant";
        accessToken: any;
        user: {
            id: any;
            nombre: any;
            email: any;
            rol: any;
            activo: any;
        };
        tenant: {
            id: any;
            nombreComercial: any;
            logoUrl: any;
            colorPrimario: any;
            estado: any;
        };
        superAdmin?: undefined;
    }>;
    refresh(refreshToken: string | undefined, res: Response): Promise<{
        accessToken: any;
    }>;
    logout(res: Response): {
        success: boolean;
        message: string;
    };
}
