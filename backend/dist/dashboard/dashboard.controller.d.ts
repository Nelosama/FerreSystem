import { DashboardService } from './dashboard.service';
export declare class DashboardController {
    private readonly dashboardService;
    constructor(dashboardService: DashboardService);
    getDashboard(tenantId: string): Promise<{
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
