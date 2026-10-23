import { fillPlatformMfa, syntheticMfaFor } from './mfa.fixture';
import { expect, test, request, type Page, type APIRequestContext } from '@playwright/test';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';

// E2E REAL (backend NestJS + PostgreSQL temporal + almacenamiento PostgreSQL persistente; sin mocks).
// Flujo de logotipo por negocio: carga, persistencia, visualización en ambos modos de navegación,
// reemplazo, eliminación y autorización directa por API. Supabase Storage no forma parte de esta prueba
// (no hay proyecto real autorizado en el entorno); ver docs/CONTEXTO_MAESTRO.md.

const PASSWORD = process.env.E2E_PASSWORD!;
const API = process.env.E2E_API_URL!;
// Con baseURL, Playwright descarta el segmento /api si la ruta empieza por «/»: las rutas van relativas.
const BASE = API.endsWith('/') ? API : `${API}/`;
const { PrismaClient } = createRequire(resolve('../backend/package.json'))('@prisma/client');
const prisma = new PrismaClient();
test.afterAll(async () => { await prisma.$disconnect(); });
async function objetoActual() {
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: NEGOCIO_A } });
  return tenant.logoStorageKey ? await prisma.logotipoObjeto.findUniqueOrThrow({ where: { clave: tenant.logoStorageKey } }) : null;
}
const NEGOCIO_A = 'e2e-empresa-a';
const NOMBRE_A = 'Ferretería Central E2E';

// Imágenes reales decodificables (1x1), una por formato.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
const WEBP = Buffer.from('UklGRiQAAABXRUJQVlA4IBgAAAAwAQCdASoBAAEAAwA0JaQAA3AA/vuUAAA=', 'base64');

async function ingresar(page: Page, email: string) {
  await page.goto('/login');
  await page.locator('#login-correo').fill(email); await fillPlatformMfa(page, email);
  await page.locator('#login-clave').fill(PASSWORD);
  await page.getByRole('button', { name: 'INGRESAR AL SISTEMA' }).click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'));
}

async function tokenDe(api: APIRequestContext, email: string) {
  const r = await api.post('auth/login', { data: { email, password: PASSWORD, mfaCode: await syntheticMfaFor(email) } });
  expect(r.status()).toBe(200);
  return (await r.json()).accessToken as string;
}

const logoVisible = (page: Page, alt: string) => page.locator(`img[alt="${alt}"]`);

