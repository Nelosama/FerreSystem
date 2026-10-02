import { Rol } from '@prisma/client';
export declare class UpdateUsuarioDto {
    nombre?: string;
    email?: string;
    password?: string;
    rol?: Rol;
    activo?: boolean;
}
