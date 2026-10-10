import { expect, test, type Page } from '@playwright/test';

// E2E REAL (backend NestJS + PostgreSQL temporal, sin mocks): QA-NAV-001. El cajero busca y selecciona
// un cliente registrado en el POS.

const PASSWORD = process.env.E2E_PASSWORD!;
const CAJERO = 'cajero.a@e2e.invalid';

async function ingresarCajero(page: Page, ruta: string) {
  await page.goto('/login');
  await page.locator('input[type="email"]').fill(CAJERO);
  await page.locator('input[type="password"]').fill(PASSWORD);
  await page.getByRole('button', { name: 'INGRESAR AL SISTEMA' }).click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'));
  await page.goto(ruta);
}

test.describe('POS — cajero selecciona clientes (backend real)', () => {
  test('el cajero busca por nombre y selecciona el cliente registrado', async ({ page }) => {
    await ingresarCajero(page, '/pos');
    await page.locator('#quotation-client-search').fill('Constructora');
    const opcion = page.getByRole('button', { name: /Constructora del Norte E2E/ });
    await expect(opcion).toBeVisible();
    await opcion.click();
    await expect(page.getByText('Cliente registrado seleccionado.')).toBeVisible();
  });

  test('el cajero encuentra un cliente por teléfono', async ({ page }) => {
    await ingresarCajero(page, '/pos');
    await page.locator('#quotation-client-search').fill('3311-2244');
    await expect(page.getByRole('button', { name: /Taller San José E2E/ })).toBeVisible();
  });
});
