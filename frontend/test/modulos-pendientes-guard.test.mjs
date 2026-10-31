/**
 * modulos-pendientes-guard.test.mjs
 *
 * Guardia de regresión: apartados, transferencias, pedidos especiales y listas de precio no tienen operaciones
 * reales (sin modelo operativo ni API). Hasta implementarlos:
 * - no tienen ruta en App.tsx (una URL directa cae en la redirección de "*");
 * - no aparecen en el menú;
 * - sus páginas antiguas, que guardaban datos en localStorage, se eliminaron;
 * - la lista del frontend coincide con la del backend (MODULOS_NO_IMPLEMENTADOS).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const NO_IMPLEMENTADOS = ['apartados', 'transferencias_sucursal', 'pedidos_especiales', 'listas_precio'];
const RUTAS = ['/apartados', '/transferencias', '/pedidos-especiales', '/listas-precio'];
const PAGINAS = ['ApartadosPage', 'TransferenciasPage', 'PedidosEspecialesPage', 'ListasPrecioPage'];
const app = fs.readFileSync('src/App.tsx', 'utf8');
const pos = fs.readFileSync('src/pages/POSPage.tsx', 'utf8');
const ventasUsanListas = /listas?_?precio|listaPrecio|ListasPrecio|ferre_mock_listas/i;

test('ninguna ruta de estos módulos existe en App.tsx; una URL directa cae en la redirección de "*"', () => {
  for (const ruta of RUTAS) assert.ok(!app.includes(`path="${ruta}"`), `${ruta} no debe tener ruta`);
  assert.match(app, /path="\*" element=\{<Navigate to="\/" replace \/>\}/);
});

test('las páginas antiguas con localStorage no existen ni se importan', () => {
  for (const nombre of PAGINAS) {
    assert.equal(fs.existsSync(`src/pages/${nombre}.tsx`), false, `${nombre}.tsx debe estar eliminada`);
    assert.ok(!app.includes(nombre), `${nombre} no debe aparecer en App.tsx`);
  }
});

test('el POS no lee listas de precio: el precio vigente de venta sale solo del producto', () => {
  assert.equal(ventasUsanListas.test(pos), false);
});

test('los módulos sin implementar están ocultos del menú', () => {
  const catalogo = fs.readFileSync('src/config/modulesCatalog.ts', 'utf8');
  for (const key of NO_IMPLEMENTADOS) assert.ok(catalogo.includes(`'${key}'`), `${key} debe figurar en PENDING_MODULES`);
});

test('la lista del frontend coincide con MODULOS_NO_IMPLEMENTADOS del backend', () => {
  const catalogo = fs.readFileSync('src/config/modulesCatalog.ts', 'utf8');
  const front = [...catalogo.match(/PENDING_MODULES = new Set\(\[([^\]]*)\]\)/)[1].matchAll(/'([a-z_]+)'/g)].map(m => m[1]).sort();
  const backend = fs.readFileSync('../backend/src/common/tenant-modules.ts', 'utf8');
  const back = [...backend.match(/MODULOS_NO_IMPLEMENTADOS = \[([^\]]*)\]/)[1].matchAll(/'([a-z_]+)'/g)].map(m => m[1]).sort();
  assert.deepEqual(front, back);
  assert.deepEqual(back, [...NO_IMPLEMENTADOS, 'comisiones_venta'].sort());
  assert.match(fs.readFileSync('src/components/ProtectedRoute.tsx', 'utf8'), /PENDING_MODULES\.has\(requiredModule\)/);
  assert.match(fs.readFileSync('src/utils/taskNavigation.ts', 'utf8'), /PENDING_MODULES\.has\(item\.moduleKey\)/);
});
