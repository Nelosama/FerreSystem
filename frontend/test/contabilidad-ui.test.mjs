import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as icons from 'lucide-react';

// Contabilidad y Control Tributario: rol CONTADOR, módulo opcional y utilidades de la pantalla.
// La autorización real la aplica el servidor (backend/src/contabilidad/autorizacion-rutas.spec.ts y la integración PostgreSQL).
const load = (file) => {
  const exports = {};
  const require = name => {
    if (name === 'lucide-react') return icons;
    if (name.endsWith('modulesCatalog')) return load('src/config/modulesCatalog.ts');
    if (name.endsWith('navigation')) return load('src/config/navigation.ts');
    if (name.endsWith('contabilidad')) return load('src/utils/contabilidad.ts');
    throw new Error(`Unexpected import ${name}`);
  };
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
  vm.runInNewContext(code, { exports, require });
  return exports;
};
const es = JSON.parse(fs.readFileSync('src/locales/es.json', 'utf8'));
const t = (path) => path.split('.').reduce((v, k) => v?.[k], es) ?? path;
const u = load('src/utils/contabilidad.ts');
const { canNavigate, availableTasks, priorityTasks } = load('src/utils/taskNavigation.ts');
const { NAVIGATION_ITEMS } = load('src/config/navigation.ts');
const { CATALOGO_MODULOS, OPT_IN_MODULES, modulosPorDefecto } = load('src/config/modulesCatalog.ts');
const tenant = (modulos) => ({ id: 't', nombreComercial: 'T', modulosHabilitados: modulos });

test('menú: Contabilidad solo para ADMIN y CONTADOR y solo con el módulo contratado', () => {
  const item = NAVIGATION_ITEMS.find(i => i.key === 'contabilidad');
  assert.deepEqual([...item.allowedRoles], ['ADMIN', 'CONTADOR']);
  assert.equal(item.moduleKey, 'contabilidad');
  for (const rol of ['ADMIN', 'CONTADOR']) {
    assert.equal(canNavigate(item, { rol }, tenant(['contabilidad'])), true);
    assert.equal(canNavigate(item, { rol }, tenant(['pos'])), false);
    // Sin lista del servidor (sesión antigua) un módulo opcional se considera apagado.
    assert.equal(canNavigate(item, { rol }, tenant(undefined)), false);
  }
  for (const rol of ['CAJERO', 'VENDEDOR', 'BODEGUERO', 'SUPERADMIN']) assert.equal(canNavigate(item, { rol }, tenant(['contabilidad'])), false);
  assert.equal(canNavigate(item, { rol: 'CONTADOR', permisosConfigurados: true, permisos: [] }, tenant(['contabilidad'])), false);
});

test('el CONTADOR no ve accesos de ventas, cobros, inventario ni caja', () => {
  const todos = CATALOGO_MODULOS.map(m => m.key);
  const tareas = Array.from(availableTasks({ rol: 'CONTADOR' }, tenant(todos)), i => i.key);
  assert.deepEqual(tareas, ['contabilidad']);
  assert.deepEqual(Array.from(priorityTasks({ rol: 'CONTADOR' }, tenant(todos)), i => i.key), ['contabilidad']);
});

test('catálogo: módulo opcional, no esencial, fuera de los módulos supuestos por defecto', () => {
  const m = CATALOGO_MODULOS.find(x => x.key === 'contabilidad');
  assert.ok(m && !m.isCore);
  assert.ok(OPT_IN_MODULES.has('contabilidad'));
  assert.equal(modulosPorDefecto().includes('contabilidad'), false);
  assert.ok(modulosPorDefecto().includes('pos'));
});

