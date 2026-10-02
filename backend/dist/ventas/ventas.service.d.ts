import { PrismaService } from '../prisma/prisma.service';
export declare class VentasService {
    private prisma;
    constructor(prisma: PrismaService);
    findAll(tenantId: string, limit?: number): Promise<{
        subtotal: number;
        isv: number;
        descuento: number;
        total: number;
        detalles: {
            id: string;
            productoId: string;
            productoNombre: string;
            productoCodigo: string;
            cantidad: number;
            precioUnitario: number;
            subtotal: number;
        }[];
        usuario: {
            id: string;
            nombre: string;
        };
        cliente: {
            id: string;
            nombre: string;
            rtn: string;
        };
        id: string;
        tenantId: string;
        createdAt: Date;
        estado: import(".prisma/client").$Enums.EstadoVenta;
        numeroVenta: number;
        clienteId: string | null;
        usuarioId: string;
        metodoPago: import(".prisma/client").$Enums.MetodoPago;
        notas: string | null;
    }[]>;
    findById(tenantId: string, id: string): Promise<{
        subtotal: number;
        isv: number;
        descuento: number;
        total: number;
        detalles: {
            id: string;
            productoId: string;
            productoNombre: string;
            productoCodigo: string;
            cantidad: number;
            precioUnitario: number;
            subtotal: number;
        }[];
        tenant: {
            id: string;
            createdAt: Date;
            updatedAt: Date;
            email: string | null;
            nombreComercial: string;
            direccion: string | null;
            telefono: string | null;
            logoUrl: string | null;
            colorPrimario: string;
            modoNavegacion: import(".prisma/client").$Enums.ModoNavegacion;
            plan: string;
            estado: import(".prisma/client").$Enums.EstadoTenant;
        };
        usuario: {
            id: string;
            email: string;
            nombre: string;
        };
        cliente: {
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
        };
        id: string;
        tenantId: string;
        createdAt: Date;
        estado: import(".prisma/client").$Enums.EstadoVenta;
        numeroVenta: number;
        clienteId: string | null;
        usuarioId: string;
        metodoPago: import(".prisma/client").$Enums.MetodoPago;
        notas: string | null;
    }>;
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
    }): Promise<{
        subtotal: number;
        isv: number;
        descuento: number;
        total: number;
        detalles: {
            id: string;
            productoId: string;
            productoNombre: string;
            productoCodigo: string;
            cantidad: number;
            precioUnitario: number;
            subtotal: number;
        }[];
        cliente: {
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
        };
        id: string;
        tenantId: string;
        createdAt: Date;
        estado: import(".prisma/client").$Enums.EstadoVenta;
        numeroVenta: number;
        clienteId: string | null;
        usuarioId: string;
        metodoPago: import(".prisma/client").$Enums.MetodoPago;
        notas: string | null;
    }>;
}
