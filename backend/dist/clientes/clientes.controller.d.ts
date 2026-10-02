import { ClientesService } from './clientes.service';
import { CreateClienteDto, UpdateClienteDto } from './dto/create-cliente.dto';
export declare class ClientesController {
    private readonly clientesService;
    constructor(clientesService: ClientesService);
    findAll(tenantId: string, search?: string): Promise<any>;
    findById(tenantId: string, id: string): Promise<any>;
    create(tenantId: string, dto: CreateClienteDto): Promise<any>;
    update(tenantId: string, id: string, dto: UpdateClienteDto): Promise<any>;
    delete(tenantId: string, id: string): Promise<{
        success: boolean;
        count: any;
    }>;
}
