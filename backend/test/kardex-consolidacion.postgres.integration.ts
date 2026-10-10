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

// KARDEX · consolidación #129/#134/#140: aprobación de precios, venta autorizada, privacidad comercial y conteo que solo cambia existencias.
// Clúster PostgreSQL desechable, usuario no root. Nunca usa DATABASE_URL productiva ni migraciones.
describe('KARDEX · consolidación de precios y aprobación / PostgreSQL real', () => {
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

  const ajusteStock = (id: string) => stockDe(id);
  // Un producto nuevo del personal queda sin precio aprobado; activo no equivale a aprobado.
  it('BODEGUERO registra producto sin precio: queda pendiente de aprobación, activo, y no se vende', async () => {
    const creado = await productos.create(tenantId, { nombre: 'Clavo', codigo: 'CLV-1', stockActual: 5, stockMinimo: 0, unidadMedida: 'UNIDAD', solicitudId: randomUUID() } as any, bodegueroId);
    expect([creado.activo, creado.precioAprobado, creado.pendienteConfiguracion, Number(creado.precioVenta)]).toEqual([true, false, true, 0]);
    const cajaId = randomUUID();
    await prisma.caja.create({ data: { id: cajaId, tenantId, codigo: `CAJA-${cajaId}`, usuarioId: adminId, montoApertura: 0 } as any });
    await expect(ventas.create(tenantId, adminId, { metodoPago: 'EFECTIVO', tipoPago: 'CONTADO', detalles: [{ productoId: creado.id, cantidad: 1 }] } as any))
      .rejects.toBeInstanceOf(BadRequestException);
    expect(await ajusteStock(creado.id)).toBe(5);
  });

  it('BODEGUERO no puede dar de alta con precio, costo ni margen', async () => {
    await expect(productos.create(tenantId, { nombre: 'Tuerca', precioVenta: 5, precioCosto: 1, stockActual: 0, stockMinimo: 0, unidadMedida: 'UNIDAD' } as any, bodegueroId))
      .rejects.toBeInstanceOf(ForbiddenException);
  });

  it('ADMIN aprueba el precio: el producto se vende; antes de aprobar, la venta se rechaza', async () => {
    const productoId = await crearProducto({ stockActual: 10, precioVenta: 4, precioCosto: 2, precioAprobado: false });
    const cajaId = randomUUID();
    await prisma.caja.create({ data: { id: cajaId, tenantId, codigo: `CAJA-${cajaId}`, usuarioId: adminId, montoApertura: 0 } as any });
    const detalles = [{ productoId, cantidad: 1 }];
    await expect(ventas.create(tenantId, adminId, { metodoPago: 'EFECTIVO', tipoPago: 'CONTADO', detalles } as any)).rejects.toBeInstanceOf(BadRequestException);
    const aprobado = await productos.cambiarPrecios(tenantId, productoId, { version: 1, precioCosto: 2, precioVenta: 4, aprobar: true, motivo: 'Lista del dueño' } as any, adminId);
    expect(aprobado).toMatchObject({ precioAprobado: true, pendienteConfiguracion: false });
    const venta = await ventas.create(tenantId, adminId, { metodoPago: 'EFECTIVO', tipoPago: 'CONTADO', detalles } as any);
    expect(venta.total).toBe(4.6);
    const audit = await prisma.auditoriaOperacion.findFirstOrThrow({ where: { tenantId, operacion: 'PRECIO_APROBAR', entidadId: productoId } });
    expect(audit.usuarioId).toBe(adminId);
  });

  it('cambiar el precio de venta de un producto aprobado lo revoca y bloquea la venta hasta nueva aprobación', async () => {
    const productoId = await crearProducto({ stockActual: 10, precioVenta: 4, precioCosto: 2, precioAprobado: true });
    const revocado = await productos.cambiarPrecios(tenantId, productoId, { version: 1, precioVenta: 5 } as any, adminId);
    expect(revocado.precioAprobado).toBe(false);
    const cajaId = randomUUID();
    await prisma.caja.create({ data: { id: cajaId, tenantId, codigo: `CAJA-${cajaId}`, usuarioId: adminId, montoApertura: 0 } as any });
    await expect(ventas.create(tenantId, adminId, { metodoPago: 'EFECTIVO', tipoPago: 'CONTADO', detalles: [{ productoId, cantidad: 1 }] } as any)).rejects.toBeInstanceOf(BadRequestException);
    const reaprobado = await productos.cambiarPrecios(tenantId, productoId, { version: revocado.version, aprobar: true } as any, adminId);
    expect([reaprobado.precioAprobado, Number(reaprobado.precioVenta)]).toEqual([true, 5]);
  });

  it('un cambio solo de costo conserva la aprobación y actualiza el costo vigente', async () => {
    const productoId = await crearProducto({ stockActual: 1, precioVenta: 4, precioCosto: 2, costoVigente: 2, precioAprobado: true });
    const cambiado = await productos.cambiarPrecios(tenantId, productoId, { version: 1, precioCosto: 3 } as any, adminId);
    expect(cambiado.precioAprobado).toBe(true);
    const fila = await prisma.producto.findUniqueOrThrow({ where: { id: productoId } });
    expect([Number(fila.precioCosto), Number(fila.costoVigente), Number(fila.precioVenta)]).toEqual([3, 3, 4]);
  });

  it('precio de venta cero no se aprueba ni se vende, aunque el producto esté activo', async () => {
    const productoId = await crearProducto({ stockActual: 1, precioVenta: 4, precioAprobado: false });
    await expect(productos.cambiarPrecios(tenantId, productoId, { version: 1, precioVenta: 0, aprobar: true } as any, adminId)).rejects.toBeInstanceOf(BadRequestException);
    expect((await prisma.producto.findUniqueOrThrow({ where: { id: productoId } })).precioAprobado).toBe(false);
  });

  it('el conteo modifica únicamente existencias; precio, costo, margen, marca y código de barras no cambian, y queda el responsable', async () => {
    const productoId = await crearProducto({ stockActual: 8, precioCosto: 2, precioVenta: 4, margen: 50, marca: 'Truper', codigoBarras: '001234', precioAprobado: true });
    const lev = await levantamientos.create(tenantId, adminId, { nombre: 'Conteo KARDEX' } as any);
    await levantamientos.createItem(tenantId, lev.id, { solicitudId: randomUUID(), descripcion: 'Cable metro', codigo: 'CABLE', unidad: 'METRO', cantidad: 9 } as any, adminId);
    await levantamientos.update(tenantId, lev.id, { estado: 'FINALIZADO' } as any, adminId);
    const { token, rows } = await levantamientos.previsualizar(tenantId, lev.id);
    expect(JSON.stringify(rows)).not.toMatch(/precioCosto|margen/);
    await levantamientos.aplicar(tenantId, adminId, lev.id, token);
    const producto = await prisma.producto.findUniqueOrThrow({ where: { id: productoId } });
    expect([Number(producto.stockActual), Number(producto.precioCosto), Number(producto.precioVenta), Number(producto.margen), producto.marca, producto.codigoBarras, producto.precioAprobado])
      .toEqual([9, 2, 4, 50, 'Truper', '001234', true]);
    const movimiento = await prisma.movimientoInventario.findFirstOrThrow({ where: { tenantId, productoId, tipo: 'LEVANTAMIENTO' } });
    expect([Number(movimiento.anterior), Number(movimiento.nuevo), movimiento.usuarioId]).toEqual([8, 9, adminId]);
  });

  it('el catálogo comercial (POS) solo incluye productos con precio aprobado y precio positivo', async () => {
    const aprobado = await crearProducto({ codigo: 'POS-OK', stockActual: 2, precioVenta: 4, precioCosto: 2, precioAprobado: true });
    const pendiente = await crearProducto({ codigo: 'POS-NO', stockActual: 2, precioVenta: 4, precioCosto: 2, precioAprobado: false });
    const catalogo = await productos.comercial(tenantId);
    const ids = catalogo.map((p: any) => p.id);
    expect(ids).toContain(aprobado);
    expect(ids).not.toContain(pendiente);
    expect(catalogo.find((p: any) => p.id === aprobado)).not.toHaveProperty('precioCosto');
  });

  // P1 (simulación sobre base temporal): la regla A de docs/CONCILIACION_COSTOS_PROPUESTA.md se ejecuta dentro de una
  // transacción que siempre se revierte. Cuenta los registros afectados; no escribe en ningún dato.
  it('simulacro de conciliación de costos: cuenta registros afectados por la regla de última compra y revierte sin escribir', async () => {
    const proveedorId = randomUUID();
    await prisma.$executeRawUnsafe('INSERT INTO proveedores (id,tenant_id,nombre,updated_at) VALUES ($1,$2,$3,NOW())', proveedorId, tenantId, 'Proveedor sintético');
    const conCompra = await crearProducto({ codigo: 'SIM-COMPRA', stockActual: 0, precioCosto: 5, costoVigente: 3, precioAprobado: true });
    const sinCompra = await crearProducto({ codigo: 'SIM-SIN', stockActual: 0, precioCosto: 4, costoVigente: 4, precioAprobado: true });
    const orden = await operaciones.compra(tenantId, adminId, { solicitudId: randomUUID(), proveedorId, numeroFactura: 'SIM-1', isv: 0,
      items: [{ productoId: conCompra, cantidad: 1, costo: 3 }] } as any);
    expect(orden.id).toBeDefined();
    // El historial de costos se escribe al recibir; luego se simula el desajuste heredado: costo comercial 5, última compra 3.
    const [detalle] = await prisma.$queryRawUnsafe<{ id: string }[]>('SELECT id FROM detalles_orden_compra WHERE orden_id=$1', orden.id);
    await operaciones.recibir(tenantId, bodegueroId, orden.id, { solicitudId: randomUUID(), items: [{ detalleId: detalle.id, cantidad: 1 }] } as any);
    await prisma.producto.update({ where: { id: conCompra }, data: { precioCosto: 5, costoVigente: 3 } });
    // Estado previo: el costo comercial 5 difiere de la última compra 3.
    const antes = await prisma.producto.findMany({ where: { tenantId }, orderBy: { codigo: 'asc' } });
    let afectados: { id: string }[] = [];
    await prisma.$transaction(async tx => {
      afectados = await tx.$queryRawUnsafe<{ id: string }[]>(`
        UPDATE productos p SET precio_costo = ult.costo, costo_vigente = ult.costo
        FROM (SELECT DISTINCT ON (c.producto_id) c.producto_id, c.costo FROM costos_compra c WHERE c.tenant_id = $1 ORDER BY c.producto_id, c.fecha DESC) ult
        WHERE p.id = ult.producto_id AND p.tenant_id = $1 AND p.precio_costo IS DISTINCT FROM ult.costo
        RETURNING p.id`, tenantId);
      throw new Error('SIMULACRO_REVERTIDO');
    }).catch(error => { if (error.message !== 'SIMULACRO_REVERTIDO') throw error; });
    // Registros afectados: solo el producto con compra cuyo costo comercial difiere de la última compra.
    expect(afectados.map(a => a.id)).toEqual([conCompra]);
    // Sin compra: no se toca (regla); la revisión queda fuera de la simulación.
    expect(afectados.map(a => a.id)).not.toContain(sinCompra);
    // La transacción revertida no deja escritura alguna.
    const despues = await prisma.producto.findMany({ where: { tenantId }, orderBy: { codigo: 'asc' } });
    expect(despues.map(p => [p.id, Number(p.precioCosto), Number(p.costoVigente)])).toEqual(antes.map(p => [p.id, Number(p.precioCosto), Number(p.costoVigente)]));
  });

  // ── Matriz de autorización y contratos para NEXUS y FORJA ──
  it('BODEGUERO no registra compras con costo en el servicio; ADMIN sí', async () => {
    const productoId = await crearProducto({ stockActual: 0, precioAprobado: true });
    const proveedor = randomUUID();
    await prisma.$executeRawUnsafe('INSERT INTO proveedores (id,tenant_id,nombre,updated_at) VALUES ($1,$2,$3,NOW())', proveedor, tenantId, 'Proveedor matriz');
    const solicitud = (usuario: string) => operaciones.compra(tenantId, usuario, {
      solicitudId: randomUUID(), proveedorId: proveedor, numeroFactura: `M-${randomUUID().slice(0, 6)}`, isv: 0,
      items: [{ productoId, cantidad: 1, costo: 3 }],
    } as any);
    await expect(solicitud(bodegueroId)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(solicitud(adminId)).resolves.toBeDefined();
  });

  it('una venta registrada se entrega aunque después se revoque la aprobación; el importe no cambia', async () => {
    const productoId = await crearProducto({ stockActual: 5, precioVenta: 4, precioCosto: 2, precioAprobado: true });
    const cajaId = randomUUID();
    await prisma.caja.create({ data: { id: cajaId, tenantId, codigo: `CAJA-${cajaId}`, usuarioId: adminId, montoApertura: 0 } as any });
    const venta = await ventas.create(tenantId, adminId, { metodoPago: 'EFECTIVO', tipoPago: 'CONTADO', detalles: [{ productoId, cantidad: 2 }] } as any);
    await productos.cambiarPrecios(tenantId, productoId, { version: 1, precioVenta: 6 } as any, adminId);
    expect((await prisma.producto.findUniqueOrThrow({ where: { id: productoId } })).precioAprobado).toBe(false);
    await operaciones.entregar(tenantId, adminId, venta.id);
    const fila = await prisma.venta.findUniqueOrThrow({ where: { id: venta.id }, include: { detalles: true } });
    expect(fila.entregadoAt).not.toBeNull();
    expect([Number(fila.total), Number(fila.detalles[0].precioUnitario)]).toEqual([venta.total, 4]);
  });

  it('recibir una compra más barata actualiza costo comercial y vigente; no toca precio de venta ni aprobación', async () => {
    const productoId = await crearProducto({ stockActual: 0, precioVenta: 4, precioCosto: 2, costoVigente: 2, precioAprobado: true });
    const proveedor = randomUUID();
    await prisma.$executeRawUnsafe('INSERT INTO proveedores (id,tenant_id,nombre,updated_at) VALUES ($1,$2,$3,NOW())', proveedor, tenantId, 'Proveedor FORJA');
    const orden = await operaciones.compra(tenantId, adminId, { solicitudId: randomUUID(), proveedorId: proveedor, numeroFactura: `R-${randomUUID().slice(0, 6)}`, isv: 0,
      items: [{ productoId, cantidad: 3, costo: 2.5 }] } as any);
    const [detalle] = await prisma.$queryRawUnsafe<{ id: string }[]>('SELECT id FROM detalles_orden_compra WHERE orden_id=$1', orden.id);
    await operaciones.recibir(tenantId, bodegueroId, orden.id, { solicitudId: randomUUID(), items: [{ detalleId: detalle.id, cantidad: 3 }] } as any);
    const fila = await prisma.producto.findUniqueOrThrow({ where: { id: productoId } });
    expect([Number(fila.precioCosto), Number(fila.costoVigente), Number(fila.precioVenta), fila.precioAprobado, Number(fila.stockActual)]).toEqual([2.5, 2.5, 4, true, 3]);
    const historial = await prisma.$queryRawUnsafe<any[]>('SELECT costo, proveedor_id FROM costos_compra WHERE producto_id=$1', productoId);
    expect(historial).toHaveLength(1);
    expect(historial[0].proveedor_id).toBe(proveedor);
  });
});
