import { activateTestUser } from './activation.fixture';
import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';

// Authenticates every role against the real API. Explicit permissions are granted
// to prove that a permission cannot override an ADMIN-only role restriction.
const API = process.env.E2E_API_URL!;
const PASSWORD = process.env.E2E_PASSWORD!;
const headers = (token: string) => ({ Authorization: `Bearer ${token}` });
const roles = ['ADMIN', 'CAJERO', 'BODEGUERO', 'VENDEDOR'] as const;
const users = new Map<string, { id: string; email: string; token: string }>();
let originalAdminId = '';
const reads = [
  { route: '/usuarios', allowed: ['ADMIN'] },
  { route: '/operaciones/caja', allowed: ['ADMIN', 'CAJERO', 'VENDEDOR'] },
  { route: '/operaciones/entregas', allowed: ['ADMIN', 'CAJERO', 'BODEGUERO'] },
  { route: '/operaciones/compras', allowed: ['ADMIN', 'BODEGUERO'] },
  // Auditoría: solo SUPERADMIN (ruta por negocio). Ningún rol de negocio la lee por esta ruta.
  { route: '/operaciones/auditoria', allowed: [] },
  { route: '/contingencia/dispositivos', allowed: ['ADMIN'] },
];

test.beforeAll(async ({ request }) => {
  const login = await request.post(`${API}/auth/login`, { data: { email: 'admin.a@e2e.invalid', password: PASSWORD } });
  expect(login.status()).toBe(200);
  const session = await login.json();
  const admin = session.accessToken;
  originalAdminId = session.user.id;
  const platformLogin = await request.post(`${API}/auth/login`, { data: { email: 'superadmin.e2e@e2e.invalid', password: PASSWORD } });
  expect(platformLogin.status()).toBe(200);
  const platform = (await platformLogin.json()).accessToken;
  for (const rol of roles) {
    const email = `pilot.${rol.toLowerCase()}.${randomUUID()}@e2e.invalid`;
    // Only the platform creates ADMIN; tenant ADMIN still creates the other roles.
    const route = rol === 'ADMIN' ? `/admin/tenants/${session.tenant.id}/usuarios` : '/usuarios';
    const created = await request.post(`${API}${route}`, { headers: headers(rol === 'ADMIN' ? platform : admin), data: {
      nombre: `Pilot permissions ${rol}`, email, rol,
      permisos: ['inventario.ver', 'inventario.editar', 'pos.vender', 'usuarios.gestionar', 'reportes.ver'],
    } });
    expect(created.status(), await created.text()).toBe(201);
    await activateTestUser(request, (await created.json()).id);
    const authenticated = await request.post(`${API}/auth/login`, { data: { email, password: PASSWORD } });
    expect(authenticated.status()).toBe(200);
    const body = await authenticated.json();
    expect(body.user.rol).toBe(rol);
    users.set(rol, { id: body.user.id, email, token: body.accessToken });
  }
});

for (const rol of roles) {
  test(`${rol}: real session, API role matrix and protected administrative route`, async ({ page, request }) => {
    const user = users.get(rol)!;
    for (const read of reads) {
      const response = await request.get(`${API}${read.route}`, { headers: headers(user.token) });
      expect(response.status(), `${rol} GET ${read.route}`).toBe(read.allowed.includes(rol) ? 200 : 403);
    }
    if (rol === 'ADMIN') {
      const deniedCreate = await request.post(`${API}/usuarios`, { headers: headers(user.token), data: {
        nombre: 'Denied admin', email: `denied.${randomUUID()}@e2e.invalid`, rol: 'ADMIN',
      } });
      expect(deniedCreate.status(), 'tenant ADMIN cannot create ADMIN').toBe(403);
      for (const id of [user.id, originalAdminId]) {
        for (const data of [{ nombre: 'Denied edit' }, { permisos: ['pos.excepcion_precio'] }, { activo: false }]) {
          expect((await request.put(`${API}/usuarios/${id}`, { headers: headers(user.token), data })).status()).toBe(403);
        }
        expect((await request.delete(`${API}/usuarios/${id}`, { headers: headers(user.token) })).status()).toBe(403);
      }
      const employee = users.get('CAJERO')!;
      expect((await request.put(`${API}/usuarios/${employee.id}`, { headers: headers(user.token), data: { nombre: 'Pilot cashier edited' } })).status()).toBe(200);
    } else {
      const response = await request.patch(`${API}/contingencia/configuracion`, { headers: headers(user.token), data: { habilitada: true } });
      expect(response.status(), 'a permission cannot grant ADMIN configuration rights').toBe(403);
      const create = await request.post(`${API}/usuarios`, { headers: headers(user.token), data: {
        nombre: 'Unauthorized user', email: `denied.${randomUUID()}@e2e.invalid`, rol: 'ADMIN',
      } });
      expect(create.status(), 'cannot create privileged users').toBe(403);
    }
    await page.goto('/login');
    await page.locator('#login-correo').fill(user.email);
    await page.locator('#login-clave').fill(PASSWORD);
    await page.getByRole('button', { name: 'INGRESAR AL SISTEMA' }).click();
    await page.waitForURL(url => !url.pathname.startsWith('/login'));
    await page.goto('/usuarios');
    if (rol === 'ADMIN') await expect(page.getByRole('heading', { name: 'Equipo de Trabajo' })).toBeVisible();
    else await expect(page.getByRole('heading', { name: /acceso denegado/i })).toBeVisible();
  });
}
