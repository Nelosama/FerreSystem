import { PrismaService } from '../prisma/prisma.service';
export declare class VentasService {
    private prisma;
    constructor(prisma: PrismaService);
    findAll(tenantId: string, limit?: number): Promise<any>;
    findById(tenantId: string, id: string): Promise<any>;
    create(tenantId: string, usuarioId: string, dto: {
        clienteId?: string;
        metodoPago?: any;
        descuento?: number;
        notas?: string;
        detalles: {
            productoId: string;
            cantidad: number;
            precioUnitario?: number;
        }[];
    }): Promise<any>;
}
