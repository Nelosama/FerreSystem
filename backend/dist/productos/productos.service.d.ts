import { PrismaService } from '../prisma/prisma.service';
export declare class ProductosService {
    private prisma;
    constructor(prisma: PrismaService);
    findAll(tenantId: string, search?: string, categoriaId?: string): Promise<any>;
    findById(tenantId: string, id: string): Promise<any>;
    getLowStock(tenantId: string): Promise<any>;
    create(tenantId: string, dto: {
        codigo: string;
        codigoBarras?: string;
        nombre: string;
        descripcion?: string;
        categoriaId?: string;
        precioVenta: number;
        precioCosto: number;
        stockActual: number;
        stockMinimo: number;
        unidadMedida?: any;
    }): Promise<any>;
    update(tenantId: string, id: string, dto: {
        codigo?: string;
        codigoBarras?: string;
        nombre?: string;
        descripcion?: string;
        categoriaId?: string;
        precioVenta?: number;
        precioCosto?: number;
        stockActual?: number;
        stockMinimo?: number;
        unidadMedida?: any;
    }): Promise<any>;
    delete(tenantId: string, id: string): Promise<any>;
}
