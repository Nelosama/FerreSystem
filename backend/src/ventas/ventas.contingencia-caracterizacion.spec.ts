import { idSolicitud } from '../operaciones/ledger';
import { Test } from '@nestjs/testing';
import { describe, beforeEach, it, expect, vi } from 'vitest';
import { VentasService } from './ventas.service';
import { PrismaService } from '../prisma/prisma.service';

// Caracterización del contrato actual de VentasService.create relevante para operar sin internet
// (docs/POS_OFFLINE_CONTINGENCIA_DISENO.md). Fija comportamiento VIGENTE; no es una especificación futura.
// Un cambio intencional en estas reglas (PR de implementación aprobado) debe actualizar la prueba a propósito.

const PRODUCTO = { id: 'p1', tenantId: 'T', nombre: 'Tornillo', precioVenta: 10, precioCosto: 4, stockActual: 20, stockReservado: 0, activo: true, precioAprobado: true };
const ventaCreada = (extra = {}) => ({
  id: 'v1', numeroVenta: 7, usuarioId: 'U', tenantId: 'T', clienteId: null, metodoPago: 'EFECTIVO', tipoPago: 'CONTADO',
  descuento: 0, notas: null, subtotal: 20, isv: 3, total: 23, saldoCredito: null, solicitudHash: null,
  detalles: [{ id: 'd1', productoId: 'p1', cantidad: 2, precioUnitario: 10, subtotal: 20, producto: PRODUCTO }], ...extra,
});

