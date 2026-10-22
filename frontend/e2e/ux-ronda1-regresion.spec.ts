import { test, expect, type Page } from '@playwright/test';
import { prepararSesion, auditarContraste, desbordamientoHorizontal } from './ux-auditoria.fixture';

// Regresión de la ronda UX 1 (PR #188), con backend simulado. Cubre los defectos confirmados: marca en el login,
// texto SAR retirado, permisos legibles y usables en móvil, método de pago visible, contraste con colores de marca
// claros y oscuros, navegación móvil y TOPNAV, y el cobro completo sin cambiar lo que se envía al servidor.

const sinFallos = async (page: Page, raiz = 'body') => {
  const fallos = (await auditarContraste(page, raiz)).filter(f => !f.deshabilitado);
  expect(fallos, JSON.stringify(fallos, null, 1)).toEqual([]);
};

test.describe('Inicio de sesión', () => {
  for (const ancho of [1440, 390, 320]) {
    test(`muestra «Jowa System» completo, sin el texto SAR y sin desbordar @${ancho}`, async ({ page }) => {
      await page.setViewportSize({ width: ancho, height: 800 });
      await prepararSesion(page, 'ADMIN', { sinSesion: true });
      await page.goto('/login');
      await expect(page.getByRole('heading', { level: 1, name: 'Jowa System', exact: true })).toBeVisible();
      const cuerpo = await page.locator('body').innerText();
      expect(cuerpo).not.toMatch(/SAR Compliance|Multi-Tenant|Honduras •/);
      // «Jowa» y «System» se leen sobre el fondo de la tarjeta (antes «Jowa» era blanco sobre blanco).
      await sinFallos(page);
      expect(await desbordamientoHorizontal(page)).toBeLessThanOrEqual(0);
      await expect(page.getByLabel('Correo electrónico')).toHaveAttribute('type', 'email');
      await expect(page.getByLabel('Contraseña')).toHaveAttribute('type', 'password');
      await expect(page.getByRole('button', { name: 'Ingresar al sistema' })).toBeVisible();
    });
  }

  test('la sesión expirada se anuncia como aviso informativo, no como error', async ({ page }) => {
    // Sesión guardada que el servidor ya no acepta (401 en /auth/me y /auth/refresh): vuelve al login con el aviso.
    await prepararSesion(page, 'ADMIN', { sinSesion: true });
    await page.addInitScript(() => {
      if (sessionStorage.getItem('ux-sembrado')) return;
      sessionStorage.setItem('ux-sembrado', '1');
      localStorage.setItem('ferre_user', JSON.stringify({ id: 'ux-ADMIN', nombre: 'María López', rol: 'ADMIN', permisos: [] }));
      localStorage.setItem('ferre_tenant', JSON.stringify({ id: 'ux-negocio', nombreComercial: 'Ferretería El Roble' }));
      localStorage.setItem('ferre_token', 'vencido');
    });
    await page.goto('/');
    await page.waitForURL(url => url.pathname.startsWith('/login'));
    await expect(page.getByRole('status').filter({ hasText: 'sesión ha expirado' })).toBeVisible();
    await expect(page.getByRole('alert').filter({ hasText: 'sesión ha expirado' })).toHaveCount(0);
    await sinFallos(page);
  });
});

async function abrirEdicion(page: Page, indice: number) {
  await page.goto('/usuarios');
  await page.getByRole('button', { name: /editar/i }).nth(indice).click();
  const dialogo = page.getByRole('dialog', { name: /editar usuario/i });
  await expect(dialogo).toBeVisible();
  return dialogo;
}

