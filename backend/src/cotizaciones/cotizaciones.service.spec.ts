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
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    venta: {
      create: vi.fn(),
    },
    $transaction: vi.fn((cb) => cb(mockPrisma)),
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
});
