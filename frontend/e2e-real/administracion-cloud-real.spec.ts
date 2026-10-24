import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { confirmarAlerta } from '../e2e/helpers/alertas';
const { PrismaClient } = createRequire(resolve('../backend/package.json'))('@prisma/client');
const prisma = new PrismaClient();
const A = 'e2e-empresa-a';
const API = process.env.E2E_API_URL!;
const PASSWORD = process.env.E2E_PASSWORD!;
const run = Date.now().toString();
test.afterAll(async () => { await prisma.$disconnect(); });
async function restablecerPreferencias() {
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: A } });
  await prisma.tenant.update({ where: { id: A }, data: { modoNavegacion: 'SIDEBAR', configuracion: { ...tenant.configuracion, idioma: 'es' } } });
}
test.beforeEach(restablecerPreferencias);
test.afterEach(restablecerPreferencias);
async function entrar(page: Page, email = 'superadmin.e2e@e2e.invalid') {
  await page.goto('/login');
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(PASSWORD);
  await page.getByRole('button', { name: 'INGRESAR AL SISTEMA' }).click();
  await expect(page).not.toHaveURL(/\/login$/);
}

test('visita inicial y aviso antiguo no muestran sesión expirada; logout tampoco', async ({ page }) => {
  await page.goto('/login');
  await page.evaluate(() => sessionStorage.setItem('ferre_session_expired', '1'));
  await page.reload();
  await expect(page.getByText(/Tu sesión ha expirado/)).toHaveCount(0);
  await entrar(page);
  // Un solo cierre de sesión accesible en el shell del Super Admin (la topbar de plataforma).
  await expect(page.getByTitle(/^(Cerrar Sesión|Log Out)$/)).toHaveCount(1);
  await page.getByTitle(/^(Cerrar Sesión|Log Out)$/).click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByText(/Tu sesión ha expirado/)).toHaveCount(0);
});

test('Super Admin gestiona sucursales con persistencia y desactivación real', async ({ page }) => {
  await entrar(page);
  // El rail ofrece las cinco áreas de herramientas globales; las secciones de cada área son pestañas (aquí, Usuarios y soporte).
  const areas = page.getByRole('navigation', { name: 'Áreas de la plataforma' });
  await expect(areas.getByRole('list').getByRole('link')).toHaveText(['Inicio', 'Empresas', 'Módulos', 'Usuarios y soporte', 'Auditoría']);
  await areas.getByRole('link', { name: 'Usuarios y soporte' }).click();
  await expect(page.getByRole('tablist', { name: 'Usuarios y soporte' }).getByRole('tab')).toHaveText(['Administradores', 'Soporte remoto'], { useInnerText: true });
  await page.goto(`/admin/negocios/${A}`);
  await expect(page.getByRole('tablist', { name: 'Administración del negocio' }).getByRole('tab')).toHaveText(['Resumen y sucursales', 'Usuarios', 'Servicios', 'Configuración y marca', 'Auditoría'], { useInnerText: true });
  await expect(page.getByRole('heading', { name: 'Sucursales del negocio' })).toBeVisible();
  await page.screenshot({ path: test.info().outputPath('negocio-resumen.png'), fullPage: true });
  await page.getByRole('button', { name: 'Crear sucursal' }).click();
  await page.getByLabel('Nombre', { exact: true }).fill(`Sucursal ${run}`);
  await page.getByLabel('Dirección', { exact: true }).fill('Dirección de prueba');
  await page.getByRole('button', { name: 'Guardar', exact: true }).click();
  const row = page.getByRole('row').filter({ hasText: `Sucursal ${run}` });
  await expect(row).toBeVisible();
  const before = await prisma.sucursal.findFirstOrThrow({ where: { tenantId: A, nombre: `Sucursal ${run}` } });
  await row.getByRole('button', { name: 'Desactivar' }).click();
  await confirmarAlerta(page, 'Desactivar');
  await expect(row).toContainText('Inactivo');
  await page.reload(); await expect(row).toContainText('Inactivo');
  expect((await prisma.sucursal.findUniqueOrThrow({ where: { id: before.id } })).activa).toBe(false);
  await row.getByRole('button', { name: 'Reactivar' }).click();
  await confirmarAlerta(page, 'Reactivar');
  await expect(row).toContainText('Activo');
  expect(await prisma.auditoriaOperacion.count({ where: { tenantId: A, entidadId: before.id } })).toBe(3);
});

