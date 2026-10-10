import { Test, TestingModule } from '@nestjs/testing';
import { CotizacionesService } from './cotizaciones.service';
import { PrismaService } from '../prisma/prisma.service';

describe('CotizacionesService', () => {
  let service: CotizacionesService;
  let prisma: PrismaService;

  const mockPrisma = {
    cotizacion: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    detalleCotizacion: {
      deleteMany: vi.fn(),
    },
    cliente: {
      findFirst: vi.fn(),
    },
    producto: {
      findFirstOrThrow: vi.fn().mockResolvedValue({stockActual:0}),
      findFirst: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    venta: {
      create: vi.fn(),
    },
    $transaction: vi.fn((cb) => cb(mockPrisma)),
    $queryRawUnsafe: vi.fn(async (sql:string) => {
      if(sql.includes('SELECT u.rol'))return [{rol:'ADMIN',descuento_maximo:100}];
      if(sql.includes('SELECT * FROM cajas'))return [{id:'caja-test',monto_apertura:100}];
      return [];
    }),
    $queryRaw: vi.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CotizacionesService,
        {
          provide: PrismaService,
          useValue: mockPrisma,
        },
      ],
    }).compile();

    service = module.get<CotizacionesService>(CotizacionesService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should create a quotation with quantity x measure calculation correctly', async () => {
    mockPrisma.cliente.findFirst.mockResolvedValue({
      id: 'c-1',
      nombre: 'Constructora San Pedro',
      rtn: '05019001234567',
    });

    mockPrisma.$queryRaw.mockResolvedValue([{ ultimo_numero: 10 }]);

    mockPrisma.producto.findFirst.mockResolvedValue({
      id: 'p-alz-1',
      codigo: 'ALZ-040-HG',
      nombre: 'Aluzinc natural 0.40 mm HG',
      unidadMedida: 'PIE',
      usaMedida: true,
      precioVenta: 39.00,
      activo: true,
    });

    mockPrisma.cotizacion.create.mockResolvedValue({
      id: 'cot-123',
      tenantId: 'tenant-1',
      numeroCotizacion: 10,
      clienteNombre: 'Constructora San Pedro',
      usuarioId: 'user-1',
      subtotal: 4914.00,
      porcentajeIsv: 15.00,
      isv: 737.10,
      descuento: 0,
      descuentoGeneral: 0,
      tipoDescuentoGeneral: 'MONTO',
      total: 5651.10,
      estado: 'BORRADOR',
      fechaValidez: new Date(),
      diasValidez: 15,
      condicionesPago: 'CONTADO',
      notas: null,
      detalles: [],
    });

    const result = await service.create('tenant-1', 'user-1', {
      clienteId: 'c-1',
      detalles: [
        {
          productoId: 'p-alz-1',
          cantidad: 9,
          medida: 14, // 9 * 14 = 126 pies; 126 * 39 = 4914
          precioUnitario: 39.00,
        },
      ],
    });

    expect(result.numeroCotizacion).toBe(10);
    expect(result.subtotal).toBe(4914.00);
    expect(result.isv).toBe(737.10);
    expect(result.total).toBe(5651.10);
  });

  it('revierte conversión si un decremento concurrente agotó stock', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([{ ultimo_numero: 11 }]);
    mockPrisma.cotizacion.findFirst.mockResolvedValue({
      id: 'cot-123', estado: 'APROBADA',descuento:0, detalles: [{
        productoId:'p-1',precioUnitario:10,cantidad: 2.75, totalMedida: 2.75, producto: { id: 'p-1', nombre: 'Cable',precioVenta:10, stockActual: 3 },
      }],
    });
    mockPrisma.producto.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.convertirAVenta('tenant-A', 'user-A', 'cot-123'))
      .rejects.toThrow('Stock insuficiente');
    expect(mockPrisma.producto.updateMany).toHaveBeenCalledWith({
      where: { id: 'p-1', tenantId: 'tenant-A', activo: true, stockActual: { gte: 2.75 },stockReservado:0 },
      data: { stockReservado: { increment: 2.75 } },
    });
    expect(mockPrisma.$queryRaw.mock.invocationCallOrder[0])
      .toBeLessThan(mockPrisma.cotizacion.findFirst.mock.invocationCallOrder[0]);
    expect(mockPrisma.venta.create).not.toHaveBeenCalled();
    expect(mockPrisma.cotizacion.update).not.toHaveBeenCalled();
  });

  it('impide volver a convertir una cotización ya convertida', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([{ ultimo_numero: 11 }]);
    mockPrisma.cotizacion.findFirst.mockResolvedValue({ estado: 'CONVERTIDA' });
    await expect(service.convertirAVenta('tenant-A', 'user-A', 'cot-123'))
      .rejects.toThrow('ya fue convertida');
    expect(mockPrisma.producto.updateMany).not.toHaveBeenCalled();
  });

  it('no permite reabrir cotizaciones convertidas ni marcar CONVERTIDA manualmente', async () => {
    mockPrisma.cotizacion.findFirst.mockResolvedValue({ estado: 'CONVERTIDA', ventaId: 'venta-1' });
    await expect(service.updateEstado('tenant-1', 'cot-1', 'BORRADOR')).rejects.toThrow('convertida');
    await expect(service.updateEstado('tenant-1', 'cot-1', 'CONVERTIDA')).rejects.toThrow('use convertir');
    expect(mockPrisma.cotizacion.update).not.toHaveBeenCalled();
  });

  describe('vigencia por día calendario del negocio (America/Tegucigalpa)', () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    // 2026-10-10 02:30 UTC = 2026-10-09 20:30 en Tegucigalpa: ya es otro día en UTC.
    const ahoraTegucigalpa = new Date('2026-10-10T02:30:00.000Z');

    it('una cotización válida hasta hoy (hora de negocio) sigue por vencer hoy, no vencida', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(ahoraTegucigalpa);
      mockPrisma.cotizacion.findFirst.mockResolvedValue({
        id: 'cot-1', estado: 'ENVIADA', descuento: 0, descuentoGeneral: 0, detalles: [],
        fechaValidez: new Date('2026-10-09T06:00:00.000Z'),
      });

      const result = await service.findById('tenant-1', 'cot-1');

      expect(result.porVencerHoy).toBe(true);
      expect(result.vencida).toBe(false);
    });

    it('una cotización válida hasta ayer (hora de negocio) está vencida', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(ahoraTegucigalpa);
      mockPrisma.cotizacion.findFirst.mockResolvedValue({
        id: 'cot-2', estado: 'ENVIADA', descuento: 0, descuentoGeneral: 0, detalles: [],
        fechaValidez: new Date('2026-10-08T06:00:00.000Z'),
      });

      const result = await service.findById('tenant-1', 'cot-2');

      expect(result.porVencerHoy).toBe(false);
      expect(result.vencida).toBe(true);
    });

    it('una fecha de solo día enviada por el cliente vence ese día de negocio completo', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(ahoraTegucigalpa);
      mockPrisma.cotizacion.create.mockResolvedValue({
        id: 'cot-3', tenantId: 'tenant-1', numeroCotizacion: 11, estado: 'BORRADOR',
        subtotal: 0, porcentajeIsv: 15, isv: 0, descuento: 0, descuentoGeneral: 0, total: 0,
        fechaValidez: new Date('2026-10-09T06:00:00.000Z'), detalles: [],
      });
      mockPrisma.$queryRaw.mockResolvedValue([{ ultimo_numero: 10 }]);
      mockPrisma.cliente.findFirst.mockResolvedValue({ id: 'c-1', nombre: 'Cliente', rtn: null, telefono: null });
      mockPrisma.producto.findFirst.mockResolvedValue({ id: 'p-1', nombre: 'Clavo', precioVenta: 10, stockActual: 5, activo: true });

      const detalle = { productoId: 'p-1', cantidad: 1, precioUnitario: 10 };
      await service.create('tenant-1', 'user-1', { clienteId: 'c-1', fechaValidez: '2026-10-09', detalles: [detalle] } as any);

      const dataEnviada = mockPrisma.cotizacion.create.mock.calls.at(-1)?.[0]?.data;
      expect(dataEnviada?.fechaValidez?.toISOString()).toBe('2026-10-09T06:00:00.000Z');
    });
  });
});

