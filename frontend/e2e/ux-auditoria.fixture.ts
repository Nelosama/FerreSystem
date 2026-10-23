import type { Page, Route } from '@playwright/test';

// Utilidades de la auditoría UX/UI: backend simulado con datos representativos y medición de contraste y
// desbordamiento en el navegador. Las usan la regresión visual (ux-ui-regresion.spec.ts) y la captura de evidencias
// (ux-auditoria-capturas.spec.ts). No contienen credenciales ni datos reales.

export type Rol = 'ADMIN' | 'CAJERO' | 'BODEGUERO' | 'VENDEDOR' | 'SUPERADMIN';

export const negocioDemo = {
  id: 'ux-negocio', nombreComercial: 'Ferretería El Roble', colorPrimario: '#EA580C', modoNavegacion: 'SIDEBAR', idioma: 'es',
};

const productos = Array.from({ length: 14 }, (_, i) => ({
  id: `p-${i}`, codigo: `HER-${String(i + 1).padStart(3, '0')}`, nombre: ['Martillo de uña 16 oz', 'Cinta métrica 5 m', 'Tornillo para madera 1"', 'Pintura látex blanca galón', 'Llave ajustable 10"', 'Brocha 3"'][i % 6] + (i > 5 ? ` ${i}` : ''),
  codigoBarras: String(7401000000100 + i), codigoFabricante: `FAB-${i}`, descripcion: null,
  categoria: { id: 'c1', nombre: 'Herramientas' }, categoriaId: 'c1', unidadMedida: 'UNIDAD', usaMedida: false,
  precioVenta: 85.5 + i * 12, precioCosto: 60 + i * 9, costoPromedio: 60 + i * 9, stockActual: i % 5 === 0 ? 1 : 24 - i, stockReservado: 0,
  stockDisponible: i % 5 === 0 ? 1 : 24 - i, stockFisico: 24 - i, stockMinimo: 3, activo: true, precioAprobado: i % 4 !== 0, imagenUrl: null, marca: 'Truper', version: 1,
}));

const usuarios = [
  { id: 'u-1', nombre: 'María López', email: 'maria@elroble.hn', rol: 'ADMIN', permisos: [], permisosConfigurados: false, descuentoMaximo: 100, activo: true },
  { id: 'u-2', nombre: 'Carlos Mejía', email: 'carlos@elroble.hn', rol: 'CAJERO', permisos: ['pos.vender', 'cotizaciones.crear'], permisosConfigurados: true, descuentoMaximo: 15, activo: true },
  { id: 'u-3', nombre: 'Ana Reyes', email: 'ana@elroble.hn', rol: 'BODEGUERO', permisos: [], permisosConfigurados: false, descuentoMaximo: 0, activo: false },
];

const negociosPlataforma = [
  { id: 'ux-negocio', nombreComercial: 'Ferretería El Roble', email: 'admin@elroble.hn', telefono: '9999-0000', plan: 'Plan Pro', estado: 'ACTIVO', cantidadUsuarios: 3, cantidadSucursales: 1, colorPrimario: '#EA580C', modoNavegacion: 'SIDEBAR', modulosHabilitados: null, usuarios: [{ id: 'a-1', nombre: 'María López', email: 'maria@elroble.hn', rol: 'ADMIN', activo: true, createdAt: '2026-10-01T00:00:00.000Z' }] },
  { id: 'ux-negocio-2', nombreComercial: 'Materiales Santa Rosa', email: 'admin@santarosa.hn', telefono: '', plan: 'Plan Básico', estado: 'SUSPENDIDO', cantidadUsuarios: 1, cantidadSucursales: 2, colorPrimario: '#0F766E', modoNavegacion: 'TOPNAV', modulosHabilitados: ['pos', 'inventario'], usuarios: [] },
];