test('Super Admin crea y edita un administrador; desactivar revoca acceso y conserva historial', async ({ page }) => {
  await entrar(page);
  await page.goto(`/admin/negocios/${A}/usuarios`);
  await page.getByRole('button', { name: 'Crear usuario' }).click();
  const form = page.getByRole('form', { name: 'Datos del usuario' });
  await form.getByLabel('Nombre', { exact: true }).fill(`Admin ${run}`);
  await form.getByLabel('Correo electrónico', { exact: true }).fill(`nuevo-${run}@e2e.invalid`);
  await form.getByLabel('Rol', { exact: true }).selectOption('ADMIN');
  await form.getByLabel('Contraseña', { exact: true }).fill(PASSWORD);
  await form.getByRole('button', { name: 'Guardar', exact: true }).click();
  const row = page.getByRole('row').filter({ hasText: `nuevo-${run}@e2e.invalid` });
  await expect(row).toContainText('ADMIN');
  const login = await page.request.post(`${API}/auth/login`, { data: { email: `nuevo-${run}@e2e.invalid`, password: PASSWORD } });
  expect(login.status()).toBe(200); const token = (await login.json()).accessToken;
  await row.getByRole('button', { name: 'Editar', exact: true }).click();
  await form.getByLabel('Nombre', { exact: true }).fill(`Editado ${run}`);
  await form.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(row).toContainText(`Editado ${run}`);
  await row.getByRole('button', { name: 'Desactivar' }).click();
  await confirmarAlerta(page, 'Desactivar');
  await expect(row).toContainText('Inactivo');
  expect((await page.request.get(`${API}/auth/me`, { headers: { Authorization: `Bearer ${token}` } })).status()).toBe(401);
  const user = await prisma.usuario.findFirstOrThrow({ where: { tenantId: A, email: `nuevo-${run}@e2e.invalid` } });
  expect(user.activo).toBe(false);
  expect(await prisma.auditoriaOperacion.count({ where: { tenantId: A, entidadId: user.id } })).toBe(3);
});

test('idioma se guarda por negocio; todos sus roles lo heredan sin selector en escritorio ni móvil', async ({ page }) => {
  await entrar(page);
  const platformToken = await page.evaluate(() => localStorage.getItem('ferre_token'));
  const vendedorEmail = `vendedor-${run}@e2e.invalid`;
  const creado = await page.request.post(`${API}/admin/tenants/${A}/usuarios`, { headers: { Authorization: `Bearer ${platformToken}` }, data: { nombre: 'Vendedor idioma', email: vendedorEmail, rol: 'VENDEDOR', password: PASSWORD } });
  expect(creado.status()).toBe(201);
  await page.goto(`/admin/negocios/${A}/configuracion`);
  await page.getByRole('button', { name: 'English (EN)', exact: true }).click();
  expect((await prisma.tenant.findUniqueOrThrow({ where: { id: A } })).configuracion.idioma).not.toBe('en');
  await page.getByRole('button', { name: /APLICAR CAMBIOS/i }).click();
  await expect(page.getByRole('status').filter({ hasText: /Configuración de marca guardada/ })).toBeVisible();
  expect((await prisma.tenant.findUniqueOrThrow({ where: { id: A } })).configuracion.idioma).toBe('en');
  await page.reload();
  await expect(page.getByRole('button', { name: 'English (EN)', exact: true })).toBeVisible();
  for (const email of ['admin.a@e2e.invalid','cajero.a@e2e.invalid',vendedorEmail,'bodeguero.a@e2e.invalid']) {
    await page.getByTitle(/^(Cerrar Sesión|Log Out)$/).click();
    await entrar(page, email);
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.getByRole('button', { name: /^(ES|EN)$/ })).toHaveCount(0);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator('.mobile-bottom-nav button').click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByRole('button', { name: /^(ES|EN)$/ })).toHaveCount(0);
    await page.keyboard.press('Escape');
    await page.setViewportSize({ width: 1440, height: 900 });
  }
  await page.getByTitle(/^(Cerrar Sesión|Log Out)$/).click();
  await entrar(page);
  const bearer = await page.evaluate(() => localStorage.getItem('ferre_token'));
  expect((await page.request.put(`${API}/admin/tenants/${A}/settings`, { headers: { Authorization: `Bearer ${bearer}` }, data: { configuracion: { idioma: 'es' } } })).status()).toBe(200);
});

