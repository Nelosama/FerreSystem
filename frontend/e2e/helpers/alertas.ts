import { expect, type Page } from '@playwright/test';

/**
 * Responde a una confirmación de la app (SweetAlert2, utils/alertas.ts). Por defecto acepta con "Confirmar";
 * pase otro nombre para elegir un botón distinto (p. ej. "Cancelar" o el nombre de la acción).
 */
export async function confirmarAlerta(page: Page, boton = 'Confirmar') {
  const modal = page.locator('.ferre-alerta');
  await expect(modal).toBeVisible();
  await modal.getByRole('button', { name: boton, exact: true }).click();
  await expect(modal).toBeHidden();
}
