import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { expect, test, type APIRequestContext } from '@playwright/test';

// E2E REAL de tres módulos del negocio: backend NestJS + PostgreSQL temporal (run.sh). Sin page.route ni backend simulado.
// Cada prueba crea sus propios datos con códigos únicos y verifica la persistencia leyendo PostgreSQL directamente.
// Alcance: capa API (HTTP real) + base de datos real. No cubre la pantalla; eso queda como prueba de navegador aparte.

const API = process.env.E2E_API_URL!;
const PASSWORD = process.env.E2E_PASSWORD!;
const PSQL = `${process.env.PG_BIN ?? '/usr/lib/postgresql/16/bin'}/psql`;
const DB = `postgresql://postgres@127.0.0.1:${process.env.E2E_PG_PORT ?? '55433'}/postgres`;
const sql = (consulta: string) => execFileSync(PSQL, ['-X', '-At', '-F', '|', DB, '-c', consulta], { encoding: 'utf8' }).trim();

const ADMIN = 'admin.a@e2e.invalid';
const CAJERO = 'cajero.a@e2e.invalid';
const TENANT = 'e2e-empresa-a';
const tenantId = () => sql(`SELECT id FROM tenants WHERE id='${TENANT}' OR nombre_comercial='Ferretería Central E2E' LIMIT 1`);

async function login(request: APIRequestContext, email: string) {
  const res = await request.post(`${API}/auth/login`, { data: { email, password: PASSWORD } });
  expect(res.status(), `login ${email}`).toBe(200);
  const body = await res.json();
  return { token: body.accessToken as string, id: body.user.id as string };
}

async function call(request: APIRequestContext, token: string, metodo: 'get' | 'post', ruta: string, data?: unknown) {
  const res = await request[metodo](`${API}${ruta}`, { headers: { Authorization: `Bearer ${token}` }, ...(data ? { data } : {}) });
  const texto = await res.text();
  return { status: res.status(), body: texto ? JSON.parse(texto) : null };
}

const codigoUnico = (prefijo: string) => `${prefijo}-${randomUUID().slice(0, 8).toUpperCase()}`;