test.describe.serial('Logotipo por negocio (backend real)', () => {
  test('SUPERADMIN carga, ve persistencia tras recargar y el archivo queda en almacenamiento privado', async ({ page }) => {
    await ingresar(page, 'superadmin.e2e@e2e.invalid');
    const fila = page.getByRole('row').filter({ hasText: NOMBRE_A });
    await fila.locator('summary').click();
    await fila.getByRole('button', { name: 'Configurar negocio' }).click();
    await expect(page).toHaveURL(new RegExp(`/admin/negocios/${NEGOCIO_A}/configuracion$`));
    await expect(page.getByRole('heading', { name: 'Logotipo del negocio' })).toBeVisible();
    await expect(page.getByText('Sin logotipo: se muestra el ícono predeterminado')).toBeVisible();

    await page.locator('input[type="file"][aria-label="Elegir archivo de logotipo"]').setInputFiles({ name: 'logo.png', mimeType: 'image/png', buffer: PNG });
    await expect(page.getByText('Vista previa (sin guardar)')).toBeVisible();
    await page.getByRole('button', { name: 'Guardar logotipo' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Logotipo guardado' })).toBeVisible();
    const objeto = await objetoActual();
    expect(objeto.tenantId).toBe(NEGOCIO_A);
    expect(Buffer.from(objeto.datos).equals(PNG)).toBe(true);

    await page.reload();
    await expect(logoVisible(page, `Logotipo de ${NOMBRE_A}`)).toBeVisible();
    const cargada = await logoVisible(page, `Logotipo de ${NOMBRE_A}`).evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0);
    expect(cargada).toBe(true);
  });

  test('ADMIN del negocio ve el logotipo en SIDEBAR y en TOPNAV; el cambio de modo se guarda por API del SUPERADMIN', async ({ page }) => {
    const api = await request.newContext({ baseURL: BASE });
    const sa = await tokenDe(api, 'superadmin.e2e@e2e.invalid');
    const modo = await api.put(`admin/tenants/${NEGOCIO_A}/settings`, { headers: { Authorization: `Bearer ${sa}` }, data: { modoNavegacion: 'SIDEBAR' } });
    expect(modo.status()).toBe(200);

    await ingresar(page, 'admin.a@e2e.invalid');
    const mobile = (page.viewportSize()?.width || 1280) <= 768;
    await expect(page.locator(mobile ? '.app-tenant-brand' : 'aside.desktop-sidebar-nav').locator(`img[alt="${NOMBRE_A}"]`)).toBeVisible();

    const topo = await api.put(`admin/tenants/${NEGOCIO_A}/settings`, { headers: { Authorization: `Bearer ${sa}` }, data: { modoNavegacion: 'TOPNAV' } });
    expect(topo.status()).toBe(200);
    await page.reload();
    await expect(page.locator(mobile ? '.app-tenant-brand' : 'header.desktop-sidebar-nav').locator(`img[alt="${NOMBRE_A}"]`)).toBeVisible();
    await expect(page.locator('aside.desktop-sidebar-nav')).toHaveCount(0);

    // La marca del negocio enlaza a Inicio; Jowa System es el proveedor y también enlaza a Inicio.
    await expect(page.getByRole('link', { name: mobile ? 'Ir a Inicio del negocio' : 'Jowa System: ir a Inicio' }).first()).toBeVisible();
    await api.put(`admin/tenants/${NEGOCIO_A}/settings`, { headers: { Authorization: `Bearer ${sa}` }, data: { modoNavegacion: 'SIDEBAR' } });
    await api.dispose();
  });

  test('SUPERADMIN reemplaza por WEBP y luego elimina: vuelve el ícono predeterminado', async ({ page }) => {
    await ingresar(page, 'superadmin.e2e@e2e.invalid');
    await page.goto(`/admin/negocios/${NEGOCIO_A}/configuracion`);
    await page.locator('input[type="file"][aria-label="Elegir archivo de logotipo"]').setInputFiles({ name: 'logo.webp', mimeType: 'image/webp', buffer: WEBP });
    await page.getByRole('button', { name: 'Guardar logotipo' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Logotipo guardado' })).toBeVisible();
    expect(Buffer.from((await objetoActual()).datos).equals(WEBP)).toBe(true);

    page.once('dialog', (d) => d.accept());
    await page.getByRole('button', { name: 'Quitar logotipo' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Logotipo eliminado' })).toBeVisible();
    await expect(page.getByText('Sin logotipo: se muestra el ícono predeterminado')).toBeVisible();
    expect(await objetoActual()).toBeNull();
    expect(await prisma.logotipoObjeto.count({ where: { tenantId: NEGOCIO_A } })).toBe(0);

    await page.reload();
    await expect(page.getByText('Sin logotipo: se muestra el ícono predeterminado')).toBeVisible();
  });

  test('autorización directa por API: ADMIN, CAJERO y otro negocio no modifican ni leen logotipos ajenos', async () => {
    const api = await request.newContext({ baseURL: BASE });
    const sa = await tokenDe(api, 'superadmin.e2e@e2e.invalid');
    const admin = await tokenDe(api, 'admin.a@e2e.invalid');
    const cajero = await tokenDe(api, 'cajero.a@e2e.invalid');
    const adminB = await tokenDe(api, 'admin.b@e2e.invalid');
    const png = { name: 'logo.png', mimeType: 'image/png', buffer: PNG };

    // Un logotipo cargado para verificar aislamiento entre negocios.
    const cargar = await api.post(`admin/tenants/${NEGOCIO_A}/logo`, { headers: { Authorization: `Bearer ${sa}` }, multipart: { archivo: png } });
    expect(cargar.status()).toBe(201);

    expect((await api.post(`admin/tenants/${NEGOCIO_A}/logo`, { headers: { Authorization: `Bearer ${admin}` }, multipart: { archivo: png } })).status()).toBe(403);
    expect((await api.delete(`admin/tenants/${NEGOCIO_A}/logo`, { headers: { Authorization: `Bearer ${admin}` } })).status()).toBe(403);
    expect((await api.post(`admin/tenants/${NEGOCIO_A}/logo`, { headers: { Authorization: `Bearer ${cajero}` }, multipart: { archivo: png } })).status()).toBe(403);
    expect((await api.put('tenant/settings', { headers: { Authorization: `Bearer ${admin}` }, data: { colorPrimario: '#000000' } })).status()).toBe(403);
    expect((await api.get(`admin/tenants/${NEGOCIO_A}/logo`, { headers: { Authorization: `Bearer ${admin}` } })).status()).toBe(403);

    // El negocio A lee su logotipo; el negocio B no lo ve ni lo puede cargar con su propio token.
    expect((await api.get('tenant/logo', { headers: { Authorization: `Bearer ${admin}` } })).status()).toBe(200);
    expect((await api.get('tenant/logo', { headers: { Authorization: `Bearer ${adminB}` } })).status()).toBe(404);
    expect((await api.post(`admin/tenants/${NEGOCIO_A}/logo`, { headers: { Authorization: `Bearer ${adminB}` }, multipart: { archivo: png } })).status()).toBe(403);

    // Archivos inválidos y excesivos: rechazo sin cambiar el logotipo actual.
    const html = await api.post(`admin/tenants/${NEGOCIO_A}/logo`, { headers: { Authorization: `Bearer ${sa}` }, multipart: { archivo: { name: 'x.png', mimeType: 'image/png', buffer: Buffer.from('<!doctype html><script>alert(1)</script>') } } });
    expect(html.status()).toBe(415);
    const grande = await api.post(`admin/tenants/${NEGOCIO_A}/logo`, { headers: { Authorization: `Bearer ${sa}` }, multipart: { archivo: { name: 'g.png', mimeType: 'image/png', buffer: Buffer.concat([PNG, Buffer.alloc(2 * 1024 * 1024)]) } } });
    expect(grande.status()).toBe(413);
    expect(Buffer.from((await objetoActual()).datos).equals(PNG)).toBe(true);

    // Limpieza: deja el negocio sin logotipo para las ejecuciones siguientes.
    expect((await api.delete(`admin/tenants/${NEGOCIO_A}/logo`, { headers: { Authorization: `Bearer ${sa}` } })).status()).toBe(200);
    await api.dispose();
  });
});
