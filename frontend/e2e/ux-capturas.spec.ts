import { test, type Page } from '@playwright/test';
import { prepararSesion, auditarContraste, desbordamientoHorizontal, type Rol } from './ux-auditoria.fixture';
import fs from 'node:fs';
import path from 'node:path';

// Evidencia visual del PR (antes/después). Solo corre con UX_CAPTURAS=<carpeta>; no forma parte de la suite.
// Guarda capturas y un resumen JSON de contraste y desbordamiento horizontal por pantalla y ancho.
const destino = process.env.UX_CAPTURAS;
test.skip(!destino, 'Solo para generar evidencias: UX_CAPTURAS=<carpeta>');

const pantallas: { nombre: string; ruta: string; rol: Rol; anchos: number[]; sinSesion?: boolean; antes?: (page: Page) => Promise<void>; negocio?: Record<string, unknown> }[] = [
  { nombre: 'login', ruta: '/login', rol: 'ADMIN', sinSesion: true, anchos: [1440, 390] },
  { nombre: 'usuarios-modal', ruta: '/usuarios', rol: 'ADMIN', anchos: [1440, 390], antes: async page => { await page.getByRole('button', { name: /editar/i }).nth(1).click(); } },
  { nombre: 'pos', ruta: '/pos', rol: 'ADMIN', anchos: [1440, 1024, 390], antes: async page => { await page.locator('.ferre-pos-catalog .pos-producto, .ferre-pos-catalog div.industrial-card').first().click(); await page.locator('.ferre-pos-catalog .pos-producto, .ferre-pos-catalog div.industrial-card').nth(2).click(); } },
  { nombre: 'pos-marca-clara', ruta: '/pos', rol: 'ADMIN', anchos: [1440], negocio: { colorPrimario: '#F5C400' }, antes: async page => { await page.locator('.ferre-pos-catalog .pos-producto, .ferre-pos-catalog div.industrial-card').first().click(); } },
  { nombre: 'inicio', ruta: '/', rol: 'ADMIN', anchos: [1440, 390] },
  { nombre: 'inventario', ruta: '/inventario', rol: 'ADMIN', anchos: [1440, 390] },
  { nombre: 'topnav', ruta: '/', rol: 'ADMIN', anchos: [1024], negocio: { modoNavegacion: 'TOPNAV' } },
  { nombre: 'superadmin', ruta: '/admin', rol: 'SUPERADMIN', anchos: [1440, 390] },
];

for (const p of pantallas) for (const ancho of p.anchos) {
  test(`${p.nombre} @${ancho}`, async ({ page }) => {
    await page.setViewportSize({ width: ancho, height: ancho < 600 ? 844 : 900 });
    await prepararSesion(page, p.rol, { sinSesion: p.sinSesion, negocio: p.negocio as never });
    await page.goto(p.ruta);
    await page.waitForLoadState('networkidle');
    if (p.antes) await p.antes(page);
    await page.waitForTimeout(300);
    fs.mkdirSync(destino!, { recursive: true });
    const base = path.join(destino!, `${p.nombre}-${ancho}`);
    await page.screenshot({ path: `${base}.png`, fullPage: ancho >= 600 || p.nombre !== 'pos' });
    const contraste = await auditarContraste(page);
    const desborde = await desbordamientoHorizontal(page);
    fs.writeFileSync(`${base}.json`, JSON.stringify({ desborde, contraste }, null, 1));
  });
}