test('Usuarios ofrece el rol CONTADOR con permisos de contabilidad y sin descuento', () => {
  const src = fs.readFileSync('src/pages/UsuariosPage.tsx', 'utf8');
  assert.match(src, /<option value="CONTADOR">CONTADOR<\/option>/);
  const bloque = src.slice(src.indexOf('CONTADOR: {'), src.indexOf('};', src.indexOf('CONTADOR: {')));
  assert.match(bloque, /permisos: \['contabilidad\.ver', 'contabilidad\.registrar'\]/);
  assert.match(bloque, /descuentoMaximo: 0/);
  assert.doesNotMatch(bloque, /pos\.|inventario\.|caja\./);
  for (const p of ['perm_cont_ver', 'perm_cont_registrar', 'perm_cont_configurar', 'perm_cont_cerrar']) assert.ok(es.users[p], p);
});

test('período por defecto: el mes anterior (también en enero)', () => {
  assert.deepEqual({ ...u.periodoAnterior('2026-10-20') }, { anio: 2026, mes: 9 });
  assert.deepEqual({ ...u.periodoAnterior('2027-01-05') }, { anio: 2026, mes: 12 });
  assert.equal(u.consultaPeriodo({ anio: 2026, mes: 9 }), 'anio=2026&mes=9');
});

test('número fiscal con el tipo correcto en el tercer grupo', () => {
  assert.equal(u.numeroFiscalValido('000-001-01-00000001', '01'), true);
  assert.equal(u.numeroFiscalValido('000-001-06-00000001', '01'), false);
  assert.equal(u.numeroFiscalValido('000-001-01-00000000', '01'), false);
  assert.equal(u.numeroFiscalValido('0000010100000001', '01'), false);
});

test('asiento: solo líneas completas, cuadre en centavos', () => {
  const r = u.prepararAsiento([{ cuentaId: 'a', debe: '0.1', haber: '' }, { cuentaId: 'b', debe: '0.2', haber: '' }, { cuentaId: 'c', debe: '', haber: '0.3' }, { cuentaId: '', debe: '5', haber: '' }]);
  assert.equal(r.lineas.length, 3);
  assert.equal(r.cuadra, true);
  assert.equal(u.prepararAsiento([{ cuentaId: 'a', debe: '10', haber: '' }, { cuentaId: 'b', debe: '', haber: '9.99' }]).cuadra, false);
  assert.equal(u.prepararAsiento([{ cuentaId: 'a', debe: '10', haber: '10' }, { cuentaId: 'b', debe: '', haber: '10' }]).cuadra, false);
});

test('hallazgos y errores del servidor se muestran traducidos', () => {
  for (const codigo of u.CODIGOS_HALLAZGO) assert.notEqual(u.etiquetaHallazgo(codigo, t), codigo, codigo);
  assert.equal(u.etiquetaHallazgo('DESCONOCIDO', t), 'DESCONOCIDO');
  const msg = u.mensajeError({ response: { data: { message: 'No cumple', hallazgos: ['SIN_CAI'] } } }, t, 'x');
  assert.equal(msg, `No cumple: ${es.accounting.finding.SIN_CAI}`);
  assert.equal(u.mensajeError({}, t, 'x'), es.accounting.network_error);
  assert.equal(u.nombreArchivo('attachment; filename="ventas-2026-09.xlsx"', 'r.xlsx'), 'ventas-2026-09.xlsx');
  assert.equal(u.importeOpcional(''), undefined);
  assert.equal(u.importeOpcional('12.5'), 12.5);
});

test('el inicio del CONTADOR lleva a Contabilidad y la ruta exige módulo, rol y permiso', () => {
  const app = fs.readFileSync('src/App.tsx', 'utf8');
  const guard = fs.readFileSync('src/components/ProtectedRoute.tsx', 'utf8');
  assert.match(guard, /pathname === '\/' && user\.rol === 'CONTADOR'\) return <Navigate to="\/contabilidad" replace \/>/);
  assert.match(app, /path="\/contabilidad" element=\{<ProtectedRoute allowedRoles=\{\['ADMIN', 'CONTADOR'\]\} requiredModule="contabilidad" requiredPermiso="contabilidad.ver">/);
});