/** Respuestas GET por ruta (sin el prefijo /api). Lo que no esté aquí recibe una lista vacía. */
function datos(rol: Rol, negocio: typeof negocioDemo) {
  return {
    '/tenant/settings': negocio,
    '/auth/me': { user: { sub: `ux-${rol}`, tenantId: negocio.id, rol, permisos: [], descuentoMaximo: 100, type: rol === 'SUPERADMIN' ? 'super_admin' : 'tenant' } },
    '/dashboard': { ventasDelDia: { total: 12450.75, cantidad: 18 }, alertasStock: { items: [{ id: 'p-0', nombre: 'Martillo de uña 16 oz', stockActual: 1, stockMinimo: 3 }] }, cotizacionesPendientes: { cantidad: 4 } },
    '/dashboard/pendientes': { indicadores: [
      { clave: 'contingencia_revision', cantidad: 0, ruta: '/contingencia-admin', alcance: 'NEGOCIO' },
      { clave: 'precios_pendientes', cantidad: 3, ruta: '/precios', alcance: 'NEGOCIO' },
      { clave: 'entregas_pendientes', cantidad: 2, ruta: '/entregas', alcance: 'NEGOCIO' },
      { clave: 'cotizaciones_vencen_hoy', cantidad: 1, ruta: '/cotizaciones', alcance: 'NEGOCIO' },
      { clave: 'stock_bajo_minimo', cantidad: 4, ruta: '/inventario', alcance: 'NEGOCIO' },
    ] },
    '/maintenance/backup': { configured: false },
    '/productos': productos,
    '/productos/comercial': productos,
    '/usuarios': usuarios,
    '/admin/tenants': negociosPlataforma,
    '/admin/dashboard': {},
    '/operaciones/caja': [{ id: 'caja-1', codigo: 'CAJA-1', estado: 'ABIERTA', usuario_id: `ux-${rol}`, monto_apertura: 500, efectivo_esperado: 500, totales: { EFECTIVO: 0, TARJETA: 0, TRANSFERENCIA: 0, CREDITO: 0 }, movimientos: [] }],
    '/clientes': { data: [{ id: 'cl-1', nombre: 'Constructora Valle', rtn: '08011999123456', telefono: '2222-3333', limiteCredito: 20000, saldoPendiente: 3500, activo: true }], total: 1, page: 1, limit: 20 },
  } as Record<string, unknown>;
}

export type RegistroSimulado = { escrituras: { metodo: string; ruta: string; cuerpo: any }[]; errores: string[] };

/**
 * Sesión simulada: guarda usuario/negocio en localStorage y responde la API desde `datos`.
 * Con `sinSesion` solo responde el arranque (para la pantalla de inicio de sesión). Devuelve las escrituras enviadas
 * (POST/PUT…) y los errores de JavaScript de la página.
 */
export async function prepararSesion(page: Page, rol: Rol, opciones: { negocio?: Partial<typeof negocioDemo> & Record<string, unknown>; sinSesion?: boolean; idioma?: 'es' | 'en' } = {}): Promise<RegistroSimulado> {
  const negocio = { ...negocioDemo, ...opciones.negocio, ...(opciones.idioma ? { idioma: opciones.idioma } : {}) };
  const user = { id: `ux-${rol}`, nombre: rol === 'SUPERADMIN' ? 'Soporte Jowa' : 'María López', email: 'maria@elroble.hn', rol, permisos: [], descuentoMaximo: 100 };
  const tenant = rol === 'SUPERADMIN' ? { id: 'saas-global', nombreComercial: 'Jowa System Admin Portal', colorPrimario: '#1C1917', modoNavegacion: 'SIDEBAR', idioma: negocio.idioma } : negocio;
  await page.addInitScript(({ user, tenant, sinSesion, idioma }) => {
    if (idioma) localStorage.setItem('ferre_language', idioma);
    if (sinSesion || localStorage.getItem('ferre_user')) return;
    localStorage.setItem('ferre_user', JSON.stringify(user));
    localStorage.setItem('ferre_tenant', JSON.stringify(tenant));
    localStorage.setItem('ferre_token', 'solo-prueba');
  }, { user, tenant, sinSesion: !!opciones.sinSesion, idioma: opciones.idioma ?? 'es' });
  const respuestas = datos(rol, negocio);
  const registro: RegistroSimulado = { escrituras: [], errores: [] };
  page.on('pageerror', error => registro.errores.push(error.message));
  await page.route('**/*', async (route: Route) => {
    const url = new URL(route.request().url());
    if (!url.pathname.startsWith('/api/')) {
      if (url.origin === 'http://127.0.0.1:4173') await route.continue(); else await route.abort();
      return;
    }
    const ruta = url.pathname.slice(4);
    if (/\/logo$/.test(ruta)) { await route.fulfill({ status: 404, json: {} }); return; }
    if (sinSesionRuta(opciones.sinSesion, ruta)) { await route.fulfill({ status: 401, json: { message: 'No autenticado' } }); return; }
    const metodo = route.request().method();
    if (metodo !== 'GET') {
      const cuerpo = route.request().postDataJSON?.() ?? null;
      registro.escrituras.push({ metodo, ruta, cuerpo });
      if (metodo === 'POST' && ruta === '/ventas') {
        await route.fulfill({ status: 201, json: { id: `v-${registro.escrituras.length}`, numeroVenta: registro.escrituras.length, subtotal: 0, isv: 0, descuento: 0, total: 0, metodoPago: cuerpo?.metodoPago, createdAt: new Date().toISOString(), detalles: [], estado: 'COMPLETADA' } });
        return;
      }
      if (metodo === 'PUT' && ruta.startsWith('/usuarios/')) { await route.fulfill({ json: { id: ruta.split('/').pop(), ...cuerpo } }); return; }
      await route.fulfill({ json: {} });
      return;
    }
    await route.fulfill({ json: respuestas[ruta] ?? [] });
  });
  return registro;
}

const sinSesionRuta = (sinSesion: boolean | undefined, ruta: string) => !!sinSesion && (ruta === '/auth/me' || ruta === '/auth/refresh');

