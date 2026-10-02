import { TipoCliente } from '@prisma/client';
export declare class CreateClienteDto {
    nombre: string;
    rtn?: string;
    telefono?: string;
    email?: string;
    direccion?: string;
    tipo?: TipoCliente;
}
export declare class UpdateClienteDto {
    nombre?: string;
    rtn?: string;
    telefono?: string;
    email?: string;
    direccion?: string;
    tipo?: TipoCliente;
}
