import { PrismaService } from '../prisma/prisma.service';
import { CreateClienteDto, UpdateClienteDto } from './dto/create-cliente.dto';
export declare class ClientesService {
    private prisma;
    constructor(prisma: PrismaService);
    findAll(tenantId: string, search?: string): Promise<{
        id: string;
        tenantId: string;
        createdAt: Date;
        updatedAt: Date;
        email: string | null;
        nombre: string;
        direccion: string | null;
        telefono: string | null;
        rtn: string | null;
        tipo: import(".prisma/client").$Enums.TipoCliente;
    }[]>;
    findById(tenantId: string, id: string): Promise<{
        id: string;
        tenantId: string;
        createdAt: Date;
        updatedAt: Date;
        email: string | null;
        nombre: string;
        direccion: string | null;
        telefono: string | null;
        rtn: string | null;
        tipo: import(".prisma/client").$Enums.TipoCliente;
    }>;
    create(tenantId: string, dto: CreateClienteDto): Promise<{
        id: string;
        tenantId: string;
        createdAt: Date;
        updatedAt: Date;
        email: string | null;
        nombre: string;
        direccion: string | null;
        telefono: string | null;
        rtn: string | null;
        tipo: import(".prisma/client").$Enums.TipoCliente;
    }>;
    update(tenantId: string, id: string, dto: UpdateClienteDto): Promise<{
        id: string;
        tenantId: string;
        createdAt: Date;
        updatedAt: Date;
        email: string | null;
        nombre: string;
        direccion: string | null;
        telefono: string | null;
        rtn: string | null;
        tipo: import(".prisma/client").$Enums.TipoCliente;
    }>;
    delete(tenantId: string, id: string): Promise<{
        success: boolean;
        count: number;
    }>;
}
