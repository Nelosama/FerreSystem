import { expect, test as base, type Page, type Route } from '@playwright/test';

// E2E CON BACKEND SIMULADO: devoluciones y reembolsos (etapa 2, decisión del dueño del 2026-11-12).
// Comprueba que la pantalla no exige motivo ni condición, envía la condición solo si se escribe, ofrece registrar la
// referencia del reverso y que solo el ADMIN ve la decisión cuando la tarjeta no se puede revertir. Las reglas del servidor
// están en backend/test/reembolsos-devolucion.postgres.integration.ts.

const tenant = { id: 'tenant-dev-e2e', nombreComercial: 'Ferretería de prueba', colorPrimario: '#EA580C' };
type Sim = { rol: 'ADMIN' | 'CAJERO'; llamadas: { method: string; path: string; body: any }[]; reembolsos: any[]; errores: string[]; inesperados: string[] };

const venta = {
  id: 'venta-1', numero_venta: 12, cliente_nombre: 'Cliente mostrador', metodo_pago: 'TARJETA', total: 230, reserva_pendiente: false, devoluciones: [],
  items: [{ id: 'det-1', codigo: 'TAL-1', nombre: 'Taladro', cantidad: 2, devuelto: 0, sin_inventario: false }],
};
const reembolsoTarjeta = {
  id: 'reem-1', devolucion_id: 'dev-1', metodo: 'TARJETA', estado: 'PENDIENTE', monto: 115, referencia: null, evidencia: null, nota: null,
  intentos_fallidos: 0, registrado_por: 'user-CAJERO', registrado_por_nombre: 'Cajera de prueba', registrado_at: '2026-11-13T15:00:00.000Z', numero_venta: 12,
};

const test = base.extend<{ sim: Sim }>({
  sim: [async ({ page, baseURL }, use) => {
    const sim: Sim = { rol: 'CAJERO', llamadas: [], reembolsos: [reembolsoTarjeta], errores: [], inesperados: [] };
    const origen = new URL(baseURL!).origin;
    const cabeceras = { 'access-control-allow-origin': origen, 'access-control-allow-credentials': 'true' };
    page.on('pageerror', e => sim.errores.push(e.message));
    const responder = (route: Route, status: number, body: unknown) => route.fulfill({ status, json: body, headers: cabeceras });
    await page.route('**/*', async route => {
      const request = route.request();
      const url = new URL(request.url());
      if (!url.pathname.startsWith('/api/')) { if (url.origin === origen) await route.continue(); else await route.abort(); return; }
      const method = request.method();
      const path = url.pathname.slice(4);
      const usuario = { id: `user-${sim.rol}`, nombre: sim.rol === 'ADMIN' ? 'Administrador de prueba' : 'Cajera de prueba', email: 'usuario@prueba.invalid', rol: sim.rol };
      if (method === 'OPTIONS') { await route.fulfill({ status: 204, headers: { ...cabeceras, 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } }); return; }
      if (method === 'GET' && path === '/tenant/settings') return responder(route, 200, { ...tenant, modoNavegacion: 'SIDEBAR' });
      if (method === 'GET' && path === '/auth/me') return responder(route, 200, { user: { sub: usuario.id, tenantId: tenant.id, rol: sim.rol, permisos: [], permisosConfigurados: false, descuentoMaximo: 0 } });
      if (method === 'POST' && path === '/auth/login') return responder(route, 200, { type: 'tenant', accessToken: 'dev-e2e-token', user: usuario, tenant });
      if (method === 'GET' && path === '/operaciones/solicitudes-devolucion') return responder(route, 200, []);
      if (method === 'GET' && path === '/operaciones/reembolsos') return responder(route, 200, { reembolsos: sim.reembolsos, page: 1, hayMas: false });
      if (method === 'GET' && path === '/operaciones/ventas/buscar') return responder(route, 200, venta);
      if (method === 'GET' && /^\/operaciones\/solicitudes-devolucion\/[^/]+$/.test(path)) return responder(route, 404, { message: 'Solicitud no encontrada' });
      const body = request.postData() ? request.postDataJSON() : undefined;
      if (method === 'POST' && path === '/operaciones/ventas/venta-1/solicitudes-devolucion') {
        sim.llamadas.push({ method, path, body });
        return responder(route, 201, { id: body.solicitudId, estado: 'PENDIENTE', comando: body, venta_id: 'venta-1' });
      }
      if (method === 'POST' && /^\/operaciones\/reembolsos\/reem-1\/(completar|sin-reverso)$/.test(path)) {
        sim.llamadas.push({ method, path, body });
        sim.reembolsos = [];
        return responder(route, 201, {});
      }
      if (method === 'GET') return responder(route, 200, path === '/dashboard' ? { ventasDelDia: { total: 0 }, alertasStock: { items: [] }, cotizacionesPendientes: { cantidad: 0 } } : path === '/dashboard/pendientes' ? { indicadores: [] } : []);
      sim.inesperados.push(`${method} ${path}`);
      await route.abort();
    });
    await use(sim);
    expect(sim.errores, 'La interfaz no debe lanzar errores de JavaScript').toEqual([]);
    expect(sim.inesperados, 'No debe haber peticiones API no previstas').toEqual([]);
  }, { auto: true }],
});

