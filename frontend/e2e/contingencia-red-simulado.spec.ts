import { expect } from '@playwright/test';
import { test, botonTornillo, diario, ingresarYAbrirPos, venderUnTornillo } from './helpers/contingencia-sim';

// Fase 4 de cierre: fallos de red y del servidor durante la contingencia, con backend simulado.
// Comprueba que una venta guardada localmente no se pierde, no se confirma sin respuesta del servidor y no se duplica
// al reintentar. La idempotencia real por UUID en el servidor está en backend/test (PostgreSQL).

const CORRELATIVO = 'CT-01-0001';
const guardada = (page: import('@playwright/test').Page) => page.locator('strong', { hasText: `Venta guardada en este equipo: ${CORRELATIVO}` });
const operacion = async (page: import('@playwright/test').Page) => (await diario(page)).find((o) => o.correlativoLocal === CORRELATIVO);

test.describe('Contingencia POS — fallos de red y del servidor', () => {
  test('503 del servidor: la venta queda pendiente con reintento programado, el cajero ve el motivo y se confirma una sola vez', async ({ page, sim }) => {
    test.setTimeout(120_000);
    await ingresarYAbrirPos(page);
    sim.fallosTemporales = 1;
    await venderUnTornillo(page);
    await expect(guardada(page)).toBeVisible();

    // El servidor responde 503: la venta sigue en el diario, pendiente y con su motivo técnico.
    await expect.poll(async () => (await operacion(page))?.intentos, { timeout: 60_000 }).toBe(1);
    const tras = await operacion(page);
    expect(tras.estado).toBe('PENDIENTE');
    expect(tras.ultimoError).toContain('503');
    expect(tras.proximoIntentoAt).toBeTruthy();
    expect(new Date(tras.proximoIntentoAt).getTime()).toBeGreaterThan(Date.now() - 1000);

    // El mensaje habla del servidor, no de la conexión a internet.
    await expect(page.getByText('El servidor no pudo procesar las ventas. Se reintentará automáticamente.')).toBeVisible();
    await expect(page.getByText('Sin conexión con el servidor')).toHaveCount(0);

    // El reintento usa el mismo identificador y la venta se confirma exactamente una vez.
    await expect.poll(async () => (await operacion(page))?.estado, { timeout: 60_000 }).toBe('SINCRONIZADA');
    expect(new Set(sim.operacionesRecibidas).size).toBe(1);
    expect(sim.operacionesRecibidas.length).toBeGreaterThanOrEqual(2);
    expect((await diario(page)).filter((o) => o.estado === 'SINCRONIZADA')).toHaveLength(1);
    expect(sim.errores).toEqual([]);
  });

  test('corte de red después de guardar: sobrevive a recargar y se confirma una sola vez al volver la red', async ({ page, sim }) => {
    test.setTimeout(120_000);
    await ingresarYAbrirPos(page);
    sim.sinRed = true;
    await venderUnTornillo(page);
    await expect(guardada(page)).toBeVisible();

    // Sin red el envío falla y la venta queda pendiente, nunca confirmada.
    await expect.poll(async () => (await operacion(page))?.intentos, { timeout: 60_000 }).toBeGreaterThanOrEqual(1);
    expect((await operacion(page)).estado).toBe('PENDIENTE');
    expect(sim.operacionesRecibidas).toHaveLength(0);

    // La red vuelve y el cajero recarga la página: la venta sigue en el diario y se envía una sola vez.
    sim.sinRed = false;
    await page.reload();
    await expect(botonTornillo(page)).toBeVisible();
    expect((await operacion(page))?.correlativoLocal).toBe(CORRELATIVO);
    await expect.poll(async () => (await operacion(page))?.estado, { timeout: 60_000 }).toBe('SINCRONIZADA');
    expect(new Set(sim.operacionesRecibidas).size).toBe(1);
    expect((await diario(page)).filter((o) => o.estado === 'SINCRONIZADA')).toHaveLength(1);
    expect(sim.errores).toEqual([]);
  });

  test('recargar durante un envío en vuelo: la venta no aparece confirmada, vuelve a pendiente y se envía una sola vez', async ({ page, sim }) => {
    test.setTimeout(120_000);
    await ingresarYAbrirPos(page);
    // La primera petición llega al servidor y no recibe respuesta: la venta queda "enviando" en el diario.
    sim.retenerEnvio = true;
    await venderUnTornillo(page);
    await expect(guardada(page)).toBeVisible();
    await expect.poll(() => sim.operacionesRecibidas.length, { timeout: 30_000 }).toBeGreaterThanOrEqual(1);
    await expect.poll(async () => (await operacion(page))?.estado, { timeout: 10_000 }).toBe('ENVIANDO');

    // El cajero recarga mientras la primera petición sigue sin respuesta. Ninguna confirmación puede venir de ella.
    sim.retenerEnvio = false;
    await page.reload();
    await expect(botonTornillo(page)).toBeVisible();

    // Al reconectar, la sincronización recupera el envío interrumpido. La confirmación lleva el número que devolvió el servidor.
    await expect.poll(async () => (await operacion(page))?.estado, { timeout: 60_000 }).toBe('SINCRONIZADA');
    expect((await operacion(page)).numeroVenta).toBe(7);
    expect(new Set(sim.operacionesRecibidas).size).toBe(1);
    expect(sim.operacionesRecibidas.length).toBeGreaterThanOrEqual(2);
    expect((await diario(page)).filter((o) => o.estado === 'SINCRONIZADA')).toHaveLength(1);
    expect(sim.errores).toEqual([]);
  });
});
