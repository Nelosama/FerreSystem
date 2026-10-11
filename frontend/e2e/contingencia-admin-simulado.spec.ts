import { expect, test as base, type Page, type Route } from '@playwright/test';

// E2E CON BACKEND SIMULADO para la pantalla de administración de contingencia (R-02, opción B aprobada).
// Comprueba el comportamiento de la interfaz: el cierre sin venta NO envía caja, el bloque de regularización excepcional aparece
// solo cuando el servidor responde CAJA_CERRADA_REQUIERE_REGULARIZACION y un motivo menor de 20 caracteres no se envía.
// NO prueba persistencia ni la regla de caja del servidor: eso está en backend/test/contingencia.postgres.integration.ts (PostgreSQL real).

const tenant = { id: 'tenant-cont-admin', nombreComercial: 'Ferretería de contingencia', colorPrimario: '#EA580C' };
const admin = { id: 'admin-sim', nombre: 'Administrador de prueba', email: 'admin@prueba.invalid', rol: 'ADMIN' };
const OPERACION_ID = '00000000-0000-4000-8000-0000000000a1';

type Resolver = { accion: string; nota: string; cajaId?: string; regularizarCajaCerrada?: boolean; motivoRegularizacion?: string };
type Sim = { resoluciones: Resolver[]; errores: string[] };

const operacion = {
  operacionId: OPERACION_ID, estado: 'RECHAZADA', requiereRevision: true,
  conflictos: [{ codigo: 'IMPORTE_INVALIDO', detalle: {} }],
  correlativoLocal: 'CT-01-0001', correlativoDefinitivo: null, numeroVenta: null, cajero: 'Cajero de prueba', dispositivo: '01',
  totalCentavos: 2300, efectivoRecibidoCentavos: 2000, cambioCentavos: 0, faltanteCentavos: 300,
  ocurridoAt: new Date().toISOString(), recibidoAt: new Date().toISOString(), referenciaFacturaExterna: null, inventarioPendiente: [],
};
const bloque = { cantidad: 0, totalCentavos: 0, efectivoCentavos: 0 };
const resumen = {
  fecha: '2026-10-11', generadoAt: new Date().toISOString(), aviso: null, ventasDelDia: [],
  contingencia: {
    sincronizadas: bloque, sincronizadasConRevision: bloque, conflictos: { cantidad: 1, totalCentavos: 2300, efectivoCentavos: 2000 },
    resueltasManual: bloque, pendientesReportadosPorCajas: 0,
  },
  dispositivos: [],
};

const test = base.extend<{ sim: Sim }>({
  sim: [async ({ page, baseURL }, use) => {
    const sim: Sim = { resoluciones: [], errores: [] };
    const origen = new URL(baseURL!).origin;
    const cabeceras = { 'access-control-allow-origin': origen, 'access-control-allow-credentials': 'true' };
    page.on('pageerror', (e) => sim.errores.push(e.message));
    const responder = (route: Route, status: number, body: unknown) => route.fulfill({ status, json: body, headers: cabeceras });

    await page.route('**/*', async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      if (!url.pathname.startsWith('/api/')) { if (url.origin === origen) await route.continue(); else await route.abort(); return; }
      const method = request.method();
      const path = url.pathname.replace(/^\/api/, '');
      if (method === 'OPTIONS') { await route.fulfill({ status: 204, headers: { ...cabeceras, 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } }); return; }
      if (method === 'GET' && path === '/tenant/settings') return responder(route, 200, { ...tenant, modoNavegacion: 'SIDEBAR' });
      if (method === 'GET' && path === '/auth/me') return responder(route, 200, { user: { sub: admin.id, tenantId: tenant.id, rol: admin.rol, permisos: [], permisosConfigurados: false, descuentoMaximo: 0, nombre: admin.nombre } });
      if (method === 'POST' && path === '/auth/login') return responder(route, 200, { type: 'tenant', accessToken: 'cont-admin-token', user: admin, tenant });
      if (method === 'GET' && path === '/contingencia/configuracion') return responder(route, 200, { habilitada: true, entornoHabilitado: true });
      if (method === 'GET' && path === '/contingencia/resumen') return responder(route, 200, resumen);
      if (method === 'GET' && path === '/contingencia/operaciones') return responder(route, 200, [operacion]);
      if (method === 'GET' && path === '/operaciones/caja/cierres') return responder(route, 200, []);
      if (method === 'POST' && path === `/contingencia/operaciones/${OPERACION_ID}/resolver`) {
        const cuerpo = request.postDataJSON() as Resolver;
        sim.resoluciones.push(cuerpo);
        // El servidor exige la regularización mientras la caja del cajero esté cerrada y la petición no la traiga.
        if (!cuerpo.regularizarCajaCerrada) {
          return responder(route, 409, {
            statusCode: 409, code: 'CAJA_CERRADA_REQUIERE_REGULARIZACION',
            message: 'La caja del cajero que cobró está cerrada. El efectivo no se traslada a otra caja: un administrador debe autorizar una regularización excepcional indicando su motivo',
          });
        }
        return responder(route, 201, { operacionId: OPERACION_ID, estado: 'RESUELTA_MANUAL' });
      }
      if (method === 'GET') return responder(route, 200, []);
      return responder(route, 200, {});
    });
    await use(sim);
  }, { auto: true }],
});