test('nombre de archivo calculado en el cliente (no depende de la cabecera del servidor)', () => {
  assert.equal(u.nombreExportacion('ventas', 2026, 9, 'csv'), 'ventas-2026-09.csv');
  assert.equal(u.nombreExportacion('ventas', 2026, 9, 'xlsx'), 'ventas-2026-09.xlsx');
  assert.equal(u.nombreExportacion('mensual', 2026, 9, 'xlsx'), 'libro-contable-2026-09.xlsx');
  assert.equal(u.nombreExportacion('catalogo', 2026, 9, 'xlsx'), 'catalogo-2026.xlsx');
  assert.equal(u.nombreExportacion('periodos', 2026, 1, 'pdf'), 'periodos-2026.pdf');
});

test('errores de descarga (blob) muestran el mensaje del servidor', async () => {
  const blob = new Blob([JSON.stringify({ message: 'El libro contable del mes se descarga en Excel (.xlsx)' })], { type: 'application/json' });
  const msg = await u.mensajeErrorDescarga({ response: { data: blob } }, t, 'x');
  assert.equal(msg, 'El libro contable del mes se descarga en Excel (.xlsx)');
  assert.equal(await u.mensajeErrorDescarga({ response: { data: new Blob(['no json']) } }, t, 'respaldo'), 'respaldo');
  assert.equal(await u.mensajeErrorDescarga({}, t, 'sin red'), es.accounting.network_error);
});

// ---- Navegación del CONTADOR (secciones por tarea y frecuencia) ----
const nav = load('src/config/contadorNavigation.ts');
test('navegación del contador: Inicio primero, rutas únicas bajo /contabilidad y pestañas existentes', () => {
  assert.equal(nav.SECCIONES_PRINCIPALES[0].key, 'inicio');
  assert.equal(nav.SECCIONES_PRINCIPALES[0].route, '/contabilidad');
  const rutas = nav.SECCIONES_CONTADOR.map(s => s.route);
  assert.equal(new Set(rutas).size, rutas.length);
  for (const r of rutas) assert.ok(r === '/contabilidad' || r.startsWith('/contabilidad/'), r);
  const validas = new Set([...u.PESTANAS, 'asientos', 'catalogo', 'balanza', 'mayor', 'excel']);
  for (const s of nav.SECCIONES_CONTADOR) for (const tab of s.tabs) assert.ok(validas.has(tab), `${s.key}:${tab}`);
});
test('navegación del contador: cada etiqueta existe en ES y EN y no se ofrecen pantallas sin implementar', () => {
  const en = JSON.parse(fs.readFileSync('src/locales/en.json', 'utf8'));
  const tr = (d, path) => path.split('.').reduce((v, k) => v?.[k], d);
  for (const s of nav.SECCIONES_CONTADOR) { assert.ok(tr(es, s.labelKey), `es ${s.labelKey}`); assert.ok(tr(en, s.labelKey), `en ${s.labelKey}`); }
  const claves = nav.SECCIONES_CONTADOR.map(s => s.key);
  for (const pendiente of ['por_contabilizar', 'estados_financieros', 'importar']) assert.ok(!claves.includes(pendiente), pendiente);
});
test('navegación del contador: los permisos solo restringen a quien los tiene configurados (como el servidor)', () => {
  const todas = nav.SECCIONES_CONTADOR;
  assert.equal(nav.permitidas(todas, null).length, 0);
  assert.equal(nav.permitidas(todas, { rol: 'CONTADOR', permisosConfigurados: false }).length, todas.length);
  assert.equal(nav.permitidas(todas, { rol: 'ADMIN', permisosConfigurados: true, permisos: [] }).length, todas.length);
  assert.equal(nav.permitidas(todas, { rol: 'CONTADOR', permisosConfigurados: true, permisos: [] }).length, 0);
  assert.equal(nav.permitidas(todas, { rol: 'CONTADOR', permisosConfigurados: true, permisos: ['contabilidad.ver'] }).length, todas.length);
});
