import { expect, type Page } from '@playwright/test';
import { test, botonTornillo, diario, ingresarYAbrirPos, venderUnTornillo } from './helpers/contingencia-sim';

// P1-1 (AUDITORIA_OFFLINE_ALMACENAMIENTO_20261104): persistencia, cuota y errores de escritura en el POS de contingencia.
// El navegador real no permite forzar la cuota de forma fiable desde la página; se simulan las respuestas de navigator.storage.

const MiB = 1024 * 1024;
const GiB = 1024 * MiB;

type ConfigAlmacen = {
  sinApi?: boolean;
  persisted?: boolean;
  persistResult?: boolean;
  estimate?: { usage: number; quota: number } | 'rechaza';
};

async function simularAlmacen(page: Page, cfg: ConfigAlmacen) {
  await page.addInitScript((c) => {
    const w = window as unknown as { __persistCalls: number };
    w.__persistCalls = 0;
    const storage = {
      persisted: async () => c.persisted ?? false,
      persist: async () => { w.__persistCalls += 1; return c.persistResult ?? false; },
      estimate: c.estimate === 'rechaza'
        ? async () => { throw new Error('estimación no disponible'); }
        : async () => (c.estimate ?? { usage: 0, quota: 3 * 1024 * 1024 * 1024 }),
    };
    Object.defineProperty(navigator, 'storage', { value: c.sinApi ? undefined : storage, configurable: true });
  }, cfg);
}

async function persistCalls(page: Page) {
  return page.evaluate(() => (window as unknown as { __persistCalls: number }).__persistCalls);
}

test.describe('Contingencia POS — persistencia y cuota del almacén local', () => {
  test('sin persistencia concedida: pide persist(), muestra el aviso y la venta sigue disponible', async ({ page, sim }) => {
    await simularAlmacen(page, { persisted: false, persistResult: false, estimate: { usage: 10 * MiB, quota: 3 * GiB } });
    await ingresarYAbrirPos(page);
    await expect(page.getByTestId('pc-aviso-persistencia')).toBeVisible();
    expect(await persistCalls(page)).toBeGreaterThan(0);
    await venderUnTornillo(page);
    await expect(page.locator('strong', { hasText: /Venta guardada en este equipo: CT-01-/ })).toBeVisible();
    expect(sim.errores).toEqual([]);
  });

  test('con persistencia concedida: no hay aviso de persistencia ni solicitud repetida', async ({ page }) => {
    await simularAlmacen(page, { persisted: true, estimate: { usage: 10 * MiB, quota: 3 * GiB } });
    await ingresarYAbrirPos(page);
    await expect(page.getByTestId('pc-aviso-persistencia')).toHaveCount(0);
    expect(await persistCalls(page)).toBe(0);
  });

  test('espacio bajo (menos de 200 MiB libres): aviso visible y la venta se guarda', async ({ page, sim }) => {
    await simularAlmacen(page, { persisted: true, estimate: { usage: 2.9 * GiB, quota: 3 * GiB } });
    await ingresarYAbrirPos(page);
    await expect(page.getByTestId('pc-aviso-espacio')).toBeVisible();
    await expect(page.getByTestId('pc-aviso-espacio-critico')).toHaveCount(0);
    await venderUnTornillo(page);
    await expect(page.locator('strong', { hasText: /Venta guardada en este equipo: CT-01-/ })).toBeVisible();
    expect(sim.errores).toEqual([]);
  });

  test('espacio casi agotado (menos de 50 MiB libres): no se puede cobrar y no se crea ninguna venta', async ({ page }) => {
    await simularAlmacen(page, { persisted: true, estimate: { usage: 3 * GiB - 10 * MiB, quota: 3 * GiB } });
    await ingresarYAbrirPos(page);
    await expect(page.getByTestId('pc-aviso-espacio-critico')).toBeVisible();
    await botonTornillo(page).click();
    await page.locator('#pc-efectivo').fill('20');
    await expect(page.locator('#pc-cobrar')).toBeDisabled();
    await expect(page.locator('strong', { hasText: 'Venta guardada en este equipo' })).toHaveCount(0);
    expect((await diario(page)).length).toBe(0);
  });

  test('sin API de almacenamiento: la página funciona, sin aviso de persistencia ni errores', async ({ page, sim }) => {
    await simularAlmacen(page, { sinApi: true });
    await ingresarYAbrirPos(page);
    await expect(page.getByTestId('pc-aviso-persistencia')).toHaveCount(0);
    await expect(page.getByTestId('pc-aviso-espacio-critico')).toHaveCount(0);
    await venderUnTornillo(page);
    await expect(page.locator('strong', { hasText: /Venta guardada en este equipo: CT-01-/ })).toBeVisible();
    expect(sim.errores).toEqual([]);
  });

  test('medición que falla: la página sigue funcionando y no se bloquea la venta', async ({ page, sim }) => {
    await simularAlmacen(page, { persisted: true, estimate: 'rechaza' });
    await ingresarYAbrirPos(page);
    await venderUnTornillo(page);
    await expect(page.locator('strong', { hasText: /Venta guardada en este equipo: CT-01-/ })).toBeVisible();
    expect(sim.errores).toEqual([]);
  });

  test('fallo de escritura al guardar: la venta no se confirma, no hay comprobante ni operación a medias', async ({ page, sim }) => {
    // Simula el fallo de la transacción del alta (cuota u otro error de escritura). La cuota real del motor no se puede
    // forzar de forma fiable en este entorno; la traducción de QuotaExceededError a «espacio lleno» está en almacenamiento.test.mjs.
    await simularAlmacen(page, { persisted: true, estimate: { usage: 10 * MiB, quota: 3 * GiB } });
    await page.addInitScript(() => {
      const add = IDBObjectStore.prototype.add;
      IDBObjectStore.prototype.add = function (...args: unknown[]) {
        if ((window as unknown as { __fallarEscritura?: boolean }).__fallarEscritura && this.name === 'operaciones') {
          throw new DOMException('Cuota de almacenamiento excedida', 'QuotaExceededError');
        }
        return add.apply(this, args as never);
      } as typeof add;
    });
    await ingresarYAbrirPos(page);
    await page.evaluate(() => { (window as unknown as { __fallarEscritura: boolean }).__fallarEscritura = true; });
    await venderUnTornillo(page);
    await expect(page.getByRole('alert').filter({ hasText: 'La venta NO se guardó en este equipo' })).toBeVisible();
    await expect(page.locator('strong', { hasText: 'Venta guardada en este equipo' })).toHaveCount(0);
    expect((await diario(page)).length).toBe(0);
    expect(sim.operacionesRecibidas).toEqual([]);
    // El único error de página admitido es la excepción inyectada; no debe haber otros.
    expect(sim.errores.every((e) => e === 'Cuota de almacenamiento excedida')).toBe(true);
  });
});
