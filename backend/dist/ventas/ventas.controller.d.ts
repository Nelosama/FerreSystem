import { VentasService } from './ventas.service';
import { CreateVentaDto } from './dto/create-venta.dto';
export declare class VentasController {
    private readonly ventasService;
    constructor(ventasService: VentasService);
    findAll(tenantId: string, limit?: string): Promise<{
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
    create(tenantId: string, usuarioId: string, dto: CreateVentaDto): Promise<{
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
