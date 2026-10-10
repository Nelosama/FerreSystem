import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { createServer } from 'node:net';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../src/prisma/prisma.service';
import { OperacionesService } from '../src/operaciones/operaciones.service';
import { LevantamientosService } from '../src/levantamientos/levantamientos.service';
import { ProductosService } from '../src/productos/productos.service';
import { VentasService } from '../src/ventas/ventas.service';

// Auditoría del ciclo de inventario (compra → recepción → ajuste → conteo → aplicación).
// Clúster PostgreSQL desechable, usuario no root. Nunca usa DATABASE_URL productiva ni migraciones.
describe('Ciclo de inventario / PostgreSQL real', () => {
  const bin = process.env.PG_BIN || '/usr/bin';
  const exe = (name: string) => join(bin, name);
  let directory: string, prisma: PrismaService, started = false;
  let operaciones: OperacionesService, levantamientos: LevantamientosService, productos: ProductosService, ventas: VentasService;
  let tenantId: string, adminId: string, bodegueroId: string, proveedorId: string;

  const crearProducto = async (datos: Record<string, unknown>) => (await prisma.producto.create({
    data: { tenantId, codigo: 'CABLE', nombre: 'Cable metro', unidadMedida: 'METRO', precioCosto: 2, precioVenta: 4, stockActual: 0, stockMinimo: 0, ...datos } as any,
  })).id;
  const stockDe = async (productoId: string) => Number((await prisma.producto.findUniqueOrThrow({ where: { id: productoId } })).stockActual);

  beforeAll(async () => {
    if (!existsSync(exe('initdb'))) throw new Error(`PostgreSQL no instalado en ${bin}`);
    directory = mkdtempSync(join(tmpdir(), 'ferresystem-inv-ciclo-'));
    const listener = createServer();
    await new Promise<void>((done, reject) => { listener.once('error', reject); listener.listen(0, '127.0.0.1', done); });
    const port = (listener.address() as { port: number }).port;
    await new Promise<void>(done => listener.close(() => done()));
    const url = `postgresql://postgres@127.0.0.1:${port}/postgres`;
    const env = { ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('PG'))), DATABASE_URL: url, DIRECT_URL: url, PGHOST: '127.0.0.1', PGPORT: String(port), PGDATABASE: 'postgres', PGUSER: 'postgres', PGPASSFILE: join(directory, 'no-password-file'), PGSSLMODE: 'disable' };
    const options = { windowsHide: true, timeout: 60000, env, stdio: 'pipe' as const };
    execFileSync(exe('initdb'), ['-D', join(directory, 'data'), '-U', 'postgres', '-A', 'trust', '--locale=C', '-E', 'UTF8', '--no-sync'], options);
    execFileSync(exe('pg_ctl'), ['-D', join(directory, 'data'), '-l', join(directory, 'postgres.log'), '-o', `-h 127.0.0.1 -p ${port} -k ${directory}`, '-w', 'start'], { ...options, stdio: 'ignore' });
    started = true;
    const ddl = execFileSync(process.execPath, [resolve('node_modules/prisma/build/index.js'), 'migrate', 'diff', '--from-empty', '--to-schema-datamodel', resolve('prisma/schema.prisma'), '--script'], options);
    writeFileSync(join(directory, 'schema.sql'), ddl);
    execFileSync(exe('psql'), ['-X', '-h', '127.0.0.1', '-p', String(port), '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-f', join(directory, 'schema.sql')], options);
    prisma = new PrismaService({ datasources: { db: { url } } });
    await prisma.$connect();
    operaciones = new OperacionesService(prisma);
    levantamientos = new LevantamientosService(prisma);
    productos = new ProductosService(prisma);
    ventas = new VentasService(prisma);
  }, 180000);

  afterAll(async () => {
    try { await prisma?.$disconnect(); }
    finally {
      if (started) execFileSync(exe('pg_ctl'), ['-D', join(directory, 'data'), '-m', 'immediate', '-w', 'stop'], { windowsHide: true, timeout: 15000, stdio: 'ignore' });
      if (directory && resolve(directory).startsWith(resolve(tmpdir()) + sep) && directory.includes('ferresystem-inv-ciclo-')) {
        rmSync(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
      }
    }
  });

  beforeEach(async () => {
    tenantId = randomUUID();
    await prisma.tenant.create({ data: { id: tenantId, nombreComercial: 'Ferretería sintética' } });
    adminId = randomUUID();
    bodegueroId = randomUUID();
    for (const [id, rol] of [[adminId, 'ADMIN'], [bodegueroId, 'BODEGUERO']] as const) {
      await prisma.usuario.create({ data: { id, tenantId, nombre: rol, email: `${id}@test.invalid`, passwordHash: 'no-es-clave', rol, permisosConfigurados: true, permisos: ['inventario.editar', 'inventario.ver'] } });
    }
    proveedorId = randomUUID();
    await prisma.$executeRawUnsafe('INSERT INTO proveedores (id,tenant_id,nombre,updated_at) VALUES ($1,$2,$3,NOW())', proveedorId, tenantId, 'Proveedor sintético');
  });

  // Compra y recepción reales: la recepción suma existencias y registra costo histórico.
  async function comprarYRecibir(productoId: string, cantidad: number, costo: number) {
    const orden = await operaciones.compra(tenantId, bodegueroId, {
      solicitudId: randomUUID(), proveedorId, numeroFactura: `F-${randomUUID().slice(0, 8)}`, isv: 0,
      items: [{ productoId, cantidad, costo }],
    } as any);
    const [detalle] = await prisma.$queryRawUnsafe<{ id: string }[]>('SELECT id FROM detalles_orden_compra WHERE orden_id=$1', orden.id);
    await operaciones.recibir(tenantId, bodegueroId, orden.id, { solicitudId: randomUUID(), items: [{ detalleId: detalle.id, cantidad }] } as any);
    return orden;
  }

  // QA-AJ-001 (P1): un ajuste absoluto preparado antes de una recepción borra mercancía recibida.
  it('un ajuste con existencias anteriores obsoletas es rechazado y no borra una recepción', async () => {
    const productoId = await crearProducto({ stockActual: 10 });
    await comprarYRecibir(productoId, 5, 3);
    expect(await stockDe(productoId)).toBe(15);

    // El operador vio 10 antes de la recepción y quiere fijar 12.
    await expect(operaciones.ajustar(tenantId, adminId, productoId, {
      solicitudId: randomUUID(), stock: 12, motivo: 'Conteo de mostrador', stockAnterior: 10,
    } as any)).rejects.toBeInstanceOf(ConflictException);
    expect(await stockDe(productoId)).toBe(15);
  });

  it('un ajuste sin existencias anteriores se rechaza antes de escribir', async () => {
    const productoId = await crearProducto({ stockActual: 10 });
    await expect(operaciones.ajustar(tenantId, adminId, productoId, {
      solicitudId: randomUUID(), stock: 12, motivo: 'Conteo de mostrador',
    } as any)).rejects.toBeInstanceOf(BadRequestException);
    expect(await stockDe(productoId)).toBe(10);
  });

  // QA-COS-001 (P1): VENDEDOR puede buscar ventas; la consulta cruda devolvía costo_unitario de cada línea.
  it('buscar una venta no expone el costo unitario de sus líneas', async () => {
    const productoId = await crearProducto({ stockActual: 10 });
    const cajaId = randomUUID();
    await prisma.caja.create({ data: { id: cajaId, tenantId, codigo: `CAJA-${cajaId}`, usuarioId: adminId, montoApertura: 0 } as any });
    await prisma.venta.create({ data: {
      tenantId, numeroVenta: 1, usuarioId: adminId, cajaId, subtotal: 8, isv: 0, descuento: 0, total: 8,
      metodoPago: 'EFECTIVO', tipoPago: 'CONTADO', estado: 'COMPLETADA',
      detalles: { create: [{ productoId, cantidad: 2, precioUnitario: 4, subtotal: 8, costoUnitario: 2, sinInventario: false }] },
    } as any });
    const venta = await operaciones.buscarVenta(tenantId, '1');
    expect(venta.items).toHaveLength(1);
    expect(venta.items[0]).not.toHaveProperty('costo_unitario');
    expect(Number(venta.items[0].precio_unitario)).toBe(4);
  });

  // ── Regla de precios (dueño): auditoría solo cuenta; precios los define ADMIN ──
  const conteo = async (productoId: string | null, datos: Record<string, unknown>) => {
    const lev = await levantamientos.create(tenantId, adminId, { nombre: `Conteo ${randomUUID().slice(0, 6)}` } as any);
    await levantamientos.createItem(tenantId, lev.id, { solicitudId: randomUUID(), descripcion: 'Cable metro', unidad: 'METRO', cantidad: 9, ...datos } as any, adminId);
    await levantamientos.update(tenantId, lev.id, { estado: 'FINALIZADO' } as any, adminId);
    return lev;
  };

  it('aplicar una auditoría solo cambia existencias: costo, precio, margen, marca y código de barras no se tocan', async () => {
    const productoId = await crearProducto({ stockActual: 8, precioCosto: 2, precioVenta: 4, margen: 50, marca: 'Truper', codigoBarras: '001234' });
    const lev = await conteo(productoId, { codigo: 'CABLE', codigoBarras: '001234', marca: 'Makita', precioCosto: 7, precioVenta: 9, margen: 90 });
    const { token } = await levantamientos.previsualizar(tenantId, lev.id);
    await levantamientos.aplicar(tenantId, adminId, lev.id, token);

    const producto = await prisma.producto.findUniqueOrThrow({ where: { id: productoId } });
    expect([Number(producto.stockActual), Number(producto.precioCosto), Number(producto.precioVenta), Number(producto.margen), producto.marca, producto.codigoBarras, producto.version])
      .toEqual([9, 2, 4, 50, 'Truper', '001234', 2]);
    // Trazabilidad: la diferencia de existencias queda como movimiento con responsable; el precio contado queda advertido.
    const movimiento = await prisma.movimientoInventario.findFirstOrThrow({ where: { tenantId, productoId, tipo: 'LEVANTAMIENTO' } });
    expect([Number(movimiento.anterior), Number(movimiento.nuevo), movimiento.usuarioId]).toEqual([8, 9, adminId]);
    const aplicado = await prisma.auditoriaOperacion.findFirstOrThrow({ where: { tenantId, operacion: 'LEVANTAMIENTO_APLICAR', entidadId: lev.id } });
    expect(JSON.stringify(aplicado.datos)).toContain('no se aplica');
  });

  it('un producto nuevo de la auditoría queda pendiente de precio: inactivo, sin precio y fuera de venta', async () => {
    const lev = await conteo(null, { codigo: 'NUEVO-1', descripcion: 'Varilla 3/8', precioCosto: 25, precioVenta: 35, margen: 40 });
    const { token } = await levantamientos.previsualizar(tenantId, lev.id);
    await levantamientos.aplicar(tenantId, adminId, lev.id, token);

    const nuevo = await prisma.producto.findFirstOrThrow({ where: { tenantId, codigo: 'NUEVO-1' } });
    expect([nuevo.activo, Number(nuevo.precioCosto), Number(nuevo.precioVenta), nuevo.margen, Number(nuevo.stockActual)]).toEqual([false, 0, 0, null, 9]);
    // Una venta solo encuentra productos activos: el pendiente no se puede vender.
    expect(await prisma.producto.findFirst({ where: { id: nuevo.id, tenantId, activo: true } })).toBeNull();
  });

  it('un token de vista previa caduca si cambia el precio del catálogo: no se aplica un conteo con precio viejo', async () => {
    const productoId = await crearProducto({ stockActual: 8, precioVenta: 4 });
    const lev = await conteo(productoId, { codigo: 'CABLE', cantidad: 9 } as any);
    const { token } = await levantamientos.previsualizar(tenantId, lev.id);
    await productos.update(tenantId, productoId, { version: 1, precioVenta: 5 } as any, adminId);
    await expect(levantamientos.aplicar(tenantId, adminId, lev.id, token)).rejects.toBeInstanceOf(ConflictException);
    expect(await stockDe(productoId)).toBe(8);
  });

  it('aplicar dos veces no duplica movimientos ni existencias', async () => {
    const productoId = await crearProducto({ stockActual: 8 });
    const lev = await conteo(productoId, { codigo: 'CABLE' });
    const { token } = await levantamientos.previsualizar(tenantId, lev.id);
    await levantamientos.aplicar(tenantId, adminId, lev.id, token);
    await levantamientos.aplicar(tenantId, adminId, lev.id, token);
    expect(await stockDe(productoId)).toBe(9);
    expect(await prisma.movimientoInventario.count({ where: { tenantId, productoId, tipo: 'LEVANTAMIENTO' } })).toBe(1);
  });

  it('solo ADMIN cambia costo, precio o margen; BODEGUERO conserva existencias y repetir el valor no cuenta como cambio', async () => {
    const productoId = await crearProducto({ stockActual: 8, precioCosto: 2, precioVenta: 4, margen: 50 });
    await expect(productos.update(tenantId, productoId, { version: 1, precioVenta: 5 } as any, bodegueroId)).rejects.toBeInstanceOf(ForbiddenException);
    // Importación repite el valor vigente: no es cambio de precio y no se rechaza.
    const sinCambio = await productos.update(tenantId, productoId, { version: 1, precioVenta: 4, precioCosto: 2, margen: 50 } as any, bodegueroId);
    expect(Number(sinCambio.precioVenta)).toBe(4);
    const ajuste = await productos.update(tenantId, productoId, { version: 2, stockAnterior: 8, stockActual: 10, motivo: 'Conteo' } as any, bodegueroId);
    expect(Number(ajuste.stockActual)).toBe(10);
    expect(Number((await prisma.producto.findUniqueOrThrow({ where: { id: productoId } })).precioVenta)).toBe(4);
  });

  it('un producto pendiente no se habilita sin precio de venta; el ADMIN lo habilita al definir precio', async () => {
    const lev = await conteo(null, { codigo: 'PEND-1', descripcion: 'Tornillo' });
    const { token } = await levantamientos.previsualizar(tenantId, lev.id);
    await levantamientos.aplicar(tenantId, adminId, lev.id, token);
    const pendiente = await prisma.producto.findFirstOrThrow({ where: { tenantId, codigo: 'PEND-1' } });
    await expect(productos.update(tenantId, pendiente.id, { version: pendiente.version, activo: true } as any, adminId)).rejects.toBeInstanceOf(BadRequestException);
    const habilitado = await productos.update(tenantId, pendiente.id, { version: pendiente.version, activo: true, precioCosto: 1, precioVenta: 2 } as any, adminId);
    expect([habilitado.activo, Number(habilitado.precioVenta)]).toEqual([true, 2]);
  });

  // ── Decisiones KARDEX (PR #134): permisos de BODEGUERO, pendientes y costos por compra ──
  it('BODEGUERO no define precios al dar de alta: con valores distintos de cero se rechaza; con cero queda pendiente e inactivo', async () => {
    await expect(productos.create(tenantId, { nombre: 'Varilla', precioCosto: 25, precioVenta: 35, stockActual: 0, stockMinimo: 0, unidadMedida: 'UNIDAD' } as any, bodegueroId))
      .rejects.toBeInstanceOf(ForbiddenException);
    await expect(productos.create(tenantId, { nombre: 'Varilla', precioCosto: 0, precioVenta: 0, margen: 40, stockActual: 0, stockMinimo: 0, unidadMedida: 'UNIDAD' } as any, bodegueroId))
      .rejects.toBeInstanceOf(ForbiddenException);
    const creado = await productos.create(tenantId, { nombre: 'Varilla', codigo: 'VAR-B', precioCosto: 0, precioVenta: 0, stockActual: 5, stockMinimo: 0, unidadMedida: 'UNIDAD' } as any, bodegueroId);
    expect([creado.activo, creado.pendienteConfiguracion, Number(creado.precioVenta), Number(creado.precioCosto), creado.margen, Number(creado.stockActual)]).toEqual([false, true, 0, 0, null, 5]);
  });

  it('ADMIN da de alta con precio y costo vigente sincronizados; un producto así no es pendiente', async () => {
    const admin = await productos.create(tenantId, { nombre: 'Canaleta', codigo: 'CAN-1', precioCosto: 6, precioVenta: 9, margen: 33, stockActual: 2, stockMinimo: 0, unidadMedida: 'UNIDAD' } as any, adminId);
    const fila = await prisma.producto.findUniqueOrThrow({ where: { id: admin.id } });
    expect([fila.activo, Number(fila.precioCosto), Number(fila.costoVigente), Number(fila.precioVenta)]).toEqual([true, 6, 6, 9]);
    expect(admin.pendienteConfiguracion).toBe(false);
  });

  it('el administrador localiza los pendientes de configuración con un filtro que BODEGUERO no puede usar', async () => {
    await productos.create(tenantId, { nombre: 'Pendiente', codigo: 'PEND-L', precioCosto: 0, precioVenta: 0, stockActual: 1, stockMinimo: 0, unidadMedida: 'UNIDAD' } as any, bodegueroId);
    await productos.create(tenantId, { nombre: 'Configurado', codigo: 'CONF-L', precioCosto: 1, precioVenta: 2, stockActual: 1, stockMinimo: 0, unidadMedida: 'UNIDAD' } as any, adminId);
    const pendientes = await productos.findAll(tenantId, undefined, undefined, false, true);
    expect(pendientes.map((p: any) => p.codigo)).toEqual(['PEND-L']);
  });

  it('una edición de costo por ADMIN actualiza costo comercial y costo vigente juntos; precio de venta no cambia', async () => {
    const productoId = await crearProducto({ stockActual: 1, precioCosto: 2, costoVigente: 2, precioVenta: 4 });
    const editado = await productos.update(tenantId, productoId, { version: 1, precioCosto: 3 } as any, adminId);
    const fila = await prisma.producto.findUniqueOrThrow({ where: { id: productoId } });
    expect([Number(fila.precioCosto), Number(fila.costoVigente), Number(fila.precioVenta)]).toEqual([3, 3, 4]);
    expect(editado.version).toBe(2);
  });

  it('recibir una compra más barata baja el costo vigente, conserva el histórico con proveedor y no cambia el precio de venta', async () => {
    const productoId = await crearProducto({ stockActual: 0, precioCosto: 2, costoVigente: 2, precioVenta: 4 });
    await comprarYRecibir(productoId, 5, 3);
    await comprarYRecibir(productoId, 4, 2.5);
    const fila = await prisma.producto.findUniqueOrThrow({ where: { id: productoId } });
    expect([Number(fila.precioCosto), Number(fila.costoVigente), Number(fila.precioVenta), Number(fila.stockActual)]).toEqual([2.5, 2.5, 4, 9]);
    const historico = await prisma.$queryRawUnsafe<any[]>('SELECT costo, proveedor_id FROM costos_compra WHERE tenant_id=$1 AND producto_id=$2 ORDER BY fecha', tenantId, productoId);
    expect(historico.map(h => Number(h.costo))).toEqual([3, 2.5]);
    expect(historico.every(h => h.proveedor_id === proveedorId)).toBe(true);
  });

  // ── P0 (PR #134): nunca queda disponible para venta un producto sin precio de venta válido ──
  it('P0: ADMIN da de alta sin precio de venta y el producto no queda disponible', async () => {
    const creado = await productos.create(tenantId, { nombre: 'Sin precio', codigo: 'SP-1', precioCosto: 3, precioVenta: 0, stockActual: 1, stockMinimo: 0, unidadMedida: 'UNIDAD' } as any, adminId);
    expect([creado.activo, creado.pendienteConfiguracion]).toEqual([false, true]);
    expect(await prisma.producto.findFirst({ where: { id: creado.id, tenantId, activo: true } })).toBeNull();
  });

  it('P0: fijar precio de venta cero a un producto activo se rechaza y conserva el precio', async () => {
    const productoId = await crearProducto({ stockActual: 1, precioVenta: 4 });
    await expect(productos.update(tenantId, productoId, { version: 1, precioVenta: 0 } as any, adminId)).rejects.toBeInstanceOf(BadRequestException);
    expect(Number((await prisma.producto.findUniqueOrThrow({ where: { id: productoId } })).precioVenta)).toBe(4);
  });

  it('P0: una venta no usa un producto activo sin precio de venta válido, aunque la base lo tenga así', async () => {
    const productoId = await crearProducto({ stockActual: 10, precioVenta: 0 });
    const cajaId = randomUUID();
    await prisma.caja.create({ data: { id: cajaId, tenantId, codigo: `CAJA-${cajaId}`, usuarioId: adminId, montoApertura: 0 } as any });
    await expect(ventas.create(tenantId, adminId, { metodoPago: 'EFECTIVO', tipoPago: 'CONTADO', detalles: [{ productoId, cantidad: 1 }] } as any))
      .rejects.toBeInstanceOf(BadRequestException);
    expect(await stockDe(productoId)).toBe(10);
    expect(await prisma.venta.count({ where: { tenantId } })).toBe(0);
  });

  // P1 (PR #134): diagnóstico de costos históricos de solo lectura; no corrige datos.
  it('diagnóstico de costos es de solo lectura y clasifica costo comercial frente a costo vigente y última compra', async () => {
    const legado = await crearProducto({ codigo: 'DIAG-B', stockActual: 0, precioCosto: 5, costoVigente: 3 });
    await comprarYRecibir(legado, 2, 3);
    await prisma.producto.update({ where: { id: legado }, data: { precioCosto: 5, costoVigente: 3 } });
    const sinVigente = await crearProducto({ codigo: 'DIAG-C', stockActual: 0, precioCosto: 4, costoVigente: null });
    const igual = await crearProducto({ codigo: 'DIAG-A', stockActual: 0, precioCosto: 2, costoVigente: 2 });
    const antes = await prisma.producto.findMany({ where: { tenantId }, orderBy: { codigo: 'asc' } });

    const sql = readFileSync(resolve('scripts/diagnostico-costos-vigentes.sql'), 'utf8');
    const filas = await prisma.$transaction(async tx => {
      await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
      return tx.$queryRawUnsafe<any[]>(sql);
    });
    const propias = filas.filter(f => f.tenant_id === tenantId);
    expect(propias.map(f => [f.codigo, f.diagnostico])).toEqual([
      ['DIAG-B', 'COSTO_VIGENTE_COINCIDE_CON_ULTIMA_COMPRA'],
      ['DIAG-C', 'SIN_COSTO_VIGENTE'],
    ]);
    expect(Number(propias[0].costo_ultima_compra)).toBe(3);
    expect(propias.some(f => f.producto_id === igual)).toBe(false);

    // La transacción de solo lectura rechaza cualquier escritura.
    await expect(prisma.$transaction(async tx => {
      await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
      await tx.$executeRawUnsafe('UPDATE productos SET precio_costo = 0 WHERE tenant_id = $1', tenantId);
    })).rejects.toThrow();
    const despues = await prisma.producto.findMany({ where: { tenantId }, orderBy: { codigo: 'asc' } });
    expect(despues.map(p => [p.id, Number(p.precioCosto), p.costoVigente === null ? null : Number(p.costoVigente)]))
      .toEqual(antes.map(p => [p.id, Number(p.precioCosto), p.costoVigente === null ? null : Number(p.costoVigente)]));
    expect(sinVigente).toBeDefined();
  });
});