async function ingresarYAbrirAdministracion(page: Page) {
  await page.goto('/login');
  await page.locator('input[type="email"]').fill(admin.email);
  await page.locator('input[type="password"]').fill('clave-de-prueba');
  await page.getByRole('button', { name: 'INGRESAR AL SISTEMA' }).click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'));
  await page.goto('/contingencia-admin');
  await expect(page.getByRole('button', { name: /Cerrar sin venta y registrar el efectivo en caja/ })).toBeVisible();
}

test('cierre sin venta: no envía caja, la regularización aparece solo tras el 409 y un motivo corto no se envía', async ({ page, sim }) => {
  await ingresarYAbrirAdministracion(page);
  const cerrar = page.getByRole('button', { name: /Cerrar sin venta y registrar el efectivo en caja/ });

  // Antes de cualquier respuesta del servidor el bloque de regularización no existe.
  await expect(page.getByLabel(/regularización excepcional/)).toHaveCount(0);
  await page.getByLabel(/Nota de la decisión/).fill('Cobro insuficiente verificado con el cliente');
  await cerrar.click();

  // 1) Primer envío: sin caja y sin regularización. El servidor responde 409 y recién entonces aparece el bloque.
  await expect.poll(() => sim.resoluciones.length).toBe(1);
  expect(sim.resoluciones[0]).toMatchObject({ accion: 'CERRAR_MANUAL' });
  expect(sim.resoluciones[0]).not.toHaveProperty('cajaId');
  expect(sim.resoluciones[0]).not.toHaveProperty('regularizarCajaCerrada');
  const motivo = page.getByLabel(/regularización excepcional/);
  await expect(motivo).toBeVisible();
  await expect(page.getByRole('alert').or(page.getByText(/está cerrada/)).first()).toBeVisible();

  // 2) Motivo de menos de 20 caracteres: la pantalla no envía la regularización.
  await motivo.fill('muy corto');
  await cerrar.click();
  await expect.poll(() => sim.resoluciones.length).toBe(2);
  expect(sim.resoluciones[1]).not.toHaveProperty('regularizarCajaCerrada');
  expect(sim.resoluciones[1]).not.toHaveProperty('motivoRegularizacion');
  expect(sim.resoluciones[1]).not.toHaveProperty('cajaId');

  // 3) Motivo suficiente: se envía la regularización con el motivo recortado y todavía sin caja.
  const texto = 'Cobro verificado; la caja cerró con el efectivo en el cajón';
  await motivo.fill(`  ${texto}  `);
  await cerrar.click();
  await expect.poll(() => sim.resoluciones.length).toBe(3);
  expect(sim.resoluciones[2]).toMatchObject({ accion: 'CERRAR_MANUAL', regularizarCajaCerrada: true, motivoRegularizacion: texto });
  expect(sim.resoluciones[2]).not.toHaveProperty('cajaId');
  await expect(page.getByText('Decisión registrada y auditada.')).toBeVisible();
  expect(sim.errores).toEqual([]);
});
