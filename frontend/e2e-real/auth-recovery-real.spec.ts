import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';

// Real UI -> API -> disposable PostgreSQL. No email provider or production accounts.
const API = process.env.E2E_API_URL!;
const PASSWORD = process.env.E2E_PASSWORD!;
const tenantId = 'e2e-empresa-a';

for (const width of [390, 1440]) {
  test(`CONTADOR recupera su acceso con enlace privado de un solo uso @${width}`, async ({ page, request }) => {
    await page.setViewportSize({ width, height: 900 });
    const login = await request.post(`${API}/auth/login`, { data: { email: 'admin.a@e2e.invalid', password: PASSWORD, tenantId } });
    expect(login.status()).toBe(200);
    const headers = { Authorization: `Bearer ${(await login.json()).accessToken}` };
    const email = `recovery-${randomUUID()}@e2e.invalid`;
    const created = await request.post(`${API}/usuarios`, { headers, data: { nombre: 'Contador recuperación', email, rol: 'CONTADOR' } });
    expect(created.status()).toBe(201);
    const usuarioId = (await created.json()).id;
    const issue = async () => {
      const res = await request.post(`${API}/auth/security/admin-reset`, { headers, data: { usuarioId, tenantId, currentPassword: PASSWORD } });
      expect(res.status()).toBe(201);
      return (await res.json()).token as string;
    };
    const redeem = async (token: string, password: string) => {
      await page.goto(`/login?empresa=${tenantId}#action=RESET_ADMIN&token=${token}`);
      await expect(page.locator('#recovery-token')).toHaveValue(token);
      await expect(page).toHaveURL(url => !url.hash);
      await page.locator('#recovery-password').fill(password);
      const response = page.waitForResponse(res => res.url().endsWith('/auth/security/reset') && res.request().method() === 'POST');
      await page.getByRole('button', { name: 'Continuar', exact: true }).click();
      expect((await response).status()).toBe(200);
      await expect(page.locator('#recovery-password')).toHaveValue('');
      expect(await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }))).not.toContain(token);
    };
    const firstPassword = 'Synthetic-Contador-First-456!';
    const nextPassword = 'Synthetic-Contador-Next-789!';
    const token = await issue();
    await redeem(token, firstPassword);
    expect((await request.post(`${API}/auth/security/reset`, { data: { token, password: firstPassword } })).status()).toBe(401);
    const firstLogin = await request.post(`${API}/auth/login`, { data: { email, tenantId, password: firstPassword } });
    expect(firstLogin.status()).toBe(200);
    const oldHeaders = { Authorization: `Bearer ${(await firstLogin.json()).accessToken}` };
    const secondToken = await issue();
    expect((await request.get(`${API}/auth/me`, { headers: oldHeaders })).status()).toBe(401);
    await redeem(secondToken, nextPassword);
    expect((await request.post(`${API}/auth/login`, { data: { email, tenantId, password: firstPassword } })).status()).toBe(401);
    await page.locator('#login-correo').fill(email);
    await page.locator('#login-clave').fill(nextPassword);
    await page.getByRole('button', { name: 'Ingresar al sistema', exact: true }).click();
    await expect(page).not.toHaveURL(/\/login/);
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('ferre_user') || '{}').rol)).toBe('CONTADOR');
  });
}
