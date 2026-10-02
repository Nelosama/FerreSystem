import { VentasService } from './ventas.service';
import { CreateVentaDto } from './dto/create-venta.dto';
export declare class VentasController {
    private readonly ventasService;
    constructor(ventasService: VentasService);
    findAll(tenantId: string, limit?: string): Promise<any>;
    findById(tenantId: string, id: string): Promise<any>;
    create(tenantId: string, usuarioId: string, dto: CreateVentaDto): Promise<any>;
}