test.describe('Usuarios: personalización fina de permisos', () => {
  test('permisos legibles (AA), casillas con nombre y uso con teclado; el envío no cambia de forma', async ({ page }) => {
    const sim = await prepararSesion(page, 'ADMIN');
    const dialogo = await abrirEdicion(page, 1); // Carlos Mejía, CAJERO con permisos configurados
    await sinFallos(page, '[role="dialog"]');
    const vender = dialogo.getByRole('checkbox', { name: /Realizar ventas en POS/ });
    const descuentos = dialogo.getByRole('checkbox', { name: /Aplicar descuentos/ });
    await expect(vender).toBeChecked();
    await expect(descuentos).not.toBeChecked();
    await expect(dialogo.getByText('2 de 11 activos')).toBeVisible();
    await descuentos.focus();
    await page.keyboard.press('Space');
    await expect(descuentos).toBeChecked();
    await expect(dialogo.getByText('3 de 11 activos')).toBeVisible();
    // Activo y disponible se distinguen también sin color: fondo y borde distintos.
    const estilo = (nombre: RegExp) => dialogo.locator('label.permiso-opcion', { hasText: nombre }).evaluate(el => { const c = getComputedStyle(el); return `${c.backgroundColor}|${c.borderColor}|${c.boxShadow}`; });
    expect(await estilo(/Realizar ventas/)).not.toEqual(await estilo(/Ver reportes/));
    await dialogo.getByRole('button', { name: /guardar usuario/i }).click();
    await expect.poll(() => sim.escrituras.filter(e => e.metodo === 'PUT').length).toBe(1);
    const put = sim.escrituras.find(e => e.metodo === 'PUT')!;
    expect(put.ruta).toBe('/usuarios/u-2');
    expect(put.cuerpo).toMatchObject({ rol: 'CAJERO', permisos: ['pos.vender', 'cotizaciones.crear', 'pos.aplicar_descuento'] });
    expect(sim.errores).toEqual([]);
  });

  test('con rol ADMIN los permisos aparecen incluidos y bloqueados, distinguibles y legibles', async ({ page }) => {
    await prepararSesion(page, 'ADMIN');
    const dialogo = await abrirEdicion(page, 0); // María López, ADMIN
    const casillas = dialogo.getByRole('checkbox');
    await expect(casillas).toHaveCount(11);
    for (const casilla of await casillas.all()) { await expect(casilla).toBeDisabled(); await expect(casilla).toBeChecked(); }
    await expect(dialogo.getByText('Incluido por el rol').first()).toBeVisible();
    await expect(dialogo.getByText(/El rol Administrador incluye todos los permisos/)).toBeVisible();
    // Bloqueado sigue siendo legible: el contraste de su texto se mide igual que el de los controles activos.
    const fallos = await auditarContraste(page, '.permisos-matriz');
    expect(fallos, JSON.stringify(fallos, null, 1)).toEqual([]);
    const bloqueado = await dialogo.locator('label.permiso-opcion').first().evaluate(el => getComputedStyle(el).borderStyle);
    expect(bloqueado).toBe('dashed');
  });

  for (const ancho of [390, 320]) {
    test(`el modal se usa en móvil: sin desbordar y con Guardar siempre visible @${ancho}`, async ({ page }) => {
      await page.setViewportSize({ width: ancho, height: 700 });
      await prepararSesion(page, 'ADMIN');
      const dialogo = await abrirEdicion(page, 1);
      expect(await desbordamientoHorizontal(page)).toBeLessThanOrEqual(0);
      const caja = await dialogo.boundingBox();
      expect(caja!.width).toBeLessThanOrEqual(ancho);
      const guardar = dialogo.getByRole('button', { name: /guardar usuario/i });
      await expect(guardar).toBeInViewport();
      // La navegación inferior no tapa las acciones del modal.
      expect(await guardar.evaluate(b => { const r = b.getBoundingClientRect(); return document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)?.closest('button') === b; })).toBe(true);
      await dialogo.getByRole('checkbox', { name: /Configuración del negocio|Editar configuración/ }).scrollIntoViewIfNeeded();
      await expect(guardar).toBeInViewport();
      await page.keyboard.press('Escape');
      await expect(dialogo).toHaveCount(0);
    });
  }
});

