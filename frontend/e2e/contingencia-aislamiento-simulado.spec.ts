import { expect, test as base, type Page, type Route } from '@playwright/test';

// P1-2, P1-3 y P1-4 (docs/AUDITORIA_OFFLINE_ALMACENAMIENTO_20261104.md) con backend simulado:
// - recuperación de la contingencia ante 502/503 solo con identidad validada, ventana vigente y misma empresa/usuario;
// - 401, 403 y otros errores nunca habilitan la contingencia;
// - aislamiento del diario local entre dos empresas y varios roles en el mismo navegador.

type Identidad = { id: string; nombre: string; email: string; rol: string; tenant: { id: string; nombreComercial: string } };
const EMPRESA_A = { id: 'tenant-a', nombreComercial: 'Ferretería A' };
const EMPRESA_B = { id: 'tenant-b', nombreComercial: 'Ferretería B' };
const ID: Record<string, Identidad> = {
  cajeroA1: { id: 'cajero-a1', nombre: 'Ana A1', email: 'a1@a.invalid', rol: 'CAJERO', tenant: EMPRESA_A },
  cajeroA2: { id: 'cajero-a2', nombre: 'Beto A2', email: 'a2@a.invalid', rol: 'CAJERO', tenant: EMPRESA_A },
  adminA: { id: 'admin-a', nombre: 'Admin A', email: 'admin@a.invalid', rol: 'ADMIN', tenant: EMPRESA_A },
  vendedorA: { id: 'vendedor-a', nombre: 'Vera Vendedora', email: 'vend@a.invalid', rol: 'VENDEDOR', tenant: EMPRESA_A },
  cajeroB1: { id: 'cajero-b1', nombre: 'Caro B1', email: 'b1@b.invalid', rol: 'CAJERO', tenant: EMPRESA_B },
  adminB: { id: 'admin-b', nombre: 'Admin B', email: 'admin@b.invalid', rol: 'ADMIN', tenant: EMPRESA_B },
};
const producto = { id: 'prod-1', codigo: 'TOR-1', nombre: 'Tornillo 2 pulgadas', codigoBarras: null, precioCentavos: 1000,
  libreCentesimas: 4000, cupoCentesimas: 2000, usaMedida: false, unidadMedida: 'UNIDAD' };
const EMITIDAS = Array.from({ length: 500 }, (_, i) => `00000000-0000-4000-8000-${(i + 1).toString(16).padStart(12, '0')}`);
const VIGENTE = () => new Date(Date.now() + 30 * 3_600_000).toISOString();

