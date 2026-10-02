import { UsuariosService } from './usuarios.service';
import { CreateUsuarioDto } from './dto/create-usuario.dto';
import { UpdateUsuarioDto } from './dto/update-usuario.dto';
export declare class UsuariosController {
    private readonly usuariosService;
    constructor(usuariosService: UsuariosService);
    findAll(tenantId: string): Promise<any>;
    findById(tenantId: string, id: string): Promise<any>;
    create(tenantId: string, dto: CreateUsuarioDto): Promise<any>;
    update(tenantId: string, id: string, dto: UpdateUsuarioDto): Promise<any>;
    remove(tenantId: string, id: string): Promise<any>;
}