test.describe('POS: método de pago, colores de marca y cobro', () => {
  for (const color of ['#EA580C', '#F5C400', '#1D4ED8', '#16A34A', '#FFFFFF']) {
    test(`texto legible en botones, totales, menú y selección con la marca ${color}`, async ({ page }) => {
      await prepararSesion(page, 'ADMIN', { negocio: { colorPrimario: color } });
      await page.goto('/pos');
      await page.locator('.ferre-pos-catalog .pos-producto').first().click();
      await expect(page.getByRole('button', { name: 'Efectivo', exact: true })).toHaveAttribute('aria-pressed', 'true');
      await sinFallos(page);
    });
  }

  test('el método seleccionado se anuncia y se distingue; los demás quedan disponibles', async ({ page }) => {
    await prepararSesion(page, 'ADMIN');
    await page.goto('/pos');
    await page.locator('.ferre-pos-catalog .pos-producto').first().click();
    for (const metodo of ['Tarjeta', 'Transferencia', 'Efectivo']) {
      const boton = page.getByRole('button', { name: metodo, exact: true });
      await boton.click();
      await expect(boton).toHaveAttribute('aria-pressed', 'true');
      await expect(page.locator('.pos-metodo[aria-pressed="true"]')).toHaveCount(1);
      const [elegido, otro] = await Promise.all([boton, page.locator('.pos-metodo[aria-pressed="false"]').first()].map(b => b.evaluate(el => getComputedStyle(el).backgroundColor)));
      expect(elegido).not.toEqual(otro);
    }
  });

  test('F2 enfoca la búsqueda y F8 lleva a Procesar Venta sin registrar nada; Enter confirma el cobro completo', async ({ page }) => {
    const sim = await prepararSesion(page, 'ADMIN');
    await page.goto('/pos');
    await page.locator('.ferre-pos-catalog .pos-producto').nth(1).click(); // Cinta métrica 5 m, L. 97.50
    await page.keyboard.press('F2');
    await expect(page.getByRole('textbox', { name: /buscar producto/i })).toBeFocused();
    await page.keyboard.press('F8');
    const cobrar = page.getByRole('button', { name: /Procesar Venta/ });
    await expect(cobrar).toBeFocused();
    await expect(cobrar).toBeInViewport();
    expect(sim.escrituras.filter(e => e.ruta === '/ventas')).toEqual([]);
    // Total identificable junto al botón, con el mismo importe que el botón.
    await expect(page.locator('.pos-ticket-pie')).toContainText('L. 112.13');
    await expect(cobrar).toContainText('L. 112.13');
    await page.keyboard.press('Enter');
    await expect.poll(() => sim.escrituras.filter(e => e.metodo === 'POST' && e.ruta === '/ventas').length).toBe(1);
    const venta = sim.escrituras.find(e => e.ruta === '/ventas')!.cuerpo;
    expect(venta).toMatchObject({ metodoPago: 'EFECTIVO', clienteNombre: 'Consumidor Final', detalles: [{ productoId: 'p-1', cantidad: 1, precioUnitario: 97.5 }] });
    expect(venta.clienteId).toBeUndefined();
    expect(sim.errores).toEqual([]);
  });

  test('crédito abre el cliente: exige un cliente registrado antes de cobrar', async ({ page }) => {
    const sim = await prepararSesion(page, 'ADMIN');
    await page.goto('/pos');
    await expect(page.getByRole('searchbox', { name: 'Buscar cliente existente' })).toHaveCount(0);
    await page.locator('.ferre-pos-catalog .pos-producto').first().click();
    await page.getByRole('button', { name: 'Crédito', exact: true }).click();
    await expect(page.getByRole('searchbox', { name: 'Buscar cliente existente' })).toBeVisible();
    await page.getByRole('button', { name: /Procesar Venta/ }).click();
    await expect(page.getByText('Seleccione un cliente registrado para vender a crédito')).toBeVisible();
    expect(sim.escrituras.filter(e => e.ruta === '/ventas')).toEqual([]);
  });

  test('en teléfono el total y «Ir a cobrar» quedan a la vista y el pie del ticket es alcanzable', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await prepararSesion(page, 'ADMIN');
    await page.goto('/pos');
    await page.locator('.ferre-pos-catalog .pos-producto').first().click();
    const barra = page.locator('.pos-barra-movil');
    await expect(barra).toBeInViewport();
    await expect(barra).toContainText('L. 98.33');
    await barra.getByRole('button').click();
    await expect(page.getByRole('button', { name: /Procesar Venta/ })).toBeInViewport();
    expect(await desbordamientoHorizontal(page)).toBeLessThanOrEqual(0);
  });
});