describe('VentasService.create — contrato vigente para contingencia', () => {
  let service: VentasService;
  let rol = 'CAJERO';
  let cajaAbierta = true;
  const prisma: any = {
    $transaction: vi.fn((cb) => cb(prisma)),
    $queryRawUnsafe: vi.fn(async (sql: string) => {
      if (sql.includes('SELECT u.rol')) return [{ rol, descuento_maximo: 0 }];
      if (sql.includes('SELECT * FROM cajas')) return cajaAbierta ? [{ id: 'caja-1' }] : [];
      return [];
    }),
    $queryRaw: vi.fn().mockResolvedValue([{ ultimo_numero: 7 }]),
    producto: { findFirst: vi.fn(), updateMany: vi.fn() },
    cliente: { findFirst: vi.fn(), updateMany: vi.fn() },
    venta: { create: vi.fn(), findUnique: vi.fn() },
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    rol = 'CAJERO'; cajaAbierta = true;
    prisma.producto.findFirst.mockResolvedValue(PRODUCTO);
    prisma.producto.updateMany.mockResolvedValue({ count: 1 });
    prisma.venta.findUnique.mockResolvedValue(null);
    prisma.venta.create.mockImplementation(async ({ data }: any) => ventaCreada({ id: data.id ?? 'generado' }));
    const module = await Test.createTestingModule({ providers: [VentasService, { provide: PrismaService, useValue: prisma }] }).compile();
    service = module.get(VentasService);
  });

  const dto = (extra: any = {}) => ({ detalles: [{ productoId: 'p1', cantidad: 2, precioUnitario: 10 }], ...extra });

  it('CAJERO con un precio distinto al vigente recibe 409 y no se crea venta (precio offline obsoleto sería rechazado)', async () => {
    await expect(service.create('T', 'U', dto({ detalles: [{ productoId: 'p1', cantidad: 2, precioUnitario: 9 }] })))
      .rejects.toMatchObject({ status: 409 });
    expect(prisma.venta.create).not.toHaveBeenCalled();
    expect(prisma.producto.updateMany).not.toHaveBeenCalled();
  });

  it('ADMIN puede vender con un precio distinto al vigente y queda guardado el enviado', async () => {
    rol = 'ADMIN';
    await service.create('T', 'U', dto({ detalles: [{ productoId: 'p1', cantidad: 2, precioUnitario: 9 }] }));
    const data = prisma.venta.create.mock.calls[0][0].data;
    expect(data.detalles.create[0].precioUnitario).toBe(9);
    expect(data.subtotal).toBe(18);
  });

  it('sin caja abierta responde 409: la venta no existe sin una caja abierta en el servidor', async () => {
    cajaAbierta = false;
    await expect(service.create('T', 'U', dto())).rejects.toMatchObject({ status: 409 });
    expect(prisma.venta.create).not.toHaveBeenCalled();
  });

  it('la venta nace COMPLETADA con número, hora y caja asignados por el SERVIDOR; el cliente no aporta fecha ni terminal', async () => {
    await service.create('T', 'U', dto({ solicitudId: '3f2b8c1e-9a4d-4e6b-8c7a-1d2e3f4a5b6c' }));
    const data = prisma.venta.create.mock.calls[0][0].data;
    // D3 (CENTINELA): el identificador interno se deriva por empresa para que otra empresa no pueda inferir la solicitud.
    expect(data).toMatchObject({ id: idSolicitud('T', '3f2b8c1e-9a4d-4e6b-8c7a-1d2e3f4a5b6c'), numeroVenta: 7, estado: 'COMPLETADA', cajaId: 'caja-1', metodoPago: 'EFECTIVO' });
    for (const campo of ['createdAt', 'efectivoRecibido', 'cambio', 'terminalId', 'creadaOffline', 'cai', 'numeroFiscal']) {
      expect(data).not.toHaveProperty(campo);
    }
  });

  it('reserva existencias (stockReservado), no descuenta stockActual; ISV 15 % sobre la base', async () => {
    await service.create('T', 'U', dto());
    expect(prisma.producto.updateMany.mock.calls[0][0].data).toEqual({ stockReservado: { increment: 2 } });
    const data = prisma.venta.create.mock.calls[0][0].data;
    expect([data.subtotal, data.isv, data.total]).toEqual([20, 3, 23]);
  });

  it('replay con el mismo solicitudId y contenido devuelve la venta original sin tocar inventario ni numeración', async () => {
    prisma.venta.findUnique.mockResolvedValue(ventaCreada({ id: 'S' }));
    const resultado = await service.create('T', 'U', dto({ solicitudId: 'S' }));
    expect(resultado.id).toBe('S');
    expect(prisma.venta.create).not.toHaveBeenCalled();
    expect(prisma.producto.updateMany).not.toHaveBeenCalled();
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1); // solo el advisory lock; sin INSERT de secuencia
    expect(String(prisma.$queryRaw.mock.calls[0][0])).toContain('pg_advisory_xact_lock');
  });

  it('el mismo solicitudId con otra cantidad, otro precio o distinto usuario responde 409 (nunca sobrescribe)', async () => {
    prisma.venta.findUnique.mockResolvedValue(ventaCreada({ id: 'S' }));
    await expect(service.create('T', 'U', dto({ solicitudId: 'S', detalles: [{ productoId: 'p1', cantidad: 3, precioUnitario: 10 }] }))).rejects.toMatchObject({ status: 409 });
    await expect(service.create('T', 'U', dto({ solicitudId: 'S', detalles: [{ productoId: 'p1', cantidad: 2, precioUnitario: 11 }] }))).rejects.toMatchObject({ status: 409 });
    await expect(service.create('T', 'OTRO', dto({ solicitudId: 'S' }))).rejects.toMatchObject({ status: 409 });
    expect(prisma.venta.create).not.toHaveBeenCalled();
  });

  it('SIN solicitudId no hay idempotencia: dos envíos idénticos crean dos ventas (solicitudId es opcional en el DTO)', async () => {
    await service.create('T', 'U', dto());
    await service.create('T', 'U', dto());
    expect(prisma.venta.create).toHaveBeenCalledTimes(2);
    expect(prisma.venta.findUnique).not.toHaveBeenCalled();
  });

  it('agregar descuento de otra forma no cambia el hash: el contenido comparado incluye descuento y cliente', async () => {
    prisma.venta.findUnique.mockResolvedValue(ventaCreada({ id: 'S' }));
    await expect(service.create('T', 'U', dto({ solicitudId: 'S', descuento: 1 }))).rejects.toMatchObject({ status: 409 });
  });

  it('la existencia mostrada por un catálogo local no decide: el servidor rechaza si no alcanza la disponibilidad libre', async () => {
    prisma.producto.findFirst.mockResolvedValue({ ...PRODUCTO, stockActual: 5, stockReservado: 4 });
    await expect(service.create('T', 'U', dto())).rejects.toMatchObject({ status: 400 });
    expect(prisma.venta.create).not.toHaveBeenCalled();
  });

  it('un cliente puede declarar venta sinInventario con proveedor: no reserva stock (camino de excepción existente)', async () => {
    rol = 'ADMIN';
    prisma.$queryRawUnsafe.mockImplementation(async (sql: string) => {
      if (sql.includes('SELECT u.rol')) return [{ rol, descuento_maximo: 100 }];
      if (sql.includes('SELECT * FROM cajas')) return [{ id: 'caja-1' }];
      if (sql.includes('FROM proveedores')) return [{ id: 'prov-1' }];
      return [];
    });
    await service.create('T', 'U', { detalles: [{ productoId: 'p1', cantidad: 50, precioUnitario: 10, sinInventario: true, proveedorId: 'prov-1' }] });
    expect(prisma.producto.updateMany).not.toHaveBeenCalled();
  });
});
