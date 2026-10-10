import { expect, test, type Page } from '@playwright/test';

// E2E REAL (backend NestJS + PostgreSQL temporal, sin mocks): QA-NAV-003. El inicio no debe pedir el
// resumen a roles sin permiso; el administrador sí lo recibe.

const PASSWORD = process.env.E2E_PASSWORD!;

async function ingresar(page: Page, email: string) {
  await page.goto('/login');
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(PASSWORD);
  await page.getByRole('button', { name: 'INGRESAR AL SISTEMA' }).click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'));
}

test.describe('Inicio según rol (backend real)', () => {
  test('el cajero no solicita /dashboard y no ve errores de permisos', async ({ page }) => {
    const peticiones: { url: string; status: number }[] = [];
    page.on('response', (r) => { if (r.url().includes('/api/dashboard')) peticiones.push({ url: r.url(), status: r.status() }); });
    await ingresar(page, 'cajero.a@e2e.invalid');
    await page.goto('/');
    await expect(page.getByRole('heading').first()).toBeVisible();
    await page.waitForTimeout(1500);
    expect(peticiones).toEqual([]);
    await expect(page.getByRole('alert').filter({ hasText: 'No se pudo cargar el resumen' })).toHaveCount(0);
  });

  test('el administrador recibe el resumen del negocio', async ({ page }) => {
    const respuesta = page.waitForResponse((r) => r.url().includes('/api/dashboard'));
    await ingresar(page, 'admin.a@e2e.invalid');
    await page.goto('/');
    expect((await respuesta).status()).toBe(200);
  });
});