test.describe('Negocio — módulos esenciales con PostgreSQL real', () => {
  test('1. Inventario: crear producto, registrar existencias, ajustar, consultar stock y verificar persistencia', async ({ request }) => {
    const admin = await login(request, ADMIN);
    const codigo = codigoUnico('INV');
    const alta = await call(request, admin.token, 'post', '/productos', { solicitudId: randomUUID(), codigo, nombre: `Inventario ${codigo}`, precioVenta: 15, precioCosto: 6, stockActual: 5, stockMinimo: 1 });
    expect(alta.status, JSON.stringify(alta.body)).toBeLessThan(300);
    const id = alta.body.id as string;

    // Consulta por API: existencias iniciales.
    const consulta1 = await call(request, admin.token, 'get', `/productos/${id}`);
    expect(Number(consulta1.body.stockActual)).toBe(5);

    // Ajuste con existencias observadas (stockAnterior) y segundo intento obsoleto.
    const ajuste = await call(request, admin.token, 'post', `/operaciones/productos/${id}/ajuste`, { solicitudId: randomUUID(), stock: 8, stockAnterior: 5, motivo: 'Conteo físico E2E' });
    expect(ajuste.status, JSON.stringify(ajuste.body)).toBeLessThan(300);
    const obsoleto = await call(request, admin.token, 'post', `/operaciones/productos/${id}/ajuste`, { solicitudId: randomUUID(), stock: 9, stockAnterior: 5, motivo: 'Ajuste con datos viejos' });
    expect(obsoleto.status).toBe(409);

    const consulta2 = await call(request, admin.token, 'get', `/productos/${id}`);
    expect(Number(consulta2.body.stockActual)).toBe(8);

    // Persistencia en PostgreSQL: stock y trazabilidad de movimientos.
    expect(Number(sql(`SELECT stock_actual FROM productos WHERE id='${id}'`))).toBe(8);
    expect(sql(`SELECT tipo||'|'||anterior||'|'||nuevo FROM movimientos_inventario WHERE producto_id='${id}' AND tipo='AJUSTE'`)).toMatch(/AJUSTE\|5(\.00)?\|8(\.00)?/);
    expect(Number(sql(`SELECT COUNT(*) FROM movimientos_inventario WHERE producto_id='${id}'`))).toBeGreaterThanOrEqual(2);
    // El ajuste obsoleto no dejó movimiento ni cambió existencias.
    expect(Number(sql(`SELECT COUNT(*) FROM movimientos_inventario WHERE producto_id='${id}' AND nuevo=9`))).toBe(0);
  });

  test('2. Compras: proveedor, compra, recepción que aumenta inventario, costo actualizado y trazabilidad', async ({ request }) => {
    const admin = await login(request, ADMIN);
    const codigo = codigoUnico('CMP');
    const alta = await call(request, admin.token, 'post', '/productos', { solicitudId: randomUUID(), codigo, nombre: `Compra ${codigo}`, precioVenta: 20, precioCosto: 6, stockActual: 0, stockMinimo: 1 });
    expect(alta.status).toBeLessThan(300);
    const productoId = alta.body.id as string;

    const prov = await call(request, admin.token, 'post', '/operaciones/proveedores', { solicitudId: randomUUID(), nombre: `Proveedor ${codigo}`, telefono: '2200-0000', rtn: '08019900000001' });
    expect(prov.status, JSON.stringify(prov.body)).toBeLessThan(300);
    const proveedorId = prov.body.id as string;
    expect(sql(`SELECT nombre FROM proveedores WHERE id='${proveedorId}' AND tenant_id='${tenantId()}'`)).toBe(`Proveedor ${codigo}`);

    const factura = `FAC-${codigo}`;
    const compra = await call(request, admin.token, 'post', '/operaciones/compras', {
      solicitudId: randomUUID(), proveedorId, numeroFactura: factura, isv: 0,
      items: [{ productoId, cantidad: 4, costo: 7 }],
    });
    expect(compra.status, JSON.stringify(compra.body)).toBeLessThan(300);
    const ordenId = compra.body.id as string;

    // La compra por sí sola no mueve inventario: la entrada ocurre en la recepción.
    expect(Number(sql(`SELECT stock_actual FROM productos WHERE id='${productoId}'`))).toBe(0);
    const detalleId = sql(`SELECT id FROM detalles_orden_compra WHERE orden_id='${ordenId}' AND producto_id='${productoId}'`);
    expect(detalleId).not.toBe('');

    const recepcion = await call(request, admin.token, 'post', `/operaciones/compras/${ordenId}/recepciones`, {
      solicitudId: randomUUID(), items: [{ detalleId, cantidad: 4 }],
    });
    expect(recepcion.status, JSON.stringify(recepcion.body)).toBeLessThan(300);

    // Entrada de inventario y costo vigente en PostgreSQL.
    expect(Number(sql(`SELECT stock_actual FROM productos WHERE id='${productoId}'`))).toBe(4);
    expect(Number(sql(`SELECT precio_costo FROM productos WHERE id='${productoId}'`))).toBe(7);
    // Trazabilidad: la orden y su proveedor, y el movimiento de entrada apunta al documento de compra.
    expect(sql(`SELECT proveedor_id||'|'||numero_factura FROM ordenes_compra WHERE id='${ordenId}'`)).toBe(`${proveedorId}|${factura}`);
    // El movimiento de entrada se identifica por su motivo (factura) y su tipo COMPRA; el documento es el id de la recepción.
    expect(Number(sql(`SELECT COUNT(*) FROM movimientos_inventario WHERE producto_id='${productoId}' AND tipo='COMPRA' AND cantidad=4 AND motivo='Factura ${factura}'`))).toBe(1);

    // Factura duplicada del mismo proveedor se rechaza y no duplica existencias.
    const dup = await call(request, admin.token, 'post', '/operaciones/compras', {
      solicitudId: randomUUID(), proveedorId, numeroFactura: factura, isv: 0, items: [{ productoId, cantidad: 1, costo: 7 }],
    });
    expect(dup.status).toBe(409);
    expect(Number(sql(`SELECT stock_actual FROM productos WHERE id='${productoId}'`))).toBe(4);
  });

  test('3. Caja: abrir, registrar venta en efectivo, cerrar y verificar conciliación', async ({ request }) => {
    const admin = await login(request, ADMIN);
    const cajero = await login(request, CAJERO);
    const codigo = codigoUnico('CAJ');
    const alta = await call(request, admin.token, 'post', '/productos', { solicitudId: randomUUID(), codigo, nombre: `Caja ${codigo}`, precioVenta: 100, precioCosto: 40, stockActual: 10, stockMinimo: 1 });
    expect(alta.status).toBeLessThan(300);
    const productoId = alta.body.id as string;

    // Otras pruebas de la misma suite pueden dejar cajas abiertas de este cajero: se cierran por API con el efectivo esperado.
    const abiertas = await call(request, cajero.token, 'get', '/operaciones/caja');
    for (const c of (abiertas.body as any[]).filter((x) => x.estado === 'ABIERTA')) {
      const cierrePrevio = await call(request, cajero.token, 'post', `/operaciones/caja/${c.id}/cerrar`, { monto: Number(c.efectivoEsperado) });
      expect(cierrePrevio.status, JSON.stringify(cierrePrevio.body)).toBeLessThan(300);
    }
    const abrir = await call(request, cajero.token, 'post', '/operaciones/caja/abrir', { solicitudId: randomUUID(), monto: 500 });
    expect(abrir.status, JSON.stringify(abrir.body)).toBeLessThan(300);
    const cajaId = abrir.body.id as string;

    const venta = await call(request, cajero.token, 'post', '/ventas', {
      solicitudId: randomUUID(), detalles: [{ productoId, cantidad: 2 }], metodoPago: 'EFECTIVO', tipoPago: 'CONTADO',
    });
    expect(venta.status, JSON.stringify(venta.body)).toBeLessThan(300);
    const ventaId = venta.body.id as string;
    const total = Number(venta.body.total);
    expect(total).toBeGreaterThan(0);

    // Cobro registrado en la caja: efectivo esperado = fondo + cobro en efectivo.
    const estado = await call(request, cajero.token, 'get', '/operaciones/caja');
    const cajaAbierta = estado.body.find((c: any) => c.id === cajaId);
    const esperado = Number(cajaAbierta.efectivoEsperado);
    expect(esperado).toBeCloseTo(500 + total, 2);
    expect(Number(sql(`SELECT COUNT(*) FROM movimientos_caja WHERE caja_id='${cajaId}' AND referencia='${ventaId}'`))).toBeGreaterThanOrEqual(1);

    // Cierre con el efectivo contado igual al esperado: sin diferencia.
    const cierre = await call(request, cajero.token, 'post', `/operaciones/caja/${cajaId}/cerrar`, { monto: esperado });
    expect(cierre.status, JSON.stringify(cierre.body)).toBeLessThan(300);

    // Conciliación en PostgreSQL: caja cerrada, monto de cierre igual al esperado, venta vinculada.
    expect(sql(`SELECT estado FROM cajas WHERE id='${cajaId}'`)).toBe('CERRADA');
    expect(Number(sql(`SELECT monto_cierre_fisico FROM cajas WHERE id='${cajaId}'`))).toBeCloseTo(esperado, 2);
    expect(Number(sql(`SELECT diferencia FROM cajas WHERE id='${cajaId}'`))).toBeCloseTo(0, 2);
    expect(sql(`SELECT caja_id FROM ventas WHERE id='${ventaId}'`)).toBe(cajaId);

    // Una segunda caja no puede cerrarse de nuevo con otro monto.
    const reintento = await call(request, cajero.token, 'post', `/operaciones/caja/${cajaId}/cerrar`, { monto: esperado + 1 });
    expect(reintento.status).toBeGreaterThanOrEqual(400);
    expect(Number(sql(`SELECT monto_cierre_fisico FROM cajas WHERE id='${cajaId}'`))).toBeCloseTo(esperado, 2);
  });
});
