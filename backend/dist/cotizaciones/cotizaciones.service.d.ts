import { PrismaService } from '../prisma/prisma.service';
import { CreateCotizacionDto } from './dto/create-cotizacion.dto';
export declare class CotizacionesService {
    private prisma;
    constructor(prisma: PrismaService);
    findAll(tenantId: string): Promise<any[]>;
    findById(tenantId: string, id: string): Promise<any>;
    create(tenantId: string, usuarioId: string, dto: CreateCotizacionDto): Promise<any>;
    update(tenantId: string, id: string, dto: CreateCotizacionDto): Promise<any>;
    duplicate(tenantId: string, usuarioId: string, id: string): Promise<any>;
    updateEstado(tenantId: string, id: string, estado: any): Promise<any>;
    convertirAVenta(tenantId: string, usuarioId: string, cotizacionId: string, metodoPago?: any): Promise<{
        ventaId: string;
        numeroVenta: number;
        total: number;
        mensaje: string;
    }>;
    private processLineItems;
    private formatCotizacion;
}
