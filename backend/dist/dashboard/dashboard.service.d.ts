import { PrismaService } from '../prisma/prisma.service';
export declare class DashboardService {
    private prisma;
    constructor(prisma: PrismaService);
    getDashboardData(tenantId: string): Promise<{
        ventasDelDia: {
            total: any;
            cantidad: any;
            variacionPorcentaje: number;
        };
        alertasStock: {
            cantidad: any;
            items: any;
        };
        cotizacionesPendientes: {
            cantidad: any;
            porVencerHoy: number;
        };
        tendenciaSemanal: {
            dia: string;
            fecha: string;
            total: number;
            esHoy: boolean;
        }[];
        ultimasVentas: any;
    }>;
}
