import { Test, TestingModule } from '@nestjs/testing';
import { describe, beforeEach, it, expect, vi } from 'vitest';
import { VentasService } from './ventas.service';
import { PrismaService } from '../prisma/prisma.service';

describe('VentasService - Descuento Stock Decimal', () => {
  let service: VentasService;

  const mockPrisma = {
    $transaction: vi.fn((callback) => callback(mockPrisma)),
    $queryRaw: vi.fn().mockResolvedValue([{ ultimo_numero: 101 }]),
    producto: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    venta: {
      create: vi.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VentasService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<VentasService>(VentasService);

    vi.clearAllMocks();
  });

  it('debe descontar stock manteniendo precisión decimal exacta (ej. 2.5 unidades)', async () => {
    const tenantId = 'tenant-test-id';
    const usuarioId = 'user-test-id';

    // Producto mock con 10.0 unidades iniciales
    mockPrisma.producto.findFirst.mockResolvedValue({
      id: 'prod-123',
      tenantId,
      nombre: 'Cable Eléctrico 12 AWG',
      precioVenta: 25.5,
      stockActual: 10.0,
      activo: true,
    });

    mockPrisma.venta.create.mockResolvedValue({
      id: 'venta-1',
      tenantId,
      numeroVenta: 101,
      clienteId: null,
      usuarioId,
      subtotal: 63.75,
      isv: 9.56,
      descuento: 0,
      total: 73.31,
      metodoPago: 'EFECTIVO',
      estado: 'COMPLETADA',
      detalles: [
        {
          id: 'det-1',
          productoId: 'prod-123',
          cantidad: 2.5,
          precioUnitario: 25.5,
          subtotal: 63.75,
          producto: { id: 'prod-123', nombre: 'Cable Eléctrico 12 AWG', codigo: 'CABL-12' },
        },
      ],
    });

    const resultado = await service.create(tenantId, usuarioId, {
      detalles: [
        {
          productoId: 'prod-123',
          cantidad: 2.5,
          precioUnitario: 25.5,
        },
      ],
    });

    expect(mockPrisma.producto.update).toHaveBeenCalledWith({
      where: { id: 'prod-123' },
      data: { stockActual: { decrement: 2.5 } },
    });

    expect(resultado.detalles[0].cantidad).toBe(2.5);
  });
});