type Sim = { fallosRegistro?: number; registrados: Set<string>; caida?: number; recibidas: string[]; cuerpos: Record<string, unknown>[] };
const test = base.extend<{ sim: Sim }>({
  sim: [async ({ page, baseURL }, use) => {
    const sim: Sim = { registrados: new Set(), recibidas: [], cuerpos: [] };
    const origen = new URL(baseURL!).origin;
    const cabeceras = { 'access-control-allow-origin': origen, 'access-control-allow-credentials': 'true' };
    const responder = (route: Route, status: number, body: unknown) => route.fulfill({ status, json: body, headers: cabeceras });
    const quien = (route: Route) => Object.values(ID).find((i) => route.request().headers()['authorization'] === `Bearer tok-${i.id}`);
    await page.route('**/*', async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      if (!url.pathname.startsWith('/api/')) { if (url.origin === origen) await route.continue(); else await route.abort(); return; }
      const method = request.method();
      const path = url.pathname.slice(4);
      if (method === 'OPTIONS') { await route.fulfill({ status: 204, headers: { ...cabeceras, 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } }); return; }
      if (method === 'POST' && path === '/auth/login') {
        const { usuario } = request.postDataJSON() ?? {};
        const ident = Object.values(ID).find((i) => i.email === usuario);
        if (!ident) return responder(route, 401, { statusCode: 401, message: 'Credenciales inválidas' });
        return responder(route, 200, { type: 'tenant', accessToken: `tok-${ident.id}`, user: { id: ident.id, nombre: ident.nombre, email: ident.email, rol: ident.rol }, tenant: ident.tenant });
      }
      // Caída simulada: Supabase inaccesible (503 de la API), borde de Render (502) o sesión inválida (401/403).
      if (sim.caida) return responder(route, sim.caida, { statusCode: sim.caida, message: 'Servicio no disponible' });
      const ident = quien(route);
      if (!ident) return responder(route, 401, { statusCode: 401, message: 'No autenticado' });
      if (method === 'GET' && path === '/tenant/settings') return responder(route, 200, { ...ident.tenant, colorPrimario: '#EA580C', modoNavegacion: 'SIDEBAR' });
      if (method === 'GET' && path === '/auth/me') return responder(route, 200, { user: { sub: ident.id, tenantId: ident.tenant.id, rol: ident.rol, permisos: ['pos.vender'], permisosConfigurados: true, descuentoMaximo: 0, nombre: ident.nombre } });
      if (method === 'GET' && path === '/contingencia/configuracion') return responder(route, 200, { habilitada: true, entornoHabilitado: true });
      if (method === 'POST' && path === '/contingencia/dispositivos') {
        if (sim.fallosRegistro) { sim.fallosRegistro--; return responder(route, 503, { message: 'Registro temporalmente no disponible' }); }
        sim.registrados.add(ident.tenant.id);
        return responder(route, 201, { id: 'disp-1', codigo: '01', nombre: 'Caja de contingencia', activo: true });
      }
      // El UUID público se reutiliza, pero el alta interna del servidor es distinta por empresa.
      if (method === 'POST' && ['/contingencia/ventanas', '/contingencia/operaciones'].includes(path) && !sim.registrados.has(ident.tenant.id)) return responder(route, 404, { message: 'Equipo no registrado en esta empresa' });
      if (method === 'POST' && path === '/contingencia/ventanas') {
        return responder(route, 201, {
          ventana: { id: `ventana-${ident.id}`, dispositivoId: 'disp-1', cajaId: `caja-${ident.id}`, usuarioId: ident.id, vigenteHasta: VIGENTE(), catalogoHash: 'h1', limites: {}, operacionesEmitidas: ident.tenant.id === EMPRESA_B.id ? EMITIDAS.map(id => id.replace('-8000-', '-9000-')) : EMITIDAS },
          catalogo: { hash: 'h1', productos: [producto] },
        });
      }
      if (method === 'POST' && path === '/contingencia/operaciones') {
        // El servidor real responde por operación; aquí se retienen como pendientes para inspeccionar el diario local.
        const cuerpo = request.postDataJSON() as { operaciones: { operacionId: string }[] };
        sim.cuerpos.push(...(cuerpo.operaciones as Record<string, unknown>[]));
        sim.recibidas.push(...cuerpo.operaciones.map((o) => o.operacionId));
        return responder(route, 200, { resultados: cuerpo.operaciones.map((o) => ({ operacionId: o.operacionId, estado: 'ERROR_TEMPORAL', mensaje: 'retenida por la prueba' })) });
      }
      if (method === 'GET' && path.startsWith('/contingencia/operaciones/estados')) return responder(route, 200, []);
      if (method === 'POST' && path === '/auth/refresh') return responder(route, 401, { statusCode: 401, message: 'Sesión vencida' });
      if (method === 'GET') return responder(route, 200, []);
      return responder(route, 200, {});
    });
    await use(sim);
  }, { auto: true }],
});

async function ingresar(page: Page, ident: Identidad) {
  await page.goto('/login');
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  await page.goto('/login');
  await page.locator('#login-correo').fill(ident.email);
  await page.locator('#login-clave').fill('clave-de-prueba');
  await page.getByRole('button', { name: 'INGRESAR AL SISTEMA' }).click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'));
}

async function abrirContingencia(page: Page) {
  await page.goto('/pos-contingencia');
  await expect(page.getByRole('heading', { name: 'Caja · modo contingencia (efectivo)' })).toBeVisible();
}

function botonTornillo(page: Page) {
  return page.getByRole('region', { name: 'Buscar productos' }).getByRole('button', { name: /^Tornillo 2 pulgadas/ });
}

/** Siembra operaciones en el mismo esquema (versión 1) que crea la aplicación, sin pasar por la interfaz. */
async function sembrar(page: Page, ops: Record<string, unknown>[]) {
  await page.evaluate((lista) => new Promise<void>((resolve, reject) => {
    const req = indexedDB.open('ferresystem-contingencia', 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      const o = db.createObjectStore('operaciones', { keyPath: 'operacionId' });
      o.createIndex('estado', 'estado'); o.createIndex('secuencia', 'secuenciaLocal');
      for (const n of ['ventana', 'borrador', 'meta']) db.createObjectStore(n);
    };
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      const db = req.result;
      const tx = db.transaction('operaciones', 'readwrite');
      for (const op of lista) tx.objectStore('operaciones').put(op);
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onabort = () => reject(tx.error);
    };
  }), ops);
}

