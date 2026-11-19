import { test, expect } from '@playwright/test';
import { prepararSesion, auditarContraste, desbordamientoHorizontal } from './ux-auditoria.fixture';

test.describe('Inicio de sesión — Mostrar / ocultar contraseña', () => {
  for (const width of [1440, 390, 320]) {
    test(`el botón de alternancia muestra u oculta la clave, no envía el formulario y es accesible @${width}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await prepararSesion(page, 'ADMIN', { sinSesion: true });

      let loginSubmitted = false;
      await page.route('**/api/auth/login', async route => {
        loginSubmitted = true;
        await route.fulfill({ status: 200, json: { type: 'tenant', accessToken: 'mock-token', user: {}, tenant: {} } });
      });

      await page.goto('/login');

      const passwordInput = page.locator('#login-clave');
      await expect(passwordInput).toBeVisible();

      // 1. La contraseña debe permanecer oculta por defecto
      await expect(passwordInput).toHaveAttribute('type', 'password');

      // 2. El botón debe tener etiqueta accesible en español, type="button" y aria-controls
      const toggleBtn = page.getByRole('button', { name: 'Mostrar contraseña' });
      await expect(toggleBtn).toBeVisible();
      await expect(toggleBtn).toHaveAttribute('type', 'button');
      await expect(toggleBtn).toHaveAttribute('aria-controls', 'login-clave');
      await expect(toggleBtn).toHaveAttribute('aria-pressed', 'false');

      // 3. Escribir contraseña
      await passwordInput.fill('Secreta12345*');

      // Evidencias visuales para desktop y móvil
      const fs = await import('node:fs');
      const path = await import('node:path');
      const outDir = path.resolve(process.cwd(), '../docs/evidencias/login-toggle-password');
      fs.mkdirSync(outDir, { recursive: true });

      if (width === 1440) {
        await page.screenshot({ path: path.join(outDir, 'login-desktop-oculta.png') });
      } else if (width === 390) {
        await page.screenshot({ path: path.join(outDir, 'login-movil-oculta.png') });
      }

      // 4. Al pulsar el ícono, cambia a mostrar contraseña
      await toggleBtn.click();
      await expect(passwordInput).toHaveAttribute('type', 'text');
      expect(await passwordInput.inputValue()).toBe('Secreta12345*');

      if (width === 1440) {
        await page.screenshot({ path: path.join(outDir, 'login-desktop-visible.png') });
      } else if (width === 390) {
        await page.screenshot({ path: path.join(outDir, 'login-movil-visible.png') });
      }

      // El ícono y la etiqueta accesible cambian a «Ocultar contraseña»
      const hideBtn = page.getByRole('button', { name: 'Ocultar contraseña' });
      await expect(hideBtn).toBeVisible();
      await expect(hideBtn).toHaveAttribute('aria-pressed', 'true');

      // El formulario NO debe haberse enviado al hacer clic en el botón
      expect(loginSubmitted).toBe(false);

      // 5. Al pulsar de nuevo, vuelve a ocultar la contraseña
      await hideBtn.click();
      await expect(passwordInput).toHaveAttribute('type', 'password');
      await expect(page.getByRole('button', { name: 'Mostrar contraseña' })).toBeVisible();
      expect(loginSubmitted).toBe(false);

      // 6. Accesibilidad por teclado: enfocar con Tab y alternar con Space/Enter
      await passwordInput.focus();
      await page.keyboard.press('Tab');
      await expect(page.getByRole('button', { name: 'Mostrar contraseña' })).toBeFocused();

      await page.keyboard.press('Space');
      await expect(passwordInput).toHaveAttribute('type', 'text');
      await expect(page.getByRole('button', { name: 'Ocultar contraseña' })).toBeFocused();
      expect(loginSubmitted).toBe(false);

      await page.keyboard.press('Enter');
      await expect(passwordInput).toHaveAttribute('type', 'password');
      expect(loginSubmitted).toBe(false);

      // 7. Sin desbordamiento en móvil y sin fallos de contraste
      expect(await desbordamientoHorizontal(page)).toBeLessThanOrEqual(0);
      const fallosContraste = (await auditarContraste(page)).filter(f => !f.deshabilitado);
      expect(fallosContraste).toEqual([]);
    });
  }
});
