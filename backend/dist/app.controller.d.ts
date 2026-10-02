import { AppService } from './app.service.js';
import { PrismaService } from './prisma/prisma.service.js';
export declare class AppController {
    private readonly appService;
    private readonly prisma;
    private readonly logger;
    constructor(appService: AppService, prisma: PrismaService);
    getHello(): string;
    checkDatabaseHealth(): Promise<{
        status: string;
        database: string;
        timestamp: any;
    }>;
}
