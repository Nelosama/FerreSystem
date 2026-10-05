import { ConflictException, ForbiddenException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { CotizacionesService } from '../cotizaciones/cotizaciones.service';
import { LevantamientosService } from '../levantamientos/levantamientos.service';
import { authorizedActor, type Tx } from '../operaciones/ledger';
import { OperacionesService } from '../operaciones/operaciones.service';
import { PrismaService } from '../prisma/prisma.service';
import { ProductosService } from '../productos/productos.service';
import { UsuariosService } from '../usuarios/usuarios.service';
import { VentasService } from '../ventas/ventas.service';

const tenantId = 'tenant-A';
const actorId = 'user-A';
const productId = 'product-A';
const saleDto = { detalles: [{ productoId: productId, cantidad: 1 }] };

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

// El lock está pendiente mientras otra transacción cambia al actor. La lectura
// real de authorizedActor consulta el estado actualizado al liberar el bloqueo.
function fixture() {
  const entered = deferred();
  const release = deferred();
  const current = {
    rol: 'CAJERO',
    permisos: ['pos.vender'],
    permisos_configurados: true,
    descuento_maximo: 0,
    activo: true,
    tenantActivo: true,
  };
  const actorReads = vi.fn(() => ({
    ...current,
    permisos: [...current.permisos],
  }));
  const product = {
    id: productId,
    tenantId,
    activo: true,
    nombre: 'Cable',
    codigo: 'CABLE',
    precioVenta: 10,
    precioCosto: 5,
    stockActual: 10,
    stockReservado: 0,
    stockMinimo: 0,
  };
  const target = {
    id: 'target-A',
    tenantId,
    nombre: 'Persona',
    rol: 'CAJERO',
    activo: true,
  };
  const tx = {
    $queryRawUnsafe: vi.fn(async (sql: string, ...args: unknown[]) => {
      if (sql.includes('pg_advisory_xact_lock')) {
        expect(args).toEqual([`OPERACION:${tenantId}`]);
        entered.resolve();
        await release.promise;
        return [];
      }
      if (sql.includes('FROM usuarios u JOIN tenants t')) {
        expect(sql).toContain('u.id=$1 AND u.tenant_id=$2');
        expect(sql).toContain('u.activo=true');
        expect(sql).toContain("t.estado='ACTIVO'");
        if (args[0] !== actorId || args[1] !== tenantId) return [];
        const user = actorReads();
        return user.activo && user.tenantActivo ? [user] : [];
      }
      if (sql.includes('SELECT * FROM cajas')) return [{ id: 'cash-A' }];
      return [];
    }),
    $queryRaw: vi.fn().mockResolvedValue([{ ultimo_numero: 1 }]),
    producto: {
      findFirst: vi.fn(async () => ({ ...product })),
      updateMany: vi.fn(async ({ data }) => {
        product.stockReservado += data.stockReservado.increment;
        return { count: 1 };
      }),
      update: vi.fn(),
      create: vi.fn(),
    },
    venta: {
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn(async ({ data }) => ({
        ...data,
        id: 'sale-A',
        detalles: [],
      })),
    },
    usuario: {
      findFirst: vi.fn(async () => ({ ...target })),
      update: vi.fn(async ({ data }) => ({ ...target, ...data })),
      create: vi.fn(),
      count: vi.fn().mockResolvedValue(1),
    },
    cotizacion: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    levantamiento: { findFirst: vi.fn(), update: vi.fn() },
    levantamientoItem: { update: vi.fn() },
  };
  const prisma = {
    ...tx,
    $transaction: vi.fn(async (callback) => callback(tx)),
  };
  const rawWrites = () =>
    tx.$queryRawUnsafe.mock.calls.filter(([sql]) =>
      /^\s*(INSERT|UPDATE|DELETE)\b/i.test(sql),
    );
  function expectNoEffects() {
    expect(tx.$queryRaw).not.toHaveBeenCalled();
    expect(tx.producto.updateMany).not.toHaveBeenCalled();
    expect(tx.producto.update).not.toHaveBeenCalled();
    expect(tx.producto.create).not.toHaveBeenCalled();
    expect(tx.venta.create).not.toHaveBeenCalled();
    expect(tx.usuario.update).not.toHaveBeenCalled();
    expect(tx.usuario.create).not.toHaveBeenCalled();
    expect(tx.cotizacion.update).not.toHaveBeenCalled();
    expect(tx.levantamiento.update).not.toHaveBeenCalled();
    expect(tx.levantamientoItem.update).not.toHaveBeenCalled();
    expect(rawWrites()).toEqual([]);
    expect(product.stockReservado).toBe(0);
  }
  return {
    current,
    target,
    tx,
    prisma: prisma as unknown as PrismaService,
    entered,
    release,
    actorReads,
    rawWrites,
    expectNoEffects,
  };
}

describe('Autorización vigente después de esperar el bloqueo del tenant', () => {
  it.each([
    ['democión a BODEGUERO', { rol: 'BODEGUERO' }],
    ['revocación de pos.vender', { permisos: [] }],
    ['desactivación del usuario', { activo: false }],
    ['suspensión de la empresa', { tenantActivo: false }],
  ])(
    'rechaza la venta tras %s sin reservar stock, cobrar ni auditar',
    async (_name, changes) => {
      const f = fixture();
      const service = new VentasService(f.prisma);
      const pending = service.create(tenantId, actorId, saleDto);
      await f.entered.promise;
      expect(f.actorReads).not.toHaveBeenCalled();
      f.expectNoEffects();
      Object.assign(f.current, changes);
      const rejected =
        expect(pending).rejects.toBeInstanceOf(ForbiddenException);
      f.release.resolve();
      await rejected;
      expect(f.actorReads).toHaveBeenCalledTimes(1);
      expect(f.tx.producto.findFirst).not.toHaveBeenCalled();
      f.expectNoEffects();
    },
  );

  it('rechaza también un reintento ya registrado después de revocar el rol', async () => {
    const f = fixture();
    f.tx.venta.findUnique.mockResolvedValue({
      id: 'request-A',
      tenantId,
      usuarioId: actorId,
      clienteId: null,
      metodoPago: 'EFECTIVO',
      descuento: 0,
      notas: null,
      subtotal: 10,
      isv: 1.5,
      total: 11.5,
      detalles: [{ productoId: productId, cantidad: 1, precioUnitario: 10 }],
    });
    const pending = new VentasService(f.prisma).create(tenantId, actorId, {
      ...saleDto,
      solicitudId: 'request-A',
    });
    await f.entered.promise;
    f.current.rol = 'BODEGUERO';
    const rejected = expect(pending).rejects.toBeInstanceOf(ForbiddenException);
    f.release.resolve();
    await rejected;
    expect(f.tx.venta.findUnique).not.toHaveBeenCalled();
    f.expectNoEffects();
  });

  it.each<[string, boolean, string[]]>([
    ['CAJERO', true, ['pos.vender']],
    ['VENDEDOR', true, ['pos.vender']],
    ['ADMIN', true, []],
    ['CAJERO', false, []],
  ])(
    'permite venta al rol %s con permisosConfigurados=%s',
    async (rol, configured, permissions) => {
      const f = fixture();
      const pending = new VentasService(f.prisma).create(
        tenantId,
        actorId,
        saleDto,
      );
      await f.entered.promise;
      expect(f.actorReads).not.toHaveBeenCalled();
      Object.assign(f.current, {
        rol,
        permisos_configurados: configured,
        permisos: permissions,
      });
      f.release.resolve();
      await expect(pending).resolves.toMatchObject({
        total: 11.5,
        usuarioId: actorId,
      });
      expect(f.tx.producto.updateMany).toHaveBeenCalledTimes(1);
      expect(f.tx.venta.create).toHaveBeenCalledTimes(1);
      expect(f.rawWrites().map(([sql]) => sql)).toEqual([
        expect.stringContaining('INSERT INTO movimientos_caja'),
        expect.stringContaining('INSERT INTO auditoria_operaciones'),
      ]);
    },
  );

  it.each<[string, Partial<ReturnType<typeof fixture>['current']>]>([
    ['democión del administrador', { rol: 'CAJERO' }],
    ['desactivación del administrador', { activo: false }],
  ])('no edita usuarios tras %s durante la espera', async (_name, changes) => {
    const f = fixture();
    f.current.rol = 'ADMIN';
    const pending = new UsuariosService(f.prisma).update(
      tenantId,
      f.target.id,
      { nombre: 'Nombre nuevo' },
      actorId,
    );
    await f.entered.promise;
    expect(f.actorReads).not.toHaveBeenCalled();
    Object.assign(f.current, changes);
    const rejected = expect(pending).rejects.toBeInstanceOf(ForbiddenException);
    f.release.resolve();
    await rejected;
    expect(f.tx.usuario.findFirst).not.toHaveBeenCalled();
    f.expectNoEffects();
  });

  it('permite al administrador vigente editar usuarios sin permisos explícitos', async () => {
    const f = fixture();
    Object.assign(f.current, { rol: 'ADMIN', permisos: [] });
    const pending = new UsuariosService(f.prisma).update(
      tenantId,
      f.target.id,
      { nombre: 'Nombre nuevo' },
      actorId,
    );
    await f.entered.promise;
    f.release.resolve();
    await expect(pending).resolves.toMatchObject({
      id: f.target.id,
      nombre: 'Nombre nuevo',
    });
    expect(f.tx.usuario.update).toHaveBeenCalledTimes(1);
    expect(f.rawWrites()).toHaveLength(1);
    expect(f.rawWrites()[0][0]).toContain('INSERT INTO auditoria_operaciones');
  });

  it.each([{ activo: false }, { rol: 'CAJERO' as const }])(
    'protege al último ADMIN activo ante %j',
    async (dto) => {
      const f = fixture();
      f.current.rol = 'ADMIN';
      f.target.rol = 'ADMIN';
      const pending = new UsuariosService(f.prisma).update(
        tenantId,
        f.target.id,
        dto,
        actorId,
      );
      await f.entered.promise;
      const rejected =
        expect(pending).rejects.toBeInstanceOf(ConflictException);
      f.release.resolve();
      await rejected;
      expect(f.tx.usuario.count).toHaveBeenCalledWith({
        where: { tenantId, rol: 'ADMIN', activo: true },
      });
      f.expectNoEffects();
    },
  );

  it.each<
    [
      string,
      string,
      string[],
      Partial<ReturnType<typeof fixture>['current']>,
      (prisma: PrismaService) => Promise<unknown>,
    ]
  >([
    [
      'convertir cotización tras democión',
      'CAJERO',
      ['cotizaciones.convertir_venta'],
      { rol: 'VENDEDOR' },
      (prisma: PrismaService) =>
        new CotizacionesService(prisma).convertirAVenta(
          tenantId,
          actorId,
          'quote-A',
        ),
    ],
    [
      'convertir cotización sin permiso',
      'CAJERO',
      ['cotizaciones.convertir_venta'],
      { permisos: [] },
      (prisma: PrismaService) =>
        new CotizacionesService(prisma).convertirAVenta(
          tenantId,
          actorId,
          'quote-A',
        ),
    ],
    [
      'editar inventario sin permiso',
      'BODEGUERO',
      ['inventario.editar'],
      { permisos: [] },
      (prisma: PrismaService) =>
        new ProductosService(prisma).update(
          tenantId,
          productId,
          { nombre: 'Otro' },
          actorId,
        ),
    ],
    [
      'registrar pago tras democión',
      'CAJERO',
      [],
      { rol: 'VENDEDOR' },
      (prisma: PrismaService) =>
        new OperacionesService(prisma).pagar(tenantId, actorId, 'account-A', {
          solicitudId: 'payment-A',
          monto: 1,
          metodo: 'EFECTIVO',
        }),
    ],
    [
      'devolver venta tras democión',
      'ADMIN',
      [],
      { rol: 'CAJERO' },
      (prisma: PrismaService) =>
        new OperacionesService(prisma).devolver(tenantId, actorId, 'sale-A', {
          solicitudId: 'return-A',
          motivo: 'Devolución',
          metodo: 'EFECTIVO',
          items: [{ detalleId: 'line-A', cantidad: 1, destino: 'INVENTARIO' }],
        }),
    ],
    [
      'aplicar levantamiento tras democión',
      'ADMIN',
      [],
      { rol: 'BODEGUERO' },
      (prisma: PrismaService) =>
        new LevantamientosService(prisma).aplicar(
          tenantId,
          actorId,
          'count-A',
          'preview-token',
        ),
    ],
  ])(
    'vuelve a autorizar antes de %s',
    async (_name, rol, permissions, changes, execute) => {
      const f = fixture();
      Object.assign(f.current, { rol, permisos: permissions });
      const pending = execute(f.prisma);
      await f.entered.promise;
      expect(f.actorReads).not.toHaveBeenCalled();
      Object.assign(f.current, changes);
      const rejected =
        expect(pending).rejects.toBeInstanceOf(ForbiddenException);
      f.release.resolve();
      await rejected;
      f.expectNoEffects();
    },
  );

  it('el helper limita la consulta al usuario y tenant solicitados', async () => {
    const f = fixture();
    await expect(
      authorizedActor(
        f.tx as unknown as Tx,
        'tenant-B',
        actorId,
        ['CAJERO'],
        'pos.vender',
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      authorizedActor(
        f.tx as unknown as Tx,
        tenantId,
        'user-B',
        ['CAJERO'],
        'pos.vender',
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(f.tx.$queryRawUnsafe.mock.calls.map(([, ...args]) => args)).toEqual([
      [actorId, 'tenant-B'],
      ['user-B', tenantId],
    ]);
    f.expectNoEffects();
  });
});
