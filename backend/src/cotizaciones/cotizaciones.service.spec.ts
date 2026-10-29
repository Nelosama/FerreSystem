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
      precioAprobado: true,
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
      id: 'cot-123', estado: 'APROBADA', fechaValidez: new Date('2099-12-31T00:00:00.000Z'), descuento:0, porcentajeIsv: 15, detalles: [{
        productoId:'p-1',precioUnitario:10,cantidad: 2.75, totalMedida: 2.75, producto: { id: 'p-1', nombre: 'Cable',precioVenta:10,precioAprobado:true,activo:true, stockActual: 3 },
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
        fechaValidez: new Date('2026-10-09T00:00:00.000Z'),
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
        fechaValidez: new Date('2026-10-08T00:00:00.000Z'),
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
      mockPrisma.producto.findFirst.mockResolvedValue({ id: 'p-1', nombre: 'Clavo', precioVenta: 10, stockActual: 5, activo: true, precioAprobado: true });

      const detalle = { productoId: 'p-1', cantidad: 1, precioUnitario: 10 };
      await service.create('tenant-1', 'user-1', { clienteId: 'c-1', fechaValidez: '2026-10-09', detalles: [detalle] } as any);

      const dataEnviada = mockPrisma.cotizacion.create.mock.calls.at(-1)?.[0]?.data;
      expect(dataEnviada?.fechaValidez?.toISOString()).toBe('2026-10-09T06:00:00.000Z');
    });
  });

  describe('P2 fiscal: tasa de ISV autorizada (H1) y líneas gravadas/exentas (H2)', () => {
    const productos: Record<string, any> = {
      'p-grav': { id: 'p-grav', codigo: 'G', nombre: 'Martillo', unidadMedida: 'UND', usaMedida: false, precioVenta: 100, precioAprobado: true, activo: true },
      'p-exen': { id: 'p-exen', codigo: 'E', nombre: 'Producto exento', unidadMedida: 'UND', usaMedida: false, precioVenta: 50, precioAprobado: true, activo: true },
    };
    beforeEach(() => {
      mockPrisma.$queryRaw.mockResolvedValue([{ ultimo_numero: 20 }]);
      mockPrisma.producto.findFirst.mockImplementation(async ({ where }: any) => productos[where.id] ?? null);
      mockPrisma.cotizacion.create.mockImplementation(async ({ data }: any) => ({ ...data, id: 'cot-n', estado: 'BORRADOR', fechaValidez: new Date('2099-12-31'), detalles: data.detalles.create }));
      mockPrisma.cotizacion.update.mockImplementation(async ({ data }: any) => ({ ...data, id: 'cot-n', estado: 'BORRADOR', numeroCotizacion: 1, fechaValidez: new Date('2099-12-31'), detalles: data.detalles?.create ?? [] }));
    });
    const datosCreados = () => mockPrisma.cotizacion.create.mock.calls.at(-1)?.[0]?.data;

    it.each([500, 0, 18, 15.01, -1, Number.NaN, null, '15'])('create rechaza porcentajeIsv=%s sin escribir', async (porcentajeIsv) => {
      await expect(service.create('t', 'u', { porcentajeIsv, detalles: [{ productoId: 'p-grav', cantidad: 1 }] } as any)).rejects.toThrow(/Tasa de ISV no autorizada/);
      expect(mockPrisma.cotizacion.create).not.toHaveBeenCalled();
    });

    it('create sin tasa usa la autorizada y la persiste', async () => {
      await service.create('t', 'u', { detalles: [{ productoId: 'p-grav', cantidad: 1 }] } as any);
      expect(datosCreados()).toMatchObject({ porcentajeIsv: 15, isv: 15, total: 115 });
    });

    it('update de una cotización antigua con tasa no autorizada exige elegir una autorizada', async () => {
      mockPrisma.cotizacion.findFirst.mockResolvedValue({ id: 'cot-v', estado: 'BORRADOR', porcentajeIsv: 500, clienteNombre: 'X', subtotal: 100, descuentoGeneral: 0, tipoDescuentoGeneral: 'MONTO' });
      await expect(service.update('t', 'cot-v', { detalles: [{ productoId: 'p-grav', cantidad: 1 }] } as any)).rejects.toThrow(/Tasa de ISV no autorizada/);
      expect(mockPrisma.cotizacion.update).not.toHaveBeenCalled();
      await expect(service.update('t', 'cot-v', { porcentajeIsv: 500, detalles: [{ productoId: 'p-grav', cantidad: 1 }] } as any)).rejects.toThrow(/no autorizada/);
      await service.update('t', 'cot-v', { porcentajeIsv: 15, detalles: [{ productoId: 'p-grav', cantidad: 1 }] } as any);
      expect(mockPrisma.cotizacion.update.mock.calls.at(-1)?.[0]?.data).toMatchObject({ porcentajeIsv: 15, isv: 15, total: 115 });
    });

    it('duplicate no copia una tasa no autorizada a un documento nuevo', async () => {
      mockPrisma.cotizacion.findFirst.mockResolvedValue({ id: 'cot-v', numeroCotizacion: 3, diasValidez: 15, porcentajeIsv: 500, detalles: [] });
      await expect(service.duplicate('t', 'u', 'cot-v')).rejects.toThrow(/no autorizada/);
      expect(mockPrisma.cotizacion.create).not.toHaveBeenCalled();
    });

    it('P3: ni el administrador convierte una cotización antigua con tasa no autorizada (500 %)', async () => {
      mockPrisma.cotizacion.findFirst.mockResolvedValue({
        id: 'cot-v', estado: 'APROBADA', numeroCotizacion: 3, fechaValidez: new Date('2099-12-31T00:00:00.000Z'), descuento: 0, porcentajeIsv: 500, isv: 500, total: 600,
        detalles: [{ productoId: 'p-1', precioUnitario: 100, cantidad: 1, totalMedida: 1, exento: false, producto: { id: 'p-1', nombre: 'Cable', precioVenta: 100, precioAprobado: true, activo: true, stockActual: 3 } }],
      });
      await expect(service.convertirAVenta('t', 'u', 'cot-v')).rejects.toThrow(/no autorizada \(500 %\).*regularizarla/);
      expect(mockPrisma.producto.updateMany).not.toHaveBeenCalled();
      expect(mockPrisma.venta.create).not.toHaveBeenCalled();
    });

    it('P3: tampoco convierte una antigua al 0 % aunque sea ADMIN', async () => {
      mockPrisma.cotizacion.findFirst.mockResolvedValue({
        id: 'cot-0', estado: 'APROBADA', numeroCotizacion: 5, fechaValidez: new Date('2099-12-31T00:00:00.000Z'), descuento: 0, porcentajeIsv: 0, isv: 0, total: 100,
        detalles: [{ productoId: 'p-1', precioUnitario: 100, cantidad: 1, totalMedida: 1, exento: false, producto: { id: 'p-1', nombre: 'Cable', precioVenta: 100, precioAprobado: true, activo: true, stockActual: 3 } }],
      });
      await expect(service.convertirAVenta('t', 'u', 'cot-0')).rejects.toThrow(/no autorizada \(0 %\)/);
      expect(mockPrisma.venta.create).not.toHaveBeenCalled();
    });

    describe('P3 regularización explícita', () => {
      const original = {
        id: 'cot-0', numeroCotizacion: 7, estado: 'ENVIADA', porcentajeIsv: 0, subtotal: 150, isv: 0, total: 135, descuentoGeneral: 15, diasValidez: 10,
        clienteId: null, clienteNombre: 'Cliente', clienteRtn: null, clienteTelefono: null, clienteEmail: null, clienteDireccion: null, condicionesPago: 'CONTADO',
        detalles: [
          { productoId: 'p-grav', cantidad: 1, medida: null, precioUnitario: 100, descuento: 0, exento: false },
          { productoId: 'p-exen', cantidad: 1, medida: null, precioUnitario: 50, descuento: 0, exento: true },
        ],
      };
      const admin = (rol = 'ADMIN') => mockPrisma.$queryRawUnsafe.mockImplementation(async (q: string) => q.includes('SELECT u.rol') ? [{ rol }] : []);

      it('crea una cotización nueva con la tasa autorizada y las mismas líneas; no modifica la original y audita el vínculo', async () => {
        admin(); mockPrisma.cotizacion.findFirst.mockResolvedValue(original);
        await service.regularizarIsv('t', 'u', 'cot-0', { motivo: 'Cotización antigua al 0 % sin constancia' });
        const d = datosCreados();
        expect(d).toMatchObject({ porcentajeIsv: 15, subtotal: 150, descuento: 15, isv: 13.5, total: 148.5, estado: 'BORRADOR' });
        expect(d.notas).toMatch(/Regularización de ISV de COT-0007 \(tasa original 0 %\)/);
        expect(d.detalles.create.map((l: any) => [l.productoId, l.exento, l.isv])).toEqual([['p-grav', false, 15], ['p-exen', true, 0]]);
        expect(mockPrisma.cotizacion.update).not.toHaveBeenCalled();
        const auditoria = mockPrisma.$queryRawUnsafe.mock.calls.find((c: any[]) => String(c[0]).includes('auditoria_operaciones'));
        expect(auditoria?.[4]).toBe('COTIZACION_REGULARIZAR_ISV');
        expect(JSON.parse(auditoria?.[6])).toMatchObject({ cotizacionOriginalId: 'cot-0', antes: { porcentajeIsv: 0, isv: 0 }, despues: { porcentajeIsv: 15, isv: 13.5 } });
      });

      it('exige ADMIN, motivo y tasa autorizada; no regulariza lo que no lo necesita ni lo ya convertido', async () => {
        mockPrisma.cotizacion.findFirst.mockResolvedValue(original);
        admin();
        await expect(service.regularizarIsv('t', 'u', 'cot-0', { motivo: 'corto' })).rejects.toThrow(/motivo/);
        await expect(service.regularizarIsv('t', 'u', 'cot-0', { motivo: 'Motivo suficiente', porcentajeIsv: 0 })).rejects.toThrow(/no autorizada/);
        admin('VENDEDOR');
        await expect(service.regularizarIsv('t', 'u', 'cot-0', { motivo: 'Motivo suficiente' })).rejects.toThrow(/administrador/);
        admin();
        mockPrisma.cotizacion.findFirst.mockResolvedValue({ ...original, porcentajeIsv: 15 });
        await expect(service.regularizarIsv('t', 'u', 'cot-0', { motivo: 'Motivo suficiente' })).rejects.toThrow(/no requiere/);
        mockPrisma.cotizacion.findFirst.mockResolvedValue({ ...original, estado: 'CONVERTIDA' });
        await expect(service.regularizarIsv('t', 'u', 'cot-0', { motivo: 'Motivo suficiente' })).rejects.toThrow(/convirtió/);
        expect(mockPrisma.cotizacion.create).not.toHaveBeenCalled();
      });
    });

    it('solo líneas gravadas: ISV 15 % por línea; sin marca por línea, el producto «exento» se grava (la exención no viene del producto)', async () => {
      await service.create('t', 'u', { detalles: [{ productoId: 'p-grav', cantidad: 2 }, { productoId: 'p-exen', cantidad: 1 }] } as any);
      const d = datosCreados();
      expect(d.detalles.create.map((l: any) => [l.exento, l.subtotal, l.isv, l.totalLinea])).toEqual([[false, 200, 30, 230], [false, 50, 7.5, 57.5]]);
      expect(d).toMatchObject({ subtotal: 250, isv: 37.5, total: 287.5 });
    });

    it('solo líneas exentas: ISV cero y total igual a la base', async () => {
      await service.create('t', 'u', { detalles: [{ productoId: 'p-exen', cantidad: 3, exento: true }] } as any);
      expect(datosCreados()).toMatchObject({ subtotal: 150, isv: 0, total: 150 });
      expect(datosCreados().detalles.create[0]).toMatchObject({ exento: true, isv: 0, totalLinea: 150 });
    });

    it('combinada con descuento general: el ISV solo grava la parte gravada, prorrateada tras el descuento', async () => {
      await service.create('t', 'u', { descuentoGeneral: 15, tipoDescuentoGeneral: 'MONTO', detalles: [{ productoId: 'p-grav', cantidad: 1 }, { productoId: 'p-exen', cantidad: 1, exento: true }] } as any);
      const d = datosCreados();
      expect(d.detalles.create.map((l: any) => [l.exento, l.isv])).toEqual([[false, 15], [true, 0]]);
      // ISV de líneas 15.00 × (150 − 15) / 150 = 13.50; total 135 + 13.50.
      expect(d).toMatchObject({ subtotal: 150, descuento: 15, isv: 13.5, total: 148.5 });
    });

    it('duplicate conserva los importes históricos y la marca exenta de cada línea', async () => {
      const lineas = [
        { productoId: 'p-grav', exento: false, subtotal: 100, isv: 15, totalLinea: 115 },
        { productoId: 'p-exen', exento: true, subtotal: 50, isv: 0, totalLinea: 50 },
      ];
      mockPrisma.cotizacion.findFirst.mockResolvedValue({ id: 'cot-o', numeroCotizacion: 4, diasValidez: 15, porcentajeIsv: 15, subtotal: 150, isv: 13.5, descuento: 15, total: 148.5, detalles: lineas });
      await service.duplicate('t', 'u', 'cot-o');
      const d = datosCreados();
      expect(d).toMatchObject({ porcentajeIsv: 15, subtotal: 150, isv: 13.5, descuento: 15, total: 148.5 });
      expect(d.detalles.create).toEqual(lineas.map((l) => expect.objectContaining(l)));
    });
  });
});