async function diario(page: Page) {
  return page.evaluate(() => new Promise<any[]>((resolve, reject) => {
    const req = indexedDB.open('ferresystem-contingencia', 1);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      const all = req.result.transaction('operaciones', 'readonly').objectStore('operaciones').getAll();
      all.onsuccess = () => { req.result.close(); resolve(all.result as any[]); };
      all.onerror = () => reject(all.error);
    };
  }));
}

async function cambiarVentana(page: Page, cambios: Record<string, unknown>) {
  await page.evaluate((c) => new Promise<void>((resolve, reject) => {
    const req = indexedDB.open('ferresystem-contingencia', 1);
    req.onsuccess = () => {
      const tx = req.result.transaction('ventana', 'readwrite');
      const s = tx.objectStore('ventana');
      const g = s.get('activa');
      g.onsuccess = () => s.put({ ...g.result, ...c }, 'activa');
      tx.oncomplete = () => { req.result.close(); resolve(); };
      tx.onabort = () => reject(tx.error);
    };
  }), cambios);
}

const opLocal = (n: number, cajero: Identidad, extra: Record<string, unknown> = {}) => ({
  operacionId: `00000000-0000-4000-9000-${String(n).padStart(12, '0')}`, indiceOperacion: n, dispositivoId: 'disp-1',
  ventanaId: `ventana-vieja-${cajero.id}`, cajeroId: cajero.id, cajeroNombre: cajero.nombre, cajaId: 'caja-x', secuenciaLocal: n,
  correlativoLocal: `CT-01-${String(n).padStart(4, '0')}`, creadaAt: new Date().toISOString(), ocurridoAtLocal: new Date().toISOString(),
  lineas: [{ productoId: 'prod-1', codigo: 'TOR-1', nombre: 'Tornillo', cantidadCentesimas: 100, precioCentavos: 1000 }],
  subtotalCentavos: 1000, isvCentavos: 150, totalCentavos: 1150 + n, efectivoRecibidoCentavos: 2000, cambioCentavos: 850 - n,
  clienteNombre: `Cliente-${cajero.id}-${n}`, clienteRtn: `RTN-${cajero.id}-${n}`, esquemaVersion: 1,
  estado: 'PENDIENTE', intentos: 0, proximoIntentoAt: new Date(Date.now() + 3_600_000).toISOString(), conflictos: [], ...extra,
});
// Equipo compartido por dos empresas. Las «antiguas» no tienen tenantId (datos previos a esta versión).
const SEMBRADAS = [
  opLocal(101, ID.cajeroA1, { tenantId: EMPRESA_A.id }),
  opLocal(102, ID.cajeroA2, { tenantId: EMPRESA_A.id }),
  opLocal(103, ID.cajeroB1, { tenantId: EMPRESA_B.id }),
  opLocal(104, ID.cajeroA1),
  opLocal(105, ID.cajeroB1, { estado: 'REVISION', requiereRevision: true }),
];
const correlativos = (ops: { correlativoLocal: string }[]) => ops.map((o) => o.correlativoLocal);
const deCajero = (ident: Identidad) => SEMBRADAS.filter((o) => o.cajeroId === ident.id);

async function textoDiario(page: Page) {
  return page.getByRole('region', { name: 'Ventas de este equipo' }).innerText();
}

