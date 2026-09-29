import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { CajasService } from './cajas.service';
import { PrismaService } from '../prisma/prisma.service';

describe('CajasService', () => {
  let service: CajasService;
  let prisma: PrismaService;

  const mockPrismaService = {
    caja: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    movimientoCaja: {
      findMany: vi.fn(),
      create: vi.fn(),
    },
    venta: {
      findMany: vi.fn(),
      updateMany: vi.fn(),
    },
    $transaction: vi.fn((callback) => callback(mockPrismaService)),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CajasService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    service = module.get<CajasService>(CajasService);
    prisma = module.get<PrismaService>(PrismaService);

    vi.clearAllMocks();
  });

  it('debe estar definido', () => {
    expect(service).toBeDefined();
  });

  describe('abrirCaja', () => {
    it('debe abrir una nueva caja si no existe una activa', async () => {
      mockPrismaService.caja.findFirst.mockResolvedValue(null);
      mockPrismaService.caja.create.mockResolvedValue({
        id: 'caja-1',
        tenantId: 'tenant-1',
        usuarioId: 'user-1',
        montoInicial: 1000,
        estado: 'ABIERTA',
        fechaApertura: new Date(),
      });

      const res = await service.abrirCaja('tenant-1', 'user-1', {
        montoInicial: 1000,
        observaciones: 'Fondo inicial',
      });

      expect(res.id).toBe('caja-1');
      expect(res.montoInicial).toBe(1000);
      expect(mockPrismaService.caja.create).toHaveBeenCalled();
    });

    it('debe lanzar BadRequestException si el usuario ya tiene una caja abierta', async () => {
      mockPrismaService.caja.findFirst.mockResolvedValue({ id: 'caja-existente' });

      await expect(
        service.abrirCaja('tenant-1', 'user-1', { montoInicial: 500 }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('crearMovimiento', () => {
    it('debe permitir crear un movimiento de INGRESO en una caja abierta', async () => {
      mockPrismaService.caja.findFirst.mockResolvedValue({
        id: 'caja-1',
        tenantId: 'tenant-1',
        estado: 'ABIERTA',
      });

      mockPrismaService.movimientoCaja.create.mockResolvedValue({
        id: 'mov-1',
        cajaId: 'caja-1',
        tipo: 'INGRESO',
        concepto: 'Fondo adicional',
        monto: 200,
        metodoPago: 'EFECTIVO',
      });

      const res = await service.crearMovimiento('tenant-1', 'caja-1', 'user-1', {
        tipo: 'INGRESO',
        concepto: 'Fondo adicional',
        monto: 200,
      });

      expect(res.monto).toBe(200);
      expect(res.concepto).toBe('Fondo adicional');
    });

    it('debe lanzar BadRequestException si la caja está CERRADA', async () => {
      mockPrismaService.caja.findFirst.mockResolvedValue({
        id: 'caja-cerrada',
        tenantId: 'tenant-1',
        estado: 'CERRADA',
      });

      await expect(
        service.crearMovimiento('tenant-1', 'caja-cerrada', 'user-1', {
          tipo: 'EGRESO',
          concepto: 'Papelería',
          monto: 50,
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('cerrarCaja', () => {
    it('debe calcular el efectivo esperado y cerrar la caja determinando la diferencia', async () => {
      const fechaApertura = new Date();

      mockPrismaService.caja.findFirst.mockResolvedValue({
        id: 'caja-1',
        tenantId: 'tenant-1',
        usuarioId: 'user-1',
        montoInicial: 1000,
        estado: 'ABIERTA',
        fechaApertura,
        movimientos: [
          { tipo: 'INGRESO', monto: 500, metodoPago: 'EFECTIVO' },
          { tipo: 'EGRESO', monto: 200, metodoPago: 'EFECTIVO' },
        ],
      });

      mockPrismaService.venta.findMany.mockResolvedValue([
        { total: 1500, metodoPago: 'EFECTIVO', cajaId: 'caja-1' },
        { total: 800, metodoPago: 'TARJETA', cajaId: 'caja-1' },
      ]);

      mockPrismaService.venta.updateMany.mockResolvedValue({ count: 0 });

      // Esperado = 1000 + 1500 (venta efe) + 500 (ingreso) - 200 (egreso) = 2800
      // Contado = 2750 -> Diferencia = -50 (FALTANTE)
      mockPrismaService.caja.update.mockResolvedValue({
        id: 'caja-1',
        estado: 'CERRADA',
        montoInicial: 1000,
        montoEsperado: 2800,
        montoContado: 2750,
        diferencia: -50,
        tipoDiferencia: 'FALTANTE',
        movimientos: [],
      });

      const result = await service.cerrarCaja('tenant-1', 'caja-1', 'user-1', {
        montoContado: 2750,
        observaciones: 'Faltante de L.50',
      });

      expect(result.resumen.montoEsperado).toBe(2800);
      expect(result.caja.diferencia).toBe(-50);
      expect(result.caja.tipoDiferencia).toBe('FALTANTE');
      expect(mockPrismaService.caja.update).toHaveBeenCalled();
    });

    it('debe lanzar BadRequestException si la caja ya está cerrada', async () => {
      mockPrismaService.caja.findFirst.mockResolvedValue({
        id: 'caja-cerrada',
        tenantId: 'tenant-1',
        estado: 'CERRADA',
        movimientos: [],
      });

      await expect(
        service.cerrarCaja('tenant-1', 'caja-cerrada', 'user-1', {
          montoContado: 1000,
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