export type HallazgoContraste = { texto: string; ruta: string; color: string; fondo: string; ratio: number; minimo: number; deshabilitado: boolean };

/**
 * Mide el contraste de cada texto visible contra el fondo efectivo (componiendo fondos semitransparentes y la
 * opacidad acumulada). Los colores se resuelven con un canvas, de modo que color-mix/oklch también se miden.
 * Devuelve los textos por debajo del mínimo WCAG 2.2 AA (4.5:1, o 3:1 para texto grande).
 */
export async function auditarContraste(page: Page, raiz = 'body'): Promise<HallazgoContraste[]> {
  return page.evaluate((selectorRaiz) => {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1;
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    const rgba = (c: string): [number, number, number, number] => {
      if (!c || c === 'transparent') return [0, 0, 0, 0];
      ctx.clearRect(0, 0, 1, 1); ctx.fillStyle = '#000'; ctx.fillStyle = c; ctx.fillRect(0, 0, 1, 1);
      const d = ctx.getImageData(0, 0, 1, 1).data; return [d[0], d[1], d[2], d[3] / 255];
    };
    const sobre = (a: number[], b: number[]) => [0, 1, 2].map(i => a[i] * a[3] + b[i] * (1 - a[3])).concat(1);
    const lum = (c: number[]) => { const [r, g, b] = c.slice(0, 3).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
    const ratio = (a: number[], b: number[]) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };
    const fondo = (el: Element): number[] | null => {
      const capas: number[][] = [];
      for (let n: Element | null = el; n; n = n.parentElement) {
        const cs = getComputedStyle(n);
        if (cs.backgroundImage !== 'none' && !cs.backgroundImage.startsWith('url(')) return null;
        const c = rgba(cs.backgroundColor);
        if (c[3] > 0) capas.push(c);
        if (c[3] >= 1) break;
      }
      return capas.reverse().reduce((acc, capa) => sobre(capa, acc), [255, 255, 255, 1]);
    };
    const opacidad = (el: Element) => { let o = 1; for (let n: Element | null = el; n; n = n.parentElement) o *= Number(getComputedStyle(n).opacity); return o; };
    const hallazgos: { texto: string; ruta: string; color: string; fondo: string; ratio: number; minimo: number; deshabilitado: boolean }[] = [];
    const raiz = document.querySelector(selectorRaiz); if (!raiz) return hallazgos;
    const candidatos = [raiz, ...raiz.querySelectorAll('*')].filter(el => {
      if (['INPUT', 'SELECT', 'TEXTAREA'].includes(el.tagName)) return (el as HTMLInputElement).type !== 'hidden' && !!(el as HTMLInputElement).value && !['checkbox', 'radio', 'color', 'range', 'file'].includes((el as HTMLInputElement).type);
      return [...el.childNodes].some(n => n.nodeType === 3 && n.textContent!.trim());
    });
    for (const el of candidatos) {
      if (!(el as HTMLElement).checkVisibility?.({ opacityProperty: true, visibilityProperty: true })) continue;
      if (el.closest('[aria-hidden="true"]')) continue;
      const r = el.getBoundingClientRect(); if (r.width < 1 || r.height < 1) continue;
      const cs = getComputedStyle(el);
      const bg = fondo(el); if (!bg) continue;
      const fg = rgba(cs.color); fg[3] *= opacidad(el);
      const final = sobre(fg, bg);
      const tam = parseFloat(cs.fontSize); const peso = Number(cs.fontWeight) || 400;
      const grande = tam >= 24 || (tam >= 18.66 && peso >= 700);
      const minimo = grande ? 3 : 4.5;
      const valor = ratio(final, bg);
      const deshabilitado = !!el.closest(':disabled, [aria-disabled="true"]');
      if (valor + 0.005 < minimo) {
        const texto = (['INPUT', 'SELECT', 'TEXTAREA'].includes(el.tagName) ? (el as HTMLInputElement).value : [...el.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent).join(' ')).trim().slice(0, 60);
        const ruta: string[] = []; for (let n: Element | null = el; n && n !== document.body && ruta.length < 4; n = n.parentElement) ruta.unshift(n.tagName.toLowerCase() + (n.classList.length ? '.' + [...n.classList].slice(0, 2).join('.') : ''));
        hallazgos.push({ texto, ruta: ruta.join(' > '), color: `rgb(${final.slice(0, 3).map(Math.round).join(',')})`, fondo: `rgb(${bg.slice(0, 3).map(Math.round).join(',')})`, ratio: Math.round(valor * 100) / 100, minimo, deshabilitado });
      }
    }
    return hallazgos;
  }, raiz);
}

/** Ancho de desplazamiento horizontal de la página por encima del viewport (0 = sin scroll horizontal). */
export async function desbordamientoHorizontal(page: Page): Promise<number> {
  return page.evaluate(() => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - window.innerWidth);
}
