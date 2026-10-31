import { expect, test, type Page } from '@playwright/test';

// Auditoría de producción 2026-10-30 (AUD-COM-01). Navegador real → API NestJS compilada → PostgreSQL temporal. Sin mocks.
// Estado tras #226 (fusionado en main 46f7db7): Comisiones está excluido para todos los negocios. La ruta /comisiones
// responde «Acceso Denegado» aunque la sesión lo incluya. El cálculo defectuoso (AUD-COM-01/02/03) sigue en
// frontend/src/pages/ComisionesPage.tsx y solo se alcanzaría reactivando el módulo, algo que hoy no es posible.
// Esta prueba NO usa test.fail: verifica la exclusión real. No se marca como defecto confirmado.

const PASSWORD = process.env.E2E_PASSWORD!;

async function ingresar(page: Page, email: string, ruta: string) {
  await page.goto('/login');
  await page.locator('#login-correo').fill(email);
  await page.locator('#login-clave').fill(PASSWORD);
  await page.getByRole('button', { name: 'INGRESAR AL SISTEMA' }).click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'));
  await page.goto(ruta);
}

test('Comisiones excluido: la ruta se deniega y el módulo no aparece, con sesión de ADMIN', async ({ page }) => {
  await ingresar(page, 'admin.a@e2e.invalid', '/comisiones');
  await expect(page.getByRole('heading', { name: 'Acceso Denegado', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'COMISIONES DE VENTA', exact: true })).toHaveCount(0);
});
