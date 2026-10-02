import { PrismaService } from '../prisma/prisma.service';
import { CreateUsuarioDto } from './dto/create-usuario.dto';
import { UpdateUsuarioDto } from './dto/update-usuario.dto';
export declare class UsuariosService {
    private prisma;
    constructor(prisma: PrismaService);
    findAll(tenantId: string): Promise<any>;
    findById(tenantId: string, id: string): Promise<any>;
    create(tenantId: string, dto: CreateUsuarioDto): Promise<any>;
    update(tenantId: string, id: string, dto: UpdateUsuarioDto): Promise<any>;
    remove(tenantId: string, id: string): Promise<any>;
}
