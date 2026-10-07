import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../src/prisma/prisma.service';

/** Called only by the suite that owns a disposable PostgreSQL cluster and API. */
export async function checkSettingsHttp(prisma: PrismaService, base: string) {
  const password = 'synthetic-settings-password';
  const passwordHash = await bcrypt.hash(password, 4);
  const a = await prisma.tenant.create({ data: { nombreComercial: 'Settings A' } });
  const b = await prisma.tenant.create({ data: { nombreComercial: 'Settings B' } });
  const users = await Promise.all([['ADMIN', a.id], ['ADMIN', b.id], ['CAJERO', a.id]].map(([rol, tenantId]) =>
    prisma.usuario.create({ data: { nombre: rol, rol: rol as 'ADMIN' | 'CAJERO', tenantId, email: `${randomUUID()}@example.test`, passwordHash } })));
  const superadmin = await prisma.superAdmin.create({ data: { nombre: 'Settings SA', email: `${randomUUID()}@example.test`, passwordHash } });
  const call = (path: string, token?: string, method = 'GET', body?: unknown) => fetch(`${base}${path}`, {
    method, headers: { 'Content-Type': 'application/json', Connection: 'close', ...(token && { Authorization: `Bearer ${token}` }) },
    ...(body !== undefined && { body: JSON.stringify(body) }),
  });
  async function login(user: { email: string; tenantId?: string }, admin = false) {
    const response = await call(admin ? '/admin/auth/login' : '/auth/login', undefined, 'POST', { email: user.email, password, ...(user.tenantId && { tenantId: user.tenantId }) });
    expect(response.status).toBe(200);
    return response.json() as Promise<any>;
  }
  async function settings(token: string) {
    const response = await call('/tenant/settings', token);
    expect(response.status).toBe(200);
    return response.json() as Promise<any>;
  }
  const adminA = await login(users[0]);
  const adminB = await login(users[1]);
  const cashier = await login(users[2]);
  const sa = await login(superadmin, true);
  const token = adminA.accessToken;
  expect(await settings(token)).toMatchObject({ configuracion: {}, templateVersion: 'v1', v2Mode: 'light' });
  const bBefore = await settings(adminB.accessToken);
  const saved = { nombreComercial: 'Marca persistida', direccion: 'Calle sintética', telefono: '99990000', email: 'marca@example.test', logoUrl: 'https://example.test/logo.png', colorPrimario: '#123456', modoNavegacion: 'TOPNAV', configuracion: { templateVersion: 'v2', v2Mode: 'dark', estiloUI: 'MODERNO', fuenteTitulos: 'Poppins', fuenteCuerpo: 'Inter' } };
  const put = await call('/tenant/settings', token, 'PUT', saved);
  expect(put.status).toBe(200);
  expect(await put.json()).toMatchObject(saved);
  expect(await prisma.tenant.findUniqueOrThrow({ where: { id: a.id } })).toMatchObject(saved);
  expect(await settings(token)).toMatchObject(saved);
  // A fresh authentication exchange, with no browser cache or reused refresh token.
  expect((await login(users[0])).tenant).toMatchObject({ nombreComercial: saved.nombreComercial, modoNavegacion: 'TOPNAV', ...saved.configuracion });
  expect(await settings(adminB.accessToken)).toEqual(bBefore);
  expect((await call('/tenant/settings', cashier.accessToken, 'PUT', { nombreComercial: 'Forbidden' })).status).toBe(403);
  expect((await call(`/admin/tenants/${b.id}`, token, 'PATCH', { nombreComercial: 'Forbidden' })).status).toBe(403);
  // A tenant id supplied in an untrusted body must never select the target tenant.
  expect((await call('/tenant/settings', token, 'PUT', { tenantId: b.id, colorPrimario: '#234567' })).status).toBe(200);
  expect(await settings(adminB.accessToken)).toEqual(bBefore);
  const brand = { nombreComercial: 'Marca Super Admin', colorPrimario: '#345678', modoNavegacion: 'SIDEBAR', logoUrl: 'https://example.test/sa.png' };
  expect((await call(`/admin/tenants/${a.id}`, sa.accessToken, 'PATCH', brand)).status).toBe(200);
  expect(await settings(token)).toMatchObject({ ...brand, configuracion: saved.configuracion });
  expect((await login(users[0])).tenant).toMatchObject({ ...brand, ...saved.configuracion });
  const cleared = { logoUrl: null, direccion: '', telefono: '', email: '', configuracion: {} };
  expect((await call('/tenant/settings', token, 'PUT', cleared)).status).toBe(200);
  expect(await prisma.tenant.findUniqueOrThrow({ where: { id: a.id } })).toMatchObject(cleared);
  expect(await settings(token)).toMatchObject({ ...cleared, templateVersion: 'v1', v2Mode: 'light' });
  expect((await login(users[0])).tenant).toMatchObject({ logoUrl: null, direccion: '', telefono: '', email: '', templateVersion: 'v1', v2Mode: 'light' });
  expect(await settings(adminB.accessToken)).toEqual(bBefore);

  for (const enabled of [false, true]) {
    expect((await call(`/admin/tenants/${a.id}/modules`, sa.accessToken, 'PUT', { modules: [{ moduleKey: 'pos', enabled }] })).status).toBe(200);
    for (const user of [adminA, cashier]) {
      for (const path of ['/operaciones/entregas', '/operaciones/solicitudes-devolucion']) {
        expect((await call(path, user.accessToken)).status).toBe(enabled ? 200 : 403);
      }
      for (const path of ['/operaciones/caja', '/operaciones/cuentas?tipo=CXC']) expect((await call(path, user.accessToken)).status).toBe(200);
      if (!enabled) {
        expect((await call(`/operaciones/ventas/${randomUUID()}/entregar`, user.accessToken, 'POST', {})).status).toBe(403);
        expect((await call(`/operaciones/ventas/${randomUUID()}/solicitudes-devolucion`, user.accessToken, 'POST', {})).status).toBe(403);
      }
    }
  }
  if (process.env.REAL_SETTINGS_BROWSER === '1') {
    execFileSync(process.execPath, [resolve('test/real-settings-browser.mjs')], {
      timeout: 60000, windowsHide: true, stdio: 'inherit',
      env: { ...process.env, VITE_API_URL: '/api', SETTINGS_API: base, SETTINGS_EMAIL: users[0].email, SETTINGS_PASSWORD: password },
    });
    expect((await settings(token)).nombreComercial).toBe('Marca navegador real');
    expect(await settings(adminB.accessToken)).toEqual(bBefore);
  }
  console.log('Configuración HTTP real: login, ADMIN, Super Admin, nueva sesión, dos tenants, Cajero, limpieza y módulos POS verificados');
}
