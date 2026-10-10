import { expect, test, type Page } from '@playwright/test';

// E2E REAL (backend NestJS + PostgreSQL temporal + frontend construido, sin mocks):
// venta → cobro → dejar en bodega → consultar pendiente → entregar → comprobar existencias.

const PASSWORD = process.env.E2E_PASSWORD!;
const API = process.env.E2E_API_URL!;
const TENANT = 'e2e-empresa-a';
const CAJERO = 'cajero.a@e2e.invalid';
const BODEGUERO = 'bodeguero.a@e2e.invalid';
const ADMIN = 'admin.a@e2e.invalid';
const PRODUCTO = 'Cemento gris bodega E2E';

async function token(email: string) {
  const r = await fetch(`${API}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password: PASSWORD, tenantId: TENANT }) });
  expect(r.status).toBe(200);
  return (await r.json()).accessToken as string;
}
async function api(path: string, t: string, init: RequestInit = {}) {
  const r = await fetch(`${API}${path}`, { ...init, headers: { 'content-type': 'application/json', authorization: `Bearer ${t}`, ...(init.headers ?? {}) } });
  return { status: r.status, body: await r.json().catch(() => null) };
}
async function existencias() {
  const t = await token(ADMIN);
  const lista = (await api('/productos', t)).body as any[];
  const p = lista.find((x) => x.nombre === PRODUCTO);
  return { actual: Number(p.stockActual), reservado: Number(p.stockReservado) };
}
async function entrar(page: Page, email: string, ruta: string) {
  await page.goto('/login');
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(PASSWORD);
  await page.getByRole('button', { name: 'INGRESAR AL SISTEMA' }).click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'));
  await page.goto(ruta);
}

test.describe.serial('Cobro y entrega con backend real', () => {
  test('cobrar y dejar en bodega → pendiente visible → entrega parcial y final → existencias correctas', async ({ page, browser }) => {
    const antes = await existencias();
    const tc = await token(CAJERO);
    const caja = await api('/operaciones/caja/abrir', tc, { method: 'POST', body: JSON.stringify({ solicitudId: crypto.randomUUID(), monto: 100 }) });
    expect([201, 409]).toContain(caja.status);

    // Cajero: vende el producto y lo deja en bodega.
    await entrar(page, CAJERO, '/pos');
    await page.getByText(PRODUCTO, { exact: true }).first().click();
    await page.getByLabel(`Cantidad ${PRODUCTO}`).fill('3');
    const venta = page.waitForResponse((r) => r.url().endsWith('/ventas') && r.request().method() === 'POST');
    await page.getByRole('button', { name: /Cobrar y dejar en bodega/ }).click();
    const respuesta = await venta;
    expect(respuesta.status()).toBe(201);
    const creada = await respuesta.json();
    expect(creada.reservaPendiente).toBe(true);
    await expect(page.getByRole('status').filter({ hasText: 'Venta registrada' })).toBeVisible();

    const cantidad = Number(creada.detalles[0].cantidad);
    expect(cantidad).toBe(3);
    expect(await existencias()).toEqual({ actual: antes.actual, reservado: antes.reservado + cantidad });

    // Cajero: consulta el pendiente pero no puede entregar.
    await page.goto('/entregas');
    const tarjetaCajero = page.getByRole('region', { name: `Venta ${creada.numeroVenta}` });
    await expect(tarjetaCajero).toContainText(`Pendiente ${cantidad}`);
    await expect(tarjetaCajero.getByRole('button', { name: 'Entregar' })).toHaveCount(0);
    const denegado = await api(`/entregas/ventas/${creada.id}/entregas`, tc, { method: 'POST', body: JSON.stringify({ solicitudId: crypto.randomUUID(), receptorNombre: 'X', lineas: [{ detalleId: creada.detalles[0].id, cantidad: 1 }] }) });
    expect(denegado.status).toBe(403);

    // Bodeguero: entrega una unidad (parcial) y luego el resto.
    const ctx = await browser.newContext();
    const bodega = await ctx.newPage();
    await entrar(bodega, BODEGUERO, '/entregas');
    const tarjeta = bodega.getByRole('region', { name: `Venta ${creada.numeroVenta}` });
    await expect(tarjeta).toContainText(`Pendiente ${cantidad}`);
    await tarjeta.getByRole('button', { name: 'Entregar' }).click();
    await tarjeta.getByPlaceholder('Nombre de quien recibe').fill('Pedro Albañil');
    await tarjeta.getByLabel('Entregar ahora').fill('1');
    await tarjeta.getByRole('button', { name: 'Confirmar entrega' }).click();
    await expect(bodega.getByRole('status')).toContainText(`Entrega registrada de la venta ${creada.numeroVenta}`);
    expect(await existencias()).toEqual({ actual: antes.actual - 1, reservado: antes.reservado + cantidad - 1 });

    if (cantidad > 1) {
      await expect(tarjeta).toContainText(`Pendiente ${cantidad - 1}`);
      await tarjeta.getByRole('button', { name: 'Entregar' }).click();
      await tarjeta.getByPlaceholder('Nombre de quien recibe').fill('Pedro Albañil');
      await tarjeta.getByRole('button', { name: 'Confirmar entrega' }).click();
      await expect(bodega.getByRole('status')).toContainText('Entrega registrada');
    }
    await expect(bodega.getByRole('region', { name: `Venta ${creada.numeroVenta}` })).toHaveCount(0);
    expect(await existencias()).toEqual({ actual: antes.actual - cantidad, reservado: antes.reservado });

    // Reintento de la misma entrega (misma solicitud) no descuenta de nuevo.
    const tb = await token(BODEGUERO);
    const detalle = (await api(`/entregas/ventas/${creada.id}`, tb)).body;
    expect(detalle.eventos.filter((e: any) => e.tipo === 'ENTREGA' && e.receptor_nombre === 'Pedro Albañil').length).toBeGreaterThanOrEqual(1);
    const sobrante = await api(`/entregas/ventas/${creada.id}/entregas`, tb, { method: 'POST', body: JSON.stringify({ solicitudId: crypto.randomUUID(), receptorNombre: 'Otro', lineas: [{ detalleId: creada.detalles[0].id, cantidad: 1 }] }) });
    expect(sobrante.status).toBe(409);
    expect(await existencias()).toEqual({ actual: antes.actual - cantidad, reservado: antes.reservado });
    await ctx.close();
  });
});
