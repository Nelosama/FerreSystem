import { CotizacionesService } from './cotizaciones.service';
import { CreateCotizacionDto } from './dto/create-cotizacion.dto';
export declare class CotizacionesController {
    private readonly cotizacionesService;
    constructor(cotizacionesService: CotizacionesService);
    findAll(tenantId: string): Promise<any[]>;
    findById(tenantId: string, id: string): Promise<any>;
    create(tenantId: string, usuarioId: string, dto: CreateCotizacionDto): Promise<any>;
    update(tenantId: string, id: string, dto: CreateCotizacionDto): Promise<any>;
    duplicate(tenantId: string, usuarioId: string, id: string): Promise<any>;
    updateEstado(tenantId: string, id: string, estado: string): Promise<any>;
    convertirAVenta(tenantId: string, usuarioId: string, cotizacionId: string, metodoPago?: string): Promise<{
        ventaId: string;
        numeroVenta: number;
        total: number;
        mensaje: string;
    }>;
}