test('el valor histórico TOPNAV no cambia la navegación: rail y barra superior, y la marca enlaza a Inicio', async ({ page }) => {
  await entrar(page);
  const bearer = await page.evaluate(() => localStorage.getItem('ferre_token'));
  // El backend sigue aceptando el valor histórico (compatibilidad), pero ya no decide la navegación.
  await page.request.put(`${API}/admin/tenants/${A}/settings`, { headers: { Authorization: `Bearer ${bearer}` }, data: { modoNavegacion: 'TOPNAV' } });
  await page.getByTitle(/^(Cerrar Sesión|Log Out)$/).click();
  await entrar(page, 'admin.a@e2e.invalid');
  const rail = page.locator('nav.admin-rail');
  await expect(rail).toBeVisible();
  await expect(page.locator('header.admin-topbar')).toBeVisible();
  await expect(page.locator('header.jowa-topnav')).toHaveCount(0);
  await page.screenshot({ path: test.info().outputPath('navegacion-hibrida-real.png'), fullPage: true });
  await rail.getByRole('button', { name: 'Inventario', exact: true }).click();
  await page.locator('#app-rail-panel-inventario a[href="/inventario"]').click();
  await expect(page).toHaveURL(/\/inventario$/);
  await rail.getByRole('link', { name: 'Jowa System: ir a Inicio' }).click();
  await expect(page).toHaveURL(/\/$/);
  await page.getByTitle(/^(Cerrar Sesión|Log Out)$/).click();
  await entrar(page);
  const sa = await page.evaluate(() => localStorage.getItem('ferre_token'));
  await page.request.put(`${API}/admin/tenants/${A}/settings`, { headers: { Authorization: `Bearer ${sa}` }, data: { modoNavegacion: 'SIDEBAR' } });
});

test('Super Admin guarda TOPNAV/SIDEBAR por negocio y el ADMIN recibe el menú híbrido persistido', async ({ page, browser }) => {
  await entrar(page);
  const otroAntes = await prisma.tenant.findUniqueOrThrow({ where: { id: 'e2e-empresa-b' } });
  await page.goto(`/admin/negocios/${A}/configuracion`);
  for (const modo of ['TOPNAV', 'SIDEBAR']) {
    await page.locator('#navigation-mode').selectOption(modo);
    await page.getByRole('button', { name: /APLICAR CAMBIOS/i }).click();
    await expect(page.getByRole('status').filter({ hasText: 'guardada correctamente' })).toBeVisible();
    expect((await prisma.tenant.findUniqueOrThrow({ where: { id: A } })).modoNavegacion).toBe(modo);
    expect((await prisma.tenant.findUniqueOrThrow({ where: { id: 'e2e-empresa-b' } })).modoNavegacion).toBe(otroAntes.modoNavegacion);
    await page.reload();
    await expect(page.locator('#navigation-mode')).toHaveValue(modo);
    await expect(page.getByRole('navigation', { name: 'Áreas de la plataforma' })).toBeVisible();
    const contexto = await browser.newContext({ viewport: { width: 1366, height: 768 } });
    try {
      const admin = await contexto.newPage();
      await entrar(admin, 'admin.a@e2e.invalid');
      await expect(admin.locator('[data-navigation-mode]')).toHaveAttribute('data-navigation-mode', modo);
      await expect(admin.locator('header.admin-topbar')).toBeVisible();
      const menu = admin.locator('nav.app-rail');
      await expect(menu).toBeVisible();
      const caja = await menu.boundingBox();
      expect(caja!.width).toBe(modo === 'TOPNAV' ? 1366 : 84);
      await admin.goto('/configuracion');
      await expect(admin.getByRole('heading', { name: 'Acceso Denegado', exact: true })).toBeVisible();
    } finally { await contexto.close(); }
  }
});
