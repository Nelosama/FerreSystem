import { test, expect, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';

// API NestJS, JWT, navegador y PostgreSQL efímeros reales; sin rutas ni respuestas simuladas.
const API = process.env.E2E_API_URL!;

test('PR202: dos cajas sincronizan el precio aprobado sin refrescar y concilian importes, reservas y reintentos', async ({ page, browser, request, baseURL }) => {
  const iniciar = async (email: string) => {
    const r = await request.post(`${API}/auth/login`, { data: { email, password: process.env.E2E_PASSWORD } });
    expect(r.status()).toBe(200);
    const { accessToken } = await r.json();
    const headers = { Authorization: `Bearer ${accessToken}` };
    const caja = await request.post(`${API}/operaciones/caja/abrir`, { headers, data: { solicitudId: randomUUID(), monto: 0 } });
    expect([201, 409]).toContain(caja.status());
    return headers;
  };
  const admin = await iniciar('admin.a@e2e.invalid');
  const cajero = await iniciar('cajero.a@e2e.invalid');
  const nombre = `Precio-${randomUUID().slice(0, 8)}`;
  const alta = await request.post(`${API}/productos`, { headers: admin, data: {
    solicitudId: randomUUID(), codigo: nombre, nombre, precioVenta: 10.30, precioCosto: 5, stockActual: 20, stockMinimo: 0,
  } });
  expect(alta.status(), await alta.text()).toBe(201);
  const producto = await alta.json();
  const preparar = async (p: Page, email: string, cantidad: string) => {
    await p.goto('/login');
    await p.locator('#login-correo').fill(email);
    await p.locator('#login-clave').fill(process.env.E2E_PASSWORD!);
    await p.getByRole('button', { name: 'INGRESAR AL SISTEMA' }).click();
    await p.waitForURL(url => !url.pathname.startsWith('/login'));
    const catalogo = p.waitForResponse(r => r.url().endsWith('/productos/comercial') && r.ok());
    await p.goto('/pos'); await catalogo;
    const buscar = p.getByPlaceholder('Buscar por código o nombre de producto...');
    await buscar.fill(nombre);
    await expect(p.locator('.pos-producto').filter({ hasText: nombre })).toBeVisible();
    await buscar.press('Enter');
    await p.getByLabel(`Cantidad ${nombre}`, { exact: true }).fill(cantidad);
  };
  const otroContexto = await browser.newContext({ baseURL });
  try {
    const otraCaja = await otroContexto.newPage();
    await preparar(page, 'cajero.a@e2e.invalid', '2.75');
    await preparar(otraCaja, 'admin.a@e2e.invalid', '1.25');
    const cambio = await request.patch(`${API}/productos/${producto.id}/precios`, { headers: admin, data: { version: producto.version, precioVenta: 12.55, aprobar: true } });
    expect(cambio.status(), await cambio.text()).toBe(200);
    for (const [p, cantidad] of [[page, '2.75'], [otraCaja, '1.25']] as const) {
      // La siguiente interacción/foco sincroniza en cuanto vence el mínimo de 3 s, sin recargar la página.
      await expect(async () => {
        await p.evaluate(() => window.dispatchEvent(new Event('focus')));
        await expect(p.getByText(`${cantidad} x L. 12.55`)).toBeVisible({ timeout: 500 });
      }).toPass({ timeout: 10000 });
      await expect(p.getByLabel(`Cantidad ${nombre}`, { exact: true })).toHaveValue(cantidad);
      await expect(p.getByTestId('pos-aviso-cobro')).toHaveCount(0);
      await expect(p.getByRole('button', { name: /Actualizar catálogo/ })).toHaveCount(0);
    }
    const registrar = async (p: Page) => {
      const evento = p.waitForResponse(r => r.url().endsWith('/ventas') && r.request().method() === 'POST');
      await p.getByRole('button', { name: /Procesar Venta/ }).last().click();
      const r = await evento;
      expect(r.status(), await r.text()).toBe(201);
      return { venta: await r.json(), dto: r.request().postDataJSON() };
    };
    const [a, b] = await Promise.all([registrar(page), registrar(otraCaja)]);
    expect([a.venta.subtotal, a.venta.isv, a.venta.total]).toEqual([34.51, 5.18, 39.69]);
    expect([b.venta.subtotal, b.venta.isv, b.venta.total]).toEqual([15.69, 2.35, 18.04]);
    const replay = await request.post(`${API}/ventas`, { headers: cajero, data: a.dto });
    expect(replay.status()).toBe(201); expect((await replay.json()).id).toBe(a.venta.id);
    const vigente = await request.get(`${API}/productos/${producto.id}`, { headers: admin });
    const p = await vigente.json();
    expect([p.stockActual, p.stockReservado]).toEqual([18.75, 2.75]);
    // Un precio anterior se rechaza aunque lo envíe ADMIN por HTTP.
    const viejo = await request.post(`${API}/ventas`, { headers: admin, data: { ...b.dto, solicitudId: randomUUID(), detalles: b.dto.detalles.map((d: any) => ({ ...d, precioUnitario: 10.30 })) } });
    expect(viejo.status()).toBe(409);
  } finally { await otroContexto.close(); }
});