test.describe('Contingencia — aislamiento del diario por empresa, usuario y rol', () => {
  const casos: { quien: keyof typeof ID; ve: string[] }[] = [
    { quien: 'cajeroA1', ve: correlativos(deCajero(ID.cajeroA1)) },
    { quien: 'cajeroA2', ve: correlativos(deCajero(ID.cajeroA2)) },
    { quien: 'adminA', ve: ['CT-01-0101', 'CT-01-0102'] },
    { quien: 'cajeroB1', ve: correlativos(deCajero(ID.cajeroB1)) },
    { quien: 'adminB', ve: ['CT-01-0103'] },
  ];
  for (const { quien, ve } of casos) {
    test(`${quien} ve solo ${ve.join(', ')} y nada de otras empresas o cajeros`, async ({ page }) => {
      await ingresar(page, ID[quien]);
      await sembrar(page, SEMBRADAS);
      await abrirContingencia(page);
      await expect.poll(() => textoDiario(page)).toContain(ve[0]);
      const texto = await textoDiario(page);
      for (const op of SEMBRADAS) {
        const visible = ve.includes(op.correlativoLocal);
        expect(texto.includes(op.correlativoLocal), `${op.correlativoLocal} visible=${visible}`).toBe(visible);
      }
      // Nombres, RTN e importes ajenos no aparecen en ninguna parte de la página.
      const pagina = await page.locator('body').innerText();
      for (const op of SEMBRADAS.filter((o) => !ve.includes(o.correlativoLocal))) {
        expect(pagina).not.toContain(op.clienteNombre);
        expect(pagina).not.toContain(op.clienteRtn);
      }
      await expect(page.getByTestId('pc-no-visibles')).toContainText(`Hay ${SEMBRADAS.length - ve.length} venta(s) de otros usuarios o empresas`);
      // Nada se borró ni cambió en el almacén: lo no visible sigue guardado.
      expect(correlativos(await diario(page)).sort()).toEqual(correlativos(SEMBRADAS).sort());
    });
  }

  test('VENDEDOR no accede a la caja de contingencia ni ve el diario', async ({ page }) => {
    await ingresar(page, ID.vendedorA);
    await sembrar(page, SEMBRADAS);
    await page.goto('/pos-contingencia');
    await expect(page.getByRole('heading', { name: 'Acceso Denegado' })).toBeVisible();
    const pagina = await page.locator('body').innerText();
    for (const op of SEMBRADAS) { expect(pagina).not.toContain(op.correlativoLocal); expect(pagina).not.toContain(op.clienteNombre); }
  });

  test('la exportación de un cajero contiene solo sus ventas, sin datos de la otra empresa', async ({ page }) => {
    await ingresar(page, ID.cajeroA1);
    await sembrar(page, SEMBRADAS);
    await abrirContingencia(page);
    await expect.poll(() => textoDiario(page)).toContain('CT-01-0101');
    const descarga = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Exportar diario (respaldo)' }).click();
    const contenido = await (await (await descarga).createReadStream()).toArray();
    const json = JSON.parse(Buffer.concat(contenido).toString('utf8'));
    expect(correlativos(json.operaciones).sort()).toEqual(['CT-01-0101', 'CT-01-0104']);
    expect(json.alcance).toEqual({ tenantId: EMPRESA_A.id, usuarioId: ID.cajeroA1.id, rol: 'CAJERO' });
    const texto = JSON.stringify(json);
    for (const ajeno of [ID.cajeroB1, ID.cajeroA2]) expect(texto).not.toContain(`Cliente-${ajeno.id}`);
  });

  test('una venta nueva guarda su empresa en el registro local y no la envía al servidor', async ({ page, sim }) => {
    await ingresar(page, ID.cajeroB1);
    await abrirContingencia(page);
    await botonTornillo(page).click();
    await page.locator('#pc-efectivo').fill('20');
    await page.locator('#pc-cobrar').click();
    await expect(page.locator('strong', { hasText: /Venta guardada en este equipo: CT-01-/ })).toBeVisible();
    const [nueva] = await diario(page);
    expect(nueva.tenantId).toBe(EMPRESA_B.id);
    expect(nueva.cajeroId).toBe(ID.cajeroB1.id);
    await expect.poll(() => sim.recibidas.length).toBeGreaterThan(0);
    // El DTO del servidor no cambia: el tenant lo decide el token, no el equipo.
    expect(sim.cuerpos.every((o) => !('tenantId' in o))).toBe(true);
  });
});

