import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { LevantamientosService } from './levantamientos.service';
import { PrismaService } from '../prisma/prisma.service';

describe('LevantamientosService', () => {
  let service: LevantamientosService;

  const mockPrisma = {
    levantamiento: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    levantamientoItem: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LevantamientosService,
        {
          provide: PrismaService,
          useValue: mockPrisma,
        },
      ],
    }).compile();

    service = module.get<LevantamientosService>(LevantamientosService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('debe estar definido', () => {
    expect(service).toBeDefined();
  });

  describe('CRUD Levantamientos', () => {
    it('debe crear un levantamiento de inventario', async () => {
      const mockCreated = {
        id: 'lev-1',
        tenantId: 'tenant-A',
        nombre: 'Inventario Inicial Ferretería XYZ',
        descripcion: 'Levantamiento de stock en bodega principal',
        estado: 'BORRADOR',
        createdBy: 'user-1',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPrisma.levantamiento.create.mockResolvedValue(mockCreated);

      const result = await service.create('tenant-A', 'user-1', {
        nombre: 'Inventario Inicial Ferretería XYZ',
        descripcion: 'Levantamiento de stock en bodega principal',
      });

      expect(mockPrisma.levantamiento.create).toHaveBeenCalledWith({
        data: {
          tenantId: 'tenant-A',
          nombre: 'Inventario Inicial Ferretería XYZ',
          descripcion: 'Levantamiento de stock en bodega principal',
          estado: 'BORRADOR',
          createdBy: 'user-1',
        },
      });
      expect(result.id).toBe('lev-1');
    });

    it('debe listar únicamente los levantamientos del tenant actual', async () => {
      mockPrisma.levantamiento.findMany.mockResolvedValue([
        {
          id: 'lev-1',
          tenantId: 'tenant-A',
          nombre: 'Inventario 1',
          descripcion: null,
          estado: 'BORRADOR',
          createdBy: 'user-1',
          createdAt: new Date(),
          updatedAt: new Date(),
          _count: { items: 2 },
        },
      ]);

      const result = await service.findAll('tenant-A');

      expect(mockPrisma.levantamiento.findMany).toHaveBeenCalledWith({
        where: { tenantId: 'tenant-A' },
        include: { _count: { select: { items: true } } },
        orderBy: { createdAt: 'desc' },
      });
      expect(result).toHaveLength(1);
      expect(result[0].totalItems).toBe(2);
    });

    it('debe lanzar NotFoundException si se busca un levantamiento de otro tenant o inexistente', async () => {
      mockPrisma.levantamiento.findFirst.mockResolvedValue(null);

      await expect(service.findOne('tenant-A', 'lev-inexistente')).rejects.toThrow(
        NotFoundException,
      );
      expect(mockPrisma.levantamiento.findFirst).toHaveBeenCalledWith({
        where: { id: 'lev-inexistente', tenantId: 'tenant-A' },
        include: { items: { orderBy: { createdAt: 'desc' } } },
      });
    });

    it('debe actualizar un levantamiento existente', async () => {
      mockPrisma.levantamiento.findFirst.mockResolvedValue({ id: 'lev-1', tenantId: 'tenant-A' });
      mockPrisma.levantamiento.update.mockResolvedValue({
        id: 'lev-1',
        nombre: 'Nombre Actualizado',
        estado: 'EN_PROGRESO',
      });

      const result = await service.update('tenant-A', 'lev-1', {
        nombre: 'Nombre Actualizado',
        estado: 'EN_PROGRESO' as any,
      });

      expect(result.nombre).toBe('Nombre Actualizado');
      expect(result.estado).toBe('EN_PROGRESO');
    });

    it('debe eliminar un levantamiento perteneciente al tenant', async () => {
      mockPrisma.levantamiento.findFirst.mockResolvedValue({ id: 'lev-1', tenantId: 'tenant-A' });
      mockPrisma.levantamiento.delete.mockResolvedValue({ id: 'lev-1' });

      const result = await service.remove('tenant-A', 'lev-1');
      expect(result.success).toBe(true);
      expect(mockPrisma.levantamiento.delete).toHaveBeenCalledWith({ where: { id: 'lev-1' } });
    });
  });

  describe('CRUD Items de Levantamiento', () => {
    it('debe agregar un item al levantamiento sin requerir un Producto pre-existente', async () => {
      mockPrisma.levantamiento.findFirst.mockResolvedValue({
        id: 'lev-1',
        tenantId: 'tenant-A',
        items: [],
      });

      mockPrisma.levantamientoItem.create.mockResolvedValue({
        id: 'item-1',
        levantamientoId: 'lev-1',
        descripcion: 'Tornillo negro 2"',
        cantidad: 250,
        unidad: 'unidad',
        codigo: null,
        marca: null,
        categoria: null,
        notas: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await service.createItem('tenant-A', 'lev-1', {
        descripcion: 'Tornillo negro 2"',
        cantidad: 250,
        unidad: 'unidad',
      });

      expect(result.descripcion).toBe('Tornillo negro 2"');
      expect(result.cantidad).toBe(250);
      expect(result.codigo).toBeNull();
    });

    it('no debe permitir crear un item en un levantamiento perteneciente a otro tenant', async () => {
      // tenant-B intenta agregar a lev-1 de tenant-A
      mockPrisma.levantamiento.findFirst.mockResolvedValue(null);

      await expect(
        service.createItem('tenant-B', 'lev-1', {
          descripcion: 'Cemento 42.5 kg',
          cantidad: 50,
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('debe actualizar la cantidad e información opcional de un item', async () => {
      mockPrisma.levantamiento.findFirst.mockResolvedValue({
        id: 'lev-1',
        tenantId: 'tenant-A',
        items: [],
      });
      mockPrisma.levantamientoItem.findFirst.mockResolvedValue({
        id: 'item-1',
        levantamientoId: 'lev-1',
      });
      mockPrisma.levantamientoItem.update.mockResolvedValue({
        id: 'item-1',
        levantamientoId: 'lev-1',
        descripcion: 'Cemento 42.5 kg Gris',
        cantidad: 55,
        unidad: 'saco',
        codigo: 'CEM-001',
        marca: 'Holcim',
        categoria: 'Materiales',
        notas: 'Ubicado en estante A-3',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await service.updateItem('tenant-A', 'lev-1', 'item-1', {
        descripcion: 'Cemento 42.5 kg Gris',
        cantidad: 55,
        codigo: 'CEM-001',
      });

      expect(result.cantidad).toBe(55);
      expect(result.codigo).toBe('CEM-001');
    });

    it('debe eliminar un item validando que pertenece al levantamiento del tenant', async () => {
      mockPrisma.levantamiento.findFirst.mockResolvedValue({
        id: 'lev-1',
        tenantId: 'tenant-A',
        items: [],
      });
      mockPrisma.levantamientoItem.findFirst.mockResolvedValue({
        id: 'item-1',
        levantamientoId: 'lev-1',
      });
      mockPrisma.levantamientoItem.delete.mockResolvedValue({ id: 'item-1' });

      const result = await service.removeItem('tenant-A', 'lev-1', 'item-1');
      expect(result.success).toBe(true);
      expect(mockPrisma.levantamientoItem.delete).toHaveBeenCalledWith({ where: { id: 'item-1' } });
    });
  });

  describe('Verificación de Aislamiento Estricto por Tenant (Cross-Tenant Access)', () => {
    it('debe impedir que Tenant B consulte levantamientos de Tenant A', async () => {
      mockPrisma.levantamiento.findFirst.mockResolvedValue(null);

      await expect(service.findOne('tenant-B', 'lev-tenant-A')).rejects.toThrow(NotFoundException);
      expect(mockPrisma.levantamiento.findFirst).toHaveBeenCalledWith({
        where: { id: 'lev-tenant-A', tenantId: 'tenant-B' },
        include: { items: { orderBy: { createdAt: 'desc' } } },
      });
    });

    it('debe impedir que Tenant B actualice o modifique un levantamiento de Tenant A', async () => {
      mockPrisma.levantamiento.findFirst.mockResolvedValue(null);

      await expect(
        service.update('tenant-B', 'lev-tenant-A', { nombre: 'Intento de hack' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('debe impedir que Tenant B elimine un levantamiento de Tenant A', async () => {
      mockPrisma.levantamiento.findFirst.mockResolvedValue(null);

      await expect(service.remove('tenant-B', 'lev-tenant-A')).rejects.toThrow(NotFoundException);
    });
  });
});
