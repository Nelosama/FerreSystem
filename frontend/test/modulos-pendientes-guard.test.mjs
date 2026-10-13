/**
 * modulos-pendientes-guard.test.mjs
 *
 * Guardia de regresión: apartados, transferencias, pedidos especiales y listas de precio NO tienen
 * persistencia real (no hay modelo ni API). Sus páginas antiguas guardan datos en localStorage.
 * Esta prueba impide que una de ellas quede conectada a una ruta operativa o a la venta, lo que
 * podría cambiar precios o stock sin registro en PostgreSQL.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const app = fs.readFileSync('src/App.tsx', 'utf8');
const pos = fs.readFileSync('src/pages/POSPage.tsx', 'utf8');
const ventasUsanListas = /listas?_?precio|listaPrecio|ListasPrecio|ferre_mock_listas/i;

test('las rutas de estos módulos muestran el marcador pendiente, no la página con localStorage', () => {
  for (const nombre of ['ApartadosPage', 'TransferenciasPage', 'ListasPrecioPage', 'PedidosEspecialesPage']) {
    assert.ok(!new RegExp(`import\\s*\\(\\s*'\\./pages/${nombre}'`).test(app), `${nombre} no debe importarse en App.tsx`);
  }
  assert.match(app, /const ListasPrecioPage\s*=\(\)=>\s*<ModuloPendiente/);
  assert.match(app, /const ApartadosPage\s*=\(\)=>\s*<ModuloPendiente/);
  assert.match(app, /const TransferenciasPage\s*=\(\)=>\s*<ModuloPendiente/);
  assert.match(app, /const PedidosEspecialesPage\s*=\(\)=>\s*<ModuloPendiente/);
});

test('el POS no lee listas de precio: el precio vigente de venta sale solo del producto', () => {
  assert.equal(ventasUsanListas.test(pos), false);
});

test('los módulos pendientes siguen ocultos del menú', () => {
  const catalogo = fs.readFileSync('src/config/modulesCatalog.ts', 'utf8');
  assert.match(catalogo, /PENDING_MODULES = new Set\(\[[^\]]*'listas_precio'[^\]]*\]\)/);
  assert.match(catalogo, /'apartados'/);
  assert.match(catalogo, /'pedidos_especiales'/);
});
