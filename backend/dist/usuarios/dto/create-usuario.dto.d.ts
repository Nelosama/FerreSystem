import { Rol } from '@prisma/client';
export declare class CreateUsuarioDto {
    nombre: string;
    email: string;
    password: string;
    rol?: Rol;
    activo?: boolean;
}