test.describe('Contingencia — recuperación de sesión ante 502/503 y bloqueo ante 401/403', () => {
  async function prepararCajero(page: Page) {
    await ingresar(page, ID.cajeroA1);
    await abrirContingencia(page);
    await expect(botonTornillo(page)).toBeVisible();
    await expect.poll(() => page.evaluate(() => localStorage.getItem('ferre_identidad_validada'))).toBe(`${ID.cajeroA1.id}:${EMPRESA_A.id}`);
  }

  for (const caida of [502, 503]) {
    test(`${caida} tras recargar: abre la contingencia con la ventana vigente y permite cobrar`, async ({ page, sim }) => {
      await prepararCajero(page);
      sim.caida = caida;
      await page.reload();
      await expect(botonTornillo(page)).toBeVisible();
      await botonTornillo(page).click();
      await page.locator('#pc-efectivo').fill('20');
      await page.locator('#pc-cobrar').click();
      await expect(page.locator('strong', { hasText: /Venta guardada en este equipo: CT-01-/ })).toBeVisible();
      expect((await diario(page)).length).toBe(1);
    });

    test(`${caida} sin identidad validada previamente: no abre la contingencia`, async ({ page, sim }) => {
      await prepararCajero(page);
      await page.evaluate(() => localStorage.removeItem('ferre_identidad_validada'));
      sim.caida = caida;
      await page.reload();
      await expect(page.getByText('No pudimos verificar la sesión. Revisa la conexión y vuelve a intentar.')).toBeVisible();
      await expect(botonTornillo(page)).toHaveCount(0);
    });

    test(`${caida} con la ventana vencida: no abre la contingencia`, async ({ page, sim }) => {
      await prepararCajero(page);
      await cambiarVentana(page, { vigenteHasta: new Date(Date.now() - 60_000).toISOString() });
      sim.caida = caida;
      await page.reload();
      await expect(page.getByText('No pudimos verificar la sesión. Revisa la conexión y vuelve a intentar.')).toBeVisible();
      await expect(botonTornillo(page)).toHaveCount(0);
    });

    test(`${caida} con ventana de otra empresa u otro cajero: no abre la contingencia`, async ({ page, sim }) => {
      await prepararCajero(page);
      await cambiarVentana(page, { tenantId: EMPRESA_B.id });
      sim.caida = caida;
      await page.reload();
      await expect(page.getByText('No pudimos verificar la sesión. Revisa la conexión y vuelve a intentar.')).toBeVisible();
      sim.caida = undefined;
      await cambiarVentana(page, { tenantId: EMPRESA_A.id, cajeroId: ID.cajeroA2.id });
      sim.caida = caida;
      await page.reload();
      await expect(page.getByText('No pudimos verificar la sesión. Revisa la conexión y vuelve a intentar.')).toBeVisible();
      await expect(botonTornillo(page)).toHaveCount(0);
    });

    test(`${caida} con token ausente (sesión cerrada): no abre la contingencia`, async ({ page, sim }) => {
      await prepararCajero(page);
      await page.evaluate(() => localStorage.removeItem('ferre_token'));
      sim.caida = caida;
      await page.reload();
      await expect(botonTornillo(page)).toHaveCount(0);
      await expect(page).toHaveURL(/\/login/);
    });
  }

  test('401 tras recargar: nunca abre la contingencia y la sesión se cierra', async ({ page, sim }) => {
    await prepararCajero(page);
    sim.caida = 401;
    await page.reload();
    await expect(page).toHaveURL(/\/login/);
    await expect(botonTornillo(page)).toHaveCount(0);
    // El diario local no se borra al cerrar la sesión.
    expect(await page.evaluate(() => localStorage.getItem('ferre_identidad_validada'))).toBeNull();
  });

  test('403 tras recargar: nunca abre la contingencia', async ({ page, sim }) => {
    await prepararCajero(page);
    sim.caida = 403;
    await page.reload();
    await expect(page.getByText('Acceso denegado. Tu sesión sigue abierta.')).toBeVisible();
    await expect(botonTornillo(page)).toHaveCount(0);
  });

  for (const caida of [500, 504]) {
    test(`${caida} tras recargar: no abre la contingencia (solo 502/503 la habilitan)`, async ({ page, sim }) => {
      await prepararCajero(page);
      sim.caida = caida;
      await page.reload();
      await expect(page.getByText('No pudimos verificar la sesión. Revisa la conexión y vuelve a intentar.')).toBeVisible();
      await expect(botonTornillo(page)).toHaveCount(0);
    });
  }
});


