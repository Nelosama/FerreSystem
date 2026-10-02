import { PrismaService } from '../prisma/prisma.service';
import { CreateLevantamientoDto, UpdateLevantamientoDto } from './dto/create-levantamiento.dto';
import { CreateLevantamientoItemDto, UpdateLevantamientoItemDto } from './dto/create-levantamiento-item.dto';
export declare class LevantamientosService {
    private readonly prisma;
    constructor(prisma: PrismaService);
    findAll(tenantId: string): Promise<any>;
    findOne(tenantId: string, id: string): Promise<{
        id: any;
        nombre: any;
        descripcion: any;
        estado: any;
        createdBy: any;
        createdAt: any;
        updatedAt: any;
        items: any;
    }>;
    create(tenantId: string, userId: string, dto: CreateLevantamientoDto): Promise<any>;
    update(tenantId: string, id: string, dto: UpdateLevantamientoDto): Promise<any>;
    remove(tenantId: string, id: string): Promise<{
        success: boolean;
        message: string;
    }>;
    findItems(tenantId: string, levantamientoId: string): Promise<any>;
    createItem(tenantId: string, levantamientoId: string, dto: CreateLevantamientoItemDto): Promise<{
        id: any;
        levantamientoId: any;
        descripcion: any;
        cantidad: any;
        unidad: any;
        codigo: any;
        marca: any;
        categoria: any;
        notas: any;
        createdAt: any;
        updatedAt: any;
    }>;
    updateItem(tenantId: string, levantamientoId: string, itemId: string, dto: UpdateLevantamientoItemDto): Promise<{
        id: any;
        levantamientoId: any;
        descripcion: any;
        cantidad: any;
        unidad: any;
        codigo: any;
        marca: any;
        categoria: any;
        notas: any;
        createdAt: any;
        updatedAt: any;
    }>;
    removeItem(tenantId: string, levantamientoId: string, itemId: string): Promise<{
        success: boolean;
        message: string;
    }>;
}
