import { PrismaService } from '../prisma/prisma.service';
import { CreateLevantamientoDto, UpdateLevantamientoDto } from './dto/create-levantamiento.dto';
import { CreateLevantamientoItemDto, UpdateLevantamientoItemDto } from './dto/create-levantamiento-item.dto';
export declare class LevantamientosService {
    private readonly prisma;
    constructor(prisma: PrismaService);
    findAll(tenantId: string): Promise<{
        id: string;
        nombre: string;
        descripcion: string;
        estado: import(".prisma/client").$Enums.EstadoLevantamiento;
        createdBy: string;
        createdAt: Date;
        updatedAt: Date;
        totalItems: number;
    }[]>;
    findOne(tenantId: string, id: string): Promise<{
        id: string;
        nombre: string;
        descripcion: string;
        estado: import(".prisma/client").$Enums.EstadoLevantamiento;
        createdBy: string;
        createdAt: Date;
        updatedAt: Date;
        items: {
            id: string;
            levantamientoId: string;
            descripcion: string;
            cantidad: number;
            unidad: string;
            codigo: string;
            marca: string;
            categoria: string;
            notas: string;
            createdAt: Date;
            updatedAt: Date;
        }[];
    }>;
    create(tenantId: string, userId: string, dto: CreateLevantamientoDto): Promise<{
        id: string;
        tenantId: string;
        createdAt: Date;
        updatedAt: Date;
        nombre: string;
        estado: import(".prisma/client").$Enums.EstadoLevantamiento;
        descripcion: string | null;
        createdBy: string | null;
    }>;
    update(tenantId: string, id: string, dto: UpdateLevantamientoDto): Promise<{
        id: string;
        tenantId: string;
        createdAt: Date;
        updatedAt: Date;
        nombre: string;
        estado: import(".prisma/client").$Enums.EstadoLevantamiento;
        descripcion: string | null;
        createdBy: string | null;
    }>;
    remove(tenantId: string, id: string): Promise<{
        success: boolean;
        message: string;
    }>;
    findItems(tenantId: string, levantamientoId: string): Promise<{
        id: string;
        levantamientoId: string;
        descripcion: string;
        cantidad: number;
        unidad: string;
        codigo: string;
        marca: string;
        categoria: string;
        notas: string;
        createdAt: Date;
        updatedAt: Date;
    }[]>;
    createItem(tenantId: string, levantamientoId: string, dto: CreateLevantamientoItemDto): Promise<{
        id: string;
        levantamientoId: string;
        descripcion: string;
        cantidad: number;
        unidad: string;
        codigo: string;
        marca: string;
        categoria: string;
        notas: string;
        createdAt: Date;
        updatedAt: Date;
    }>;
    updateItem(tenantId: string, levantamientoId: string, itemId: string, dto: UpdateLevantamientoItemDto): Promise<{
        id: string;
        levantamientoId: string;
        descripcion: string;
        cantidad: number;
        unidad: string;
        codigo: string;
        marca: string;
        categoria: string;
        notas: string;
        createdAt: Date;
        updatedAt: Date;
    }>;
    removeItem(tenantId: string, levantamientoId: string, itemId: string): Promise<{
        success: boolean;
        message: string;
    }>;
}
