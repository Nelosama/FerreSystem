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
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
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
    mockPrisma.producto.updateMany.mockResolvedValue({ count: 1 });
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

    expect(mockPrisma.producto.updateMany).toHaveBeenCalledWith({
      where: { id: 'prod-123', tenantId, activo: true, stockActual: { gte: 2.5 } },
      data: { stockActual: { decrement: 2.5 } },
    });

    expect(resultado.detalles[0].cantidad).toBe(2.5);
  });

  it('rechaza una venta si el stock cambió después de la lectura', async () => {
    mockPrisma.producto.findFirst.mockResolvedValue({
      id: 'prod-123', nombre: 'Cable', stockActual: 10, precioVenta: 25.5,
    });
    mockPrisma.producto.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.create('tenant-A', 'user-A', {
      detalles: [{ productoId: 'prod-123', cantidad: 2.75 }],
    })).rejects.toThrow('Stock insuficiente');
    expect(mockPrisma.venta.create).not.toHaveBeenCalled();
  });

  it('rechaza productos que no pertenecen al tenant', async () => {
    mockPrisma.producto.findFirst.mockResolvedValue(null);
    await expect(service.create('tenant-A', 'user-A', {
      detalles: [{ productoId: 'producto-tenant-B', cantidad: 0.5 }],
    })).rejects.toThrow('no encontrado');
    expect(mockPrisma.producto.updateMany).not.toHaveBeenCalled();
    expect(mockPrisma.venta.create).not.toHaveBeenCalled();
  });

  it('solo permite un cobro cuando dos lecturas ven el mismo stock', async () => {
    let stock = 2.75;
    mockPrisma.producto.findFirst.mockResolvedValue({
      id: 'prod-123', nombre: 'Cable', stockActual: 2.75, precioVenta: 10,
    });
    // Modela el UPDATE condicional: la segunda petición observa el saldo
    // actualizado al intentar descontar, aunque su lectura fuera antigua.
    mockPrisma.producto.updateMany.mockImplementation(async ({ where, data }) => {
      if (stock < where.stockActual.gte) return { count: 0 };
      stock -= data.stockActual.decrement;
      return { count: 1 };
    });
    mockPrisma.venta.create.mockResolvedValue({
      subtotal: 27.5, isv: 4.13, descuento: 0, total: 31.63, detalles: [],
    });
    const results = await Promise.allSettled([
      service.create('tenant-A', 'user-A', { detalles: [{ productoId: 'prod-123', cantidad: 2.75 }] }),
      service.create('tenant-A', 'user-A', { detalles: [{ productoId: 'prod-123', cantidad: 2.75 }] }),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1);
    expect(stock).toBe(0);
    expect(mockPrisma.venta.create).toHaveBeenCalledTimes(1);
  });
});
