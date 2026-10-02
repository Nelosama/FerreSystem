import { AuthService } from './auth.service';
import type { Request, Response } from 'express';
import { LoginDto } from './dto/login.dto';
export declare class AuthController {
    private readonly authService;
    constructor(authService: AuthService);
    login(loginDto: LoginDto, req: Request, res: Response): Promise<{
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
    refresh(req: Request, res: Response): Promise<{
        accessToken: any;
    }>;
    logout(res: Response): Promise<{
        success: boolean;
        message: string;
    }>;
    getProfile(user: any): Promise<{
        user: any;
    }>;
}