test.describe('Contingencia — colas y contadores aislados posteriores a #236', () => {
  test('cambios de empresa y cajero, recarga y contadores del mismo navegador', async ({ page }) => {
    await ingresar(page, ID.cajeroA1);
    await sembrar(page, SEMBRADAS);
    for (const [quien, pendientes] of [['cajeroA1', 2], ['cajeroA2', 1], ['adminA', 2], ['cajeroB1', 1], ['adminB', 1]] as const) {
      await ingresar(page, ID[quien]);
      // La caja de contingencia es independiente del shell; el indicador global vive en el POS en línea.
      await page.goto('/pos');
      await expect(page.locator('.jowa-connection').first()).toContainText(`${pendientes} ventas por enviar`);
      await page.reload();
      await expect(page.locator('.jowa-connection').first()).toContainText(`${pendientes} ventas por enviar`);
      expect((await diario(page)).map(o => o.operacionId).sort()).toEqual(SEMBRADAS.map(o => o.operacionId).sort());
    }
  });

  test('ADMIN de A solo envía A; ADMIN de B solo envía B; históricos desconocidos sobreviven', async ({ page, sim }) => {
    await ingresar(page, ID.adminA);
    const iniciales = SEMBRADAS.map(o => ({ ...o, proximoIntentoAt: undefined }));
    await sembrar(page, iniciales);
    await abrirContingencia(page);
    await expect.poll(() => sim.recibidas.length).toBeGreaterThan(0);
    const idsA = iniciales.filter(o => o.tenantId === EMPRESA_A.id).map(o => o.operacionId).sort();
    expect([...new Set(sim.recibidas)].sort()).toEqual(idsA);
    const antesB = await diario(page);
    const ajenaB = iniciales.find(o => o.tenantId === EMPRESA_B.id)!;
    expect(antesB.find(o => o.operacionId === ajenaB.operacionId)).toEqual(ajenaB);
    sim.recibidas.length = 0;
    await ingresar(page, ID.adminB);
    await abrirContingencia(page);
    await expect.poll(() => sim.recibidas.length).toBeGreaterThan(0);
    expect([...new Set(sim.recibidas)]).toEqual([ajenaB.operacionId]);
    expect([...sim.registrados].sort()).toEqual([EMPRESA_A.id, EMPRESA_B.id].sort());
    const final = await diario(page);
    const historica = iniciales.find(o => o.cajeroId === ID.cajeroA1.id && !('tenantId' in o))!;
    expect(final.find(o => o.operacionId === historica.operacionId)).toEqual(historica);
    for (const o of iniciales) {
      const despues = final.find(x => x.operacionId === o.operacionId);
      for (const campo of ['tenantId', 'operacionId', 'secuenciaLocal', 'correlativoLocal', 'lineas', 'subtotalCentavos', 'isvCentavos', 'totalCentavos']) expect(despues[campo]).toEqual(o[campo as keyof typeof o]);
    }
  });
});


test('ventas nuevas en A y B conservan el UUID del equipo, secuencia global e identidad propia tras reiniciar', async ({ page, sim }) => {
  await ingresar(page, ID.cajeroA1);
  await abrirContingencia(page);
  await botonTornillo(page).click();
  await page.locator('#pc-efectivo').fill('20');
  await page.locator('#pc-cobrar').click();
  await expect.poll(async () => (await diario(page)).length).toBe(1);
  const [primera] = await diario(page);
  await expect.poll(() => sim.recibidas.includes(primera.operacionId)).toBe(true);
  await ingresar(page, ID.cajeroB1);
  sim.recibidas.length = 0;
  sim.fallosRegistro = 1;
  await abrirContingencia(page);
  await expect(page.getByText('Registro temporalmente no disponible')).toBeVisible();
  // El reintento manual usa el mismo mecanismo que el intervalo, sin otra sesión ni nuevo UUID.
  await page.getByRole('button', { name: 'Enviar pendientes ahora' }).click();
  await expect(botonTornillo(page)).toBeVisible();
  await botonTornillo(page).click();
  await page.locator('#pc-efectivo').fill('20');
  await page.locator('#pc-cobrar').click();
  await expect.poll(async () => (await diario(page)).length).toBe(2);
  const ventas = await diario(page);
  const segunda = ventas.find(o => o.tenantId === EMPRESA_B.id)!;
  await expect.poll(() => sim.recibidas.includes(segunda.operacionId)).toBe(true);
  expect(sim.recibidas.every(id => id === segunda.operacionId)).toBe(true);
  expect(primera.tenantId).toBe(EMPRESA_A.id);
  expect(segunda.operacionId).not.toBe(primera.operacionId);
  expect(segunda.dispositivoId).toBe(primera.dispositivoId);
  expect(ventas.map(o => o.secuenciaLocal).sort()).toEqual([1, 2]);
  expect(ventas.map(o => o.totalCentavos)).toEqual([1150, 1150]);
  expect([...sim.registrados].sort()).toEqual([EMPRESA_A.id, EMPRESA_B.id].sort());
  await page.reload();
  await expect(page.getByRole('region', { name: 'Ventas de este equipo' })).toContainText(segunda.correlativoLocal);
  await expect(page.getByRole('region', { name: 'Ventas de este equipo' })).not.toContainText(primera.correlativoLocal);
  const final = await diario(page);
  for (const antes of ventas) {
    const despues = final.find(o => o.operacionId === antes.operacionId);
    for (const campo of ['tenantId', 'operacionId', 'dispositivoId', 'secuenciaLocal', 'correlativoLocal', 'lineas', 'totalCentavos']) expect(despues[campo]).toEqual(antes[campo]);
  }
});