async function abrir(page: Page) {
  await page.goto('/login');
  await page.locator('#login-correo').fill('usuario@prueba.invalid');
  await page.locator('#login-clave').fill('solo-para-esta-prueba');
  await page.getByRole('button', { name: 'INGRESAR AL SISTEMA' }).click();
  await page.waitForURL(url => !url.pathname.startsWith('/login'));
  await page.goto('/devoluciones');
  await expect(page.getByRole('heading', { name: 'Reembolsos', exact: true })).toBeVisible();
}

const tarjetaReembolso = (page: Page) => page.getByTestId('reembolso-reem-1');

test.describe('Devoluciones y reembolsos (simulado)', () => {
  test('cajero: solicita sin motivo; la condición se envía solo si se escribe; los destinos usan las etiquetas acordadas', async ({ page, sim }) => {
    await abrir(page);
    await page.getByLabel('Número del comprobante de venta').fill('12');
    await page.getByRole('button', { name: 'Buscar venta' }).click();
    const destino = page.getByLabel('Destino de Taladro');
    await expect(destino.locator('option')).toHaveText([/Reintegro al inventario/, /Baja \/ merma/, /Garantía/]);
    await expect(page.getByLabel('Motivo de la devolución (opcional)')).not.toHaveAttribute('required', /.*/);
    await page.getByLabel('Devolver Taladro').fill('1');
    await page.getByLabel('Condición de Taladro').fill('Caja abierta, sin uso');
    await page.getByRole('button', { name: 'Enviar solicitud de autorización' }).click();
    await expect.poll(() => sim.llamadas.length).toBe(1);
    const dto = sim.llamadas[0].body;
    expect(dto.motivo).toBeUndefined();
    expect(dto.items).toEqual([{ detalleId: 'det-1', cantidad: 1, destino: 'INVENTARIO', condicion: 'Caja abierta, sin uso' }]);
  });

  test('cajero: registra la referencia del reverso; no ve la decisión de tarjeta no revertida', async ({ page, sim }) => {
    await abrir(page);
    await expect(tarjetaReembolso(page)).toContainText('Reverso de tarjeta en el POS bancario');
    await expect(tarjetaReembolso(page).getByRole('button', { name: 'Reembolsar en efectivo' })).toHaveCount(0);
    await tarjetaReembolso(page).getByRole('button', { name: 'Registrar reverso realizado' }).click();
    await expect(page.getByText('Registra la referencia del reverso o de la transferencia.')).toBeVisible();
    expect(sim.llamadas).toEqual([]);
    await tarjetaReembolso(page).getByLabel('Referencia bancaria').fill('REV-778');
    await tarjetaReembolso(page).getByLabel('Evidencia (opcional)').fill('Voucher firmado');
    await tarjetaReembolso(page).getByRole('button', { name: 'Registrar reverso realizado' }).click();
    await expect.poll(() => sim.llamadas.length).toBe(1);
    expect(sim.llamadas[0]).toMatchObject({ path: '/operaciones/reembolsos/reem-1/completar', body: { referencia: 'REV-778', evidencia: 'Voucher firmado' } });
    await expect(page.getByText('No hay reembolsos pendientes.')).toBeVisible();
  });

  test('ADMIN: si la tarjeta no se revierte puede esperar, o reembolsar en efectivo tras confirmar', async ({ page, sim }) => {
    sim.rol = 'ADMIN';
    await abrir(page);
    await tarjetaReembolso(page).getByLabel('Motivo (opcional)').fill('Terminal sin conexión');
    await tarjetaReembolso(page).getByRole('button', { name: 'Reembolsar en efectivo' }).click();
    await page.locator('.ferre-alerta-confirmar').click();
    await expect.poll(() => sim.llamadas.length).toBe(1);
    expect(sim.llamadas[0]).toMatchObject({ path: '/operaciones/reembolsos/reem-1/sin-reverso', body: { decision: 'EFECTIVO', motivo: 'Terminal sin conexión' } });
  });
});
