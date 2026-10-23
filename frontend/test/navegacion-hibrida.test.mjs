/**
 * navegacion-hibrida.test.mjs
 *
 * La navegación oficial es una sola: panel lateral compacto + barra superior contextual. TOPNAV/SIDEBAR dejaron de ser
 * una opción: ninguna pantalla los ofrece y el valor histórico `modoNavegacion` ya no decide el layout. Además fija la
 * regla de negocio del menú por rol (RBAC y módulos habilitados) y las funciones puras del logotipo y de los menús.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';

const leer = (ruta) => fs.readFileSync(ruta, 'utf8');
const cargar = (file, requires = {}) => {
  const out = ts.transpileModule(leer(file), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const module = { exports: {} };
  const require = (nombre) => {
    if (nombre in requires) return requires[nombre];
    if (nombre.endsWith('modulesCatalog')) return cargar('src/config/modulesCatalog.ts', {});
    if (nombre.endsWith('navigation')) return cargar('src/config/navigation.ts', { 'lucide-react': new Proxy({}, { get: () => () => null }) });
    throw new Error(`import inesperado: ${nombre}`);
  };
  vm.runInNewContext(out, { module, exports: module.exports, require, Math, Number, String, Array, Set });
  return module.exports;
};
const archivos = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
  const ruta = path.join(dir, e.name);
  return e.isDirectory() ? archivos(ruta) : /\.(tsx?|css)$/.test(e.name) ? [ruta] : [];
});

test('el layout no lee modoNavegacion ni ofrece TOPNAV/SIDEBAR', () => {
  const app = leer('src/App.tsx');
  assert.doesNotMatch(app.replace(/\/\/.*$/gm, ''), /modoNavegacion|TOPNAV|isTopNav|TopNavigation|<Sidebar/);
  assert.match(app, /<AdminRail \/>/);
  assert.match(app, /<CajeroRail \/>/);
  assert.match(app, /<AdminTopbar \/>/);
});

test('ninguna pantalla conserva selectores ni textos de TOPNAV/SIDEBAR (solo el campo histórico de compatibilidad)', () => {
  const permitidos = new Set(['src/types/index.ts', 'src/utils/tenantSettings.ts']);
  const infractores = archivos('src').filter((f) => !permitidos.has(f.replaceAll('\\', '/')) && /modoNavegacion|TOPNAV|setModoNavegacion/.test(leer(f).replace(/\/\/.*$/gm, '')));
  assert.deepEqual(infractores, []);
  assert.ok(!fs.existsSync('src/components/Sidebar.tsx'));
  assert.ok(!fs.existsSync('src/components/TopNavigation.tsx'));
});

test('los textos visibles no mencionan menú lateral/superior ni modo de navegación', () => {
  for (const idioma of ['es', 'en']) {
    const texto = leer(`src/locales/${idioma}.json`);
    assert.doesNotMatch(texto, /TOPNAV|SIDEBAR|menú superior|menú lateral|top menu|side menu|navigation mode|modo de navegación/i, idioma);
  }
});

test('las configuraciones de negocio ya no envían modoNavegacion (el valor histórico no se toca)', () => {
  for (const f of ['src/pages/ConfiguracionPage.tsx', 'src/pages/NegocioDetallePage.tsx', 'src/pages/SuperAdminPage.tsx']) {
    assert.doesNotMatch(leer(f), /modoNavegacion/, f);
  }
});

test('el Super Admin tiene rail de herramientas globales: Inicio, Empresas, Módulos, Usuarios y soporte, Auditoría', () => {
  const nav = cargar('src/config/platformNavigation.ts', { 'lucide-react': new Proxy({}, { get: () => () => null }) });
  assert.deepEqual(Array.from(nav.AREAS_PLATAFORMA.map((a) => a.etiqueta)), ['Inicio', 'Empresas', 'Módulos', 'Usuarios y soporte', 'Auditoría']);
  const secciones = Array.from(nav.AREAS_PLATAFORMA.flatMap((a) => a.secciones)).sort();
  assert.deepEqual(secciones, Object.keys(nav.SLUG_SECCION).sort(), 'toda sección tiene un área y ninguna se repite');
  assert.equal(nav.areaDeSeccion('soporte_historial'), 'usuarios');
  assert.equal(nav.areaDeSeccion('mantenimiento'), 'auditoria');
});

const TODOS = ['pos', 'cotizaciones', 'inventario', 'clientes', 'arqueo_caja', 'ordenes_compra', 'levantamiento', 'reportes', 'usuarios', 'garantias', 'comisiones_venta', 'transferencias_sucursal', 'apartados', 'pedidos_especiales', 'listas_precio'];
const { availableTasks } = cargar('src/utils/taskNavigation.ts', {});
const claves = (rol, modulos = TODOS, extra = {}) => availableTasks({ id: 'u', rol, ...extra }, { id: 't', nombreComercial: 'T', modulosHabilitados: modulos }).map((i) => i.key);

test('Inicio es accesible para todos los roles del negocio, aunque no haya módulos habilitados', () => {
  for (const rol of ['ADMIN', 'CAJERO', 'VENDEDOR', 'BODEGUERO']) {
    assert.ok(claves(rol, []).includes('dashboard'), rol);
  }
});

test('el menú de cada rol respeta su RBAC: sin accesos de otros roles ni de plataforma', () => {
  const cajero = claves('CAJERO');
  for (const prohibido of ['precios', 'usuarios', 'reportes', 'inventario', 'ordenes_compra', 'clientes', 'superadmin', 'contingencia_admin']) assert.ok(!cajero.includes(prohibido), `cajero: ${prohibido}`);
  assert.ok(cajero.includes('pos') && cajero.includes('arqueo_caja'));
  const bodeguero = claves('BODEGUERO');
  for (const prohibido of ['pos', 'cotizaciones', 'arqueo_caja', 'usuarios', 'reportes', 'superadmin']) assert.ok(!bodeguero.includes(prohibido), `bodeguero: ${prohibido}`);
  assert.ok(bodeguero.includes('inventario') && bodeguero.includes('levantamiento'));
  const vendedor = claves('VENDEDOR');
  for (const prohibido of ['inventario', 'precios', 'usuarios', 'reportes', 'ordenes_compra', 'superadmin']) assert.ok(!vendedor.includes(prohibido), `vendedor: ${prohibido}`);
  assert.ok(vendedor.includes('pos'));
  for (const rol of ['ADMIN', 'CAJERO', 'VENDEDOR', 'BODEGUERO']) assert.ok(!claves(rol).includes('superadmin'), rol);
});

test('un módulo deshabilitado por el Super Admin desaparece del menú de todos los roles', () => {
  for (const rol of ['ADMIN', 'CAJERO', 'VENDEDOR', 'BODEGUERO']) {
    const sin = claves(rol, TODOS.filter((m) => m !== 'inventario'));
    assert.ok(!sin.includes('inventario'), rol);
  }
  assert.ok(!claves('ADMIN', TODOS.filter((m) => m !== 'ordenes_compra')).includes('ordenes_compra'));
  assert.ok(!claves('CAJERO', ['inventario']).includes('pos'));
});

test('los permisos configurados por usuario siguen filtrando el menú', () => {
  const sinVender = claves('CAJERO', TODOS, { permisosConfigurados: true, permisos: [] });
  assert.ok(!sinVender.includes('pos'));
  assert.ok(sinVender.includes('dashboard'));
});

const { fondoParaLogotipo } = cargar('src/utils/fondoLogotipo.ts', {});
const pixeles = (...px) => Uint8ClampedArray.from(px.flat());
const repetir = (n, px) => Array.from({ length: n }, () => px);

test('logotipos: el original nunca cambia; solo se elige un marco claro u oscuro', () => {
  // Oscuro y transparente (el caso del rail): marco claro.
  assert.equal(fondoParaLogotipo(pixeles(...repetir(60, [10, 20, 40, 255]), ...repetir(40, [0, 0, 0, 0]))), 'claro');
  // Claro y transparente: sobre blanco desaparecería, marco oscuro.
  assert.equal(fondoParaLogotipo(pixeles(...repetir(60, [250, 250, 250, 255]), ...repetir(40, [0, 0, 0, 0]))), 'oscuro');
  // Claro pero con fondo propio opaco (JPG con fondo blanco): marco claro.
  assert.equal(fondoParaLogotipo(pixeles(...repetir(100, [250, 250, 250, 255]))), 'claro');
  // Cuadrado, horizontal y mixto: el marco claro es el valor por defecto.
  assert.equal(fondoParaLogotipo(pixeles(...repetir(50, [200, 30, 30, 255]), ...repetir(50, [250, 250, 250, 255]))), 'claro');
  // Imagen vacía o totalmente transparente: no rompe.
  assert.equal(fondoParaLogotipo(pixeles()), 'claro');
  assert.equal(fondoParaLogotipo(pixeles(...repetir(10, [0, 0, 0, 0]))), 'claro');
});

const { calcularPosicionMenu } = cargar('src/utils/posicionMenu.ts', {});
const vista = { ancho: 1366, alto: 768 };
const ancla = (top, left, ancho = 130, alto = 32) => ({ top, bottom: top + alto, left, right: left + ancho });

test('menú desplegable: abre debajo y alineado a la derecha del botón', () => {
  const p = calcularPosicionMenu(ancla(100, 800), { ancho: 248, alto: 300 }, vista);
  assert.equal(p.arriba, false);
  assert.equal(p.top, 138);
  assert.equal(p.left, 930 - 248);
});

test('menú desplegable: cerca del borde inferior se abre hacia arriba, sin recortarse', () => {
  const p = calcularPosicionMenu(ancla(700, 800), { ancho: 248, alto: 300 }, vista);
  assert.equal(p.arriba, true);
  assert.ok(p.top >= 8 && p.top + 300 <= 700 - 6);
});

test('menú desplegable: cerca del borde derecho/izquierdo no se desborda horizontalmente', () => {
  const derecha = calcularPosicionMenu(ancla(100, 1300, 60), { ancho: 248, alto: 200 }, vista);
  assert.ok(derecha.left + 248 <= vista.ancho - 8);
  const izquierda = calcularPosicionMenu(ancla(100, 0, 60), { ancho: 248, alto: 200 }, vista);
  assert.ok(izquierda.left >= 8);
  const movil = calcularPosicionMenu(ancla(100, 250, 100), { ancho: 248, alto: 200 }, { ancho: 390, alto: 844 });
  assert.ok(movil.left >= 8 && movil.left + 248 <= 390 - 8);
});

test('menú desplegable: si no cabe en ningún lado se limita la altura para desplazarse por dentro', () => {
  const p = calcularPosicionMenu(ancla(300, 800), { ancho: 248, alto: 900 }, vista);
  assert.ok(p.maxHeight < 900);
  assert.ok(p.top >= 0 && p.top + p.maxHeight <= vista.alto);
});