test.describe('Navegación', () => {
  test('TOPNAV muestra la conexión, no duplica enlaces y agrupa en «Más» por debajo de 1200 px', async ({ page }) => {
    await prepararSesion(page, 'ADMIN', { negocio: { modoNavegacion: 'TOPNAV' } });
    for (const ancho of [1440, 1024]) {
      await page.setViewportSize({ width: ancho, height: 800 });
      await page.goto('/');
      const barra = page.locator('header.app-top-navigation');
      await expect(barra.locator('.jowa-connection')).toContainText('En línea');
      // El logotipo también enlaza a Inicio (como en main); la barra de módulos no repite ningún destino.
      const enlaces = await barra.locator('nav a[href]').evaluateAll(as => as.map(a => a.getAttribute('href')));
      expect(enlaces.length, 'cada destino una sola vez').toBe(new Set(enlaces).size);
      expect(await desbordamientoHorizontal(page)).toBeLessThanOrEqual(0);
      const usuarios = barra.locator('a[href="/usuarios"]');
      if (ancho < 1200) {
        await expect(usuarios).toBeHidden();
        await barra.getByRole('button', { name: /más|More/i }).or(barra.locator('summary[aria-label]').last()).last().click();
        await expect(usuarios).toBeVisible();
      } else {
        await expect(usuarios).toBeVisible();
      }
      await sinFallos(page, 'header.app-top-navigation');
    }
  });

  test('inicio en móvil: cabecera sin cortes, pestañas de 12 px sin «…» y el botón flotante no tapa el final', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await prepararSesion(page, 'ADMIN');
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Pendientes de hoy' })).toBeVisible();
    expect(await desbordamientoHorizontal(page)).toBeLessThanOrEqual(0);
    await expect(page.getByRole('button', { name: /salir/i })).toBeInViewport({ ratio: 1 });
    const pestañas = page.locator('.mobile-bottom-nav :is(a, button) > span');
    for (const p of await pestañas.all()) {
      const medida = await p.evaluate(el => ({ tam: parseFloat(getComputedStyle(el).fontSize), recortada: el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1, texto: el.textContent }));
      expect(medida.tam, medida.texto!).toBeGreaterThanOrEqual(12);
      expect(medida.recortada, `pestaña recortada: ${medida.texto}`).toBe(false);
    }
    await expect(page.locator('.mobile-bottom-nav a[aria-current="page"]')).toHaveCount(1);
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    const ultima = await page.locator('.admin-home__main > *').last().boundingBox();
    const flotante = await page.locator('.admin-home__flotante').boundingBox();
    expect(ultima!.y + ultima!.height, 'el último bloque termina por encima del botón flotante').toBeLessThanOrEqual(flotante!.y);
    await sinFallos(page);
  });

  test('la navegación inferior abre «Más» y se cierra con Escape', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await prepararSesion(page, 'ADMIN');
    await page.goto('/');
    await page.getByRole('button', { name: 'Más opciones' }).click();
    const dialogo = page.getByRole('dialog', { name: 'Más opciones' });
    await expect(dialogo).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialogo).toHaveCount(0);
  });
});

test('Super Admin: la marca de un negocio sin color guardado no rompe la pantalla', async ({ page }) => {
  const sim = await prepararSesion(page, 'SUPERADMIN');
  await page.route('**/api/admin/tenants/ux-negocio/settings', route => route.fulfill({ json: { id: 'ux-negocio', nombreComercial: 'Ferretería El Roble', configuracion: {}, modulosHabilitados: [] } }));
  await page.goto('/admin/negocios/ux-negocio/marca');
  await expect(page.locator('aside.jowa-platform-sidebar .jowa-platform-context')).toBeVisible();
  expect(sim.errores).toEqual([]);
  await page.goto('/admin');
  await sinFallos(page);
});
