import { readFileSync } from 'node:fs';
import type { Page, Route } from '@playwright/test';

// CSP y cabeceras de vercel.json en Chromium real. El servidor de vista previa de Vite no aplica vercel.json:
// aquí cada respuesta de la app (HTML, JS, CSS, sw.js, manifiesto) recibe exactamente las cabeceras de la regla
// "/(.*)". La API está simulada en /api; en producción es otro origen HTTPS, permitido por connect-src https:.
// Las pruebas fallan ante cualquier violación de la CSP. No sustituyen la comprobación en el despliegue real ni en Safari.

export const vercel = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
export const cabeceras: Record<string, string> = Object.fromEntries(
  vercel.headers.filter((r: any) => r.source === '/(.*)').flatMap((r: any) => r.headers.map((h: any) => [h.key.toLowerCase(), h.value])),
);
const tenant = { id: 'tenant-csp-e2e', nombreComercial: 'Ferretería de prueba', colorPrimario: '#EA580C', formatoImpresion: 'TICKET_80MM' };
const admin = { id: 'user-ADMIN', nombre: 'Admin de prueba', email: 'usuario@prueba.invalid', rol: 'ADMIN' };
const producto = { id: 'prod-1', codigo: 'TAL-1', nombre: 'Taladro', codigoBarras: '7501031311309', codigoFabricante: null, descripcion: null,
  categoria: { id: 'c1', nombre: 'Herramientas' }, categoriaId: 'c1', unidadMedida: 'UNIDAD', usaMedida: false, precioVenta: 100, precioCosto: 60,
  margen: null, precioAprobado: true, stockActual: 10, stockReservado: 0, stockDisponible: 10, stockFisico: 10, stockMinimo: 1, activo: true, imagenUrl: null, marca: null, version: 1 };

export async function preparar(page: Page, baseURL: string | undefined) {
  const origen = new URL(baseURL!).origin;
  const violaciones: string[] = [];
  await page.addInitScript(() => {
    (window as any).__csp = [];
    document.addEventListener('securitypolicyviolation', (e) => (window as any).__csp.push(`${e.violatedDirective} ${e.blockedURI}`));
  });
  page.on('console', m => { if (/Content Security Policy|Refused to/i.test(m.text())) violaciones.push(m.text()); });
  page.on('pageerror', e => violaciones.push(`pageerror: ${e.message}`));
  await page.route('**/*', async (route: Route) => {
    const url = new URL(route.request().url());
    const responder = (body: unknown, status = 200) => route.fulfill({ status, json: body });
    if (url.origin === origen && url.pathname.startsWith('/api/')) {
      const path = url.pathname.slice(4);
      const method = route.request().method();
      if (path === '/tenant/settings') return responder(tenant);
      if (path === '/auth/me') return responder({ user: { sub: admin.id, tenantId: tenant.id, rol: 'ADMIN', permisos: [], descuentoMaximo: 100 } });
      if (path === '/auth/login') return responder({ type: 'tenant', accessToken: 'csp-token', user: admin, tenant });
      if (path === '/productos/comercial' || path === '/productos') return responder([producto]);
      if (path === '/operaciones/caja') return responder([{ id: 'caja-1', codigo: 'CAJA-1', estado: 'ABIERTA', usuario_id: admin.id, monto_apertura: 500, efectivo_esperado: 500, totales: { EFECTIVO: 0, TARJETA: 0, TRANSFERENCIA: 0, CREDITO: 0 }, movimientos: [] }]);
      if (method === 'POST' && path === '/ventas') {
        const body = route.request().postDataJSON();
        return responder({ id: 'v-1', numeroVenta: 1, subtotal: 100, isv: 15, descuento: 0, total: 115, metodoPago: body.metodoPago, createdAt: new Date().toISOString(),
          detalles: [{ productoId: 'prod-1', productoNombre: 'Taladro', productoCodigo: 'TAL-1', cantidad: 1, precioUnitario: 100 }], estado: 'COMPLETADA' }, 201);
      }
      return responder(method === 'GET' ? [] : {});
    }
    if (url.origin !== origen) return route.fulfill({ status: 204, body: '' }); // fuentes externas: sin red en la prueba
    const respuesta = await route.fetch();
    await route.fulfill({ response: respuesta, headers: { ...respuesta.headers(), ...cabeceras } });
  });
  return async () => [...violaciones, ...(await page.evaluate(() => (window as any).__csp as string[]).catch(() => [] as string[]))];
}

export async function ingresar(page: Page) {
  await page.goto('/login');
  await page.locator('input[type="email"]').fill('usuario@prueba.invalid');
  await page.locator('input[type="password"]').fill('solo-para-esta-prueba');
  await page.getByRole('button', { name: 'INGRESAR AL SISTEMA' }).click();
  await page.waitForURL(u => !u.pathname.startsWith('/login'));
}

