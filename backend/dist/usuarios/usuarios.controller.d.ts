import { UsuariosService } from './usuarios.service';
import { CreateUsuarioDto } from './dto/create-usuario.dto';
import { UpdateUsuarioDto } from './dto/update-usuario.dto';
export declare class UsuariosController {
    private readonly usuariosService;
    constructor(usuariosService: UsuariosService);
    findAll(tenantId: string): Promise<{
        id: string;
        tenantId: string;
        createdAt: Date;
        updatedAt: Date;
        email: string;
        nombre: string;
        activo: boolean;
        rol: import(".prisma/client").$Enums.Rol;
    }[]>;
    findById(tenantId: string, id: string): Promise<{
        id: string;
        tenantId: string;
        createdAt: Date;
        updatedAt: Date;
        email: string;
        nombre: string;
        activo: boolean;
        rol: import(".prisma/client").$Enums.Rol;
    }>;
    create(tenantId: string, dto: CreateUsuarioDto): Promise<{
        id: string;
        tenantId: string;
        createdAt: Date;
        updatedAt: Date;
        email: string;
        nombre: string;
        activo: boolean;
        rol: import(".prisma/client").$Enums.Rol;
    }>;
    update(tenantId: string, id: string, dto: UpdateUsuarioDto): Promise<{
        id: string;
        tenantId: string;
        createdAt: Date;
        updatedAt: Date;
        email: string;
        nombre: string;
        activo: boolean;
        rol: import(".prisma/client").$Enums.Rol;
    }>;
    remove(tenantId: string, id: string): Promise<{
        id: string;
        email: string;
        nombre: string;
    }>;
}
