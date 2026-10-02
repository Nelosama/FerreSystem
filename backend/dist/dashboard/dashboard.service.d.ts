import { PrismaService } from '../prisma/prisma.service';
export declare class DashboardService {
    private prisma;
    constructor(prisma: PrismaService);
    getDashboardData(tenantId: string): Promise<{
        ventasDelDia: {
            total: number;
            cantidad: number;
            variacionPorcentaje: number;
        };
        alertasStock: {
            cantidad: number;
            items: {
                id: string;
                codigo: string;
                nombre: string;
                stockActual: import("@prisma/client/runtime/library").Decimal;
                stockMinimo: import("@prisma/client/runtime/library").Decimal;
                unidadMedida: import(".prisma/client").$Enums.UnidadMedida;
            }[];
        };
        cotizacionesPendientes: {
            cantidad: number;
            porVencerHoy: number;
        };
        tendenciaSemanal: {
            dia: string;
            fecha: string;
            total: number;
            esHoy: boolean;
        }[];
        ultimasVentas: {
            id: string;
            numeroVenta: number;
            cliente: string;
            cajero: string;
            total: number;
            metodoPago: import(".prisma/client").$Enums.MetodoPago;
            hora: string;
        }[];
    }>;
}
