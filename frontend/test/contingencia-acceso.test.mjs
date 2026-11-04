import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

// P1-3 / P1-4 (AUDITORIA_OFFLINE_ALMACENAMIENTO_20261104): acceso al diario local por empresa, usuario y rol.
function cargar(archivo) {
  const codigo = ts.transpileModule(fs.readFileSync(archivo, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const modulo = { exports: {} };
  new Function('exports', 'require', 'module', codigo)(modulo.exports, (n) => { throw new Error(`dependencia inesperada ${n}`); }, modulo);
  return modulo.exports;
}
const acceso = cargar('src/offline/acceso.ts');

// Equipo compartido: empresa A (admin A, cajeros A1 y A2, vendedor A) y empresa B (admin B, cajero B1).
const op = (operacionId, cajeroId, extra = {}) => ({
  operacionId, cajeroId, ventanaId: 'ventana-vieja', correlativoLocal: operacionId, clienteNombre: `Cliente ${operacionId}`,
  clienteRtn: `RTN-${operacionId}`, totalCentavos: 1150, estado: 'PENDIENTE', conflictos: [], lineas: [], ...extra,
});
const OPS = [
  op('a1-nueva', 'cajero-a1', { tenantId: 'A' }),
  op('a2-nueva', 'cajero-a2', { tenantId: 'A', estado: 'SINCRONIZADA' }),
  op('b1-nueva', 'cajero-b1', { tenantId: 'B' }),
  op('a1-antigua', 'cajero-a1'),                         // anterior a esta versión, sin empresa y sin ventana local
  op('a2-antigua-ventana', 'cajero-a2', { ventanaId: 'ventana-a' }), // anterior, deducible por la ventana local de A
  op('b1-antigua', 'cajero-b1', { estado: 'REVISION' }),  // anterior, de B, sin evidencia de empresa
  op('falsificada', 'cajero-a1', { tenantId: 'B' }),      // id de A con empresa B: prevalece la empresa
];
const VENTANA_A = { ventanaId: 'ventana-a', tenantId: 'A' };
const sesion = (usuarioId, rol, tenantId) => ({ usuarioId, rol, tenantId });
const visiblesPara = (s, ventana = VENTANA_A) => acceso.diarioVisible(OPS, s, ventana).visibles.map((o) => o.operacionId).sort();

test('ADMIN de A ve las operaciones de su empresa (nuevas y deducibles) y ninguna de B', () => {
  assert.deepEqual(visiblesPara(sesion('admin-a', 'ADMIN', 'A')), ['a1-nueva', 'a2-antigua-ventana', 'a2-nueva']);
});
test('ADMIN de B ve solo las que declaran empresa B; nunca las de A ni las antiguas sin evidencia', () => {
  // «falsificada» declara empresa B en el registro: prevalece la empresa registrada.
  assert.deepEqual(visiblesPara(sesion('admin-b', 'ADMIN', 'B'), null), ['b1-nueva', 'falsificada']);
});
test('una operación con id de cajero de A y empresa B no se muestra en A', () => {
  for (const s of [sesion('cajero-a1', 'CAJERO', 'A'), sesion('admin-a', 'ADMIN', 'A')]) assert.ok(!visiblesPara(s).includes('falsificada'));
});
test('CAJERO A1 solo ve y reimprime las suyas, incluidas las antiguas sin empresa', () => {
  assert.deepEqual(visiblesPara(sesion('cajero-a1', 'CAJERO', 'A')), ['a1-antigua', 'a1-nueva']);
});
test('CAJERO A2 no ve las de A1 aunque sean de la misma empresa', () => {
  assert.deepEqual(visiblesPara(sesion('cajero-a2', 'CAJERO', 'A')), ['a2-antigua-ventana', 'a2-nueva']);
});
test('CAJERO B1 ve las suyas (también la antigua en revisión) y ninguna de A', () => {
  assert.deepEqual(visiblesPara(sesion('cajero-b1', 'CAJERO', 'B'), null), ['b1-antigua', 'b1-nueva']);
});
for (const rol of ['VENDEDOR', 'BODEGUERO', 'CONTADOR', 'SUPERADMIN', '', undefined]) {
  test(`rol ${JSON.stringify(rol)} no ve ninguna operación del diario, ni siquiera con su propio id`, () => {
    assert.deepEqual(visiblesPara(sesion('cajero-a1', rol, 'A')), []);
    assert.equal(acceso.puedeAbrirDiario(rol), false);
  });
}
test('sin sesión o sin empresa no se ve nada', () => {
  assert.deepEqual(acceso.diarioVisible(OPS, null, VENTANA_A), { visibles: [], noVisibles: OPS.length });
  assert.deepEqual(visiblesPara(sesion('admin-a', 'ADMIN', '')), []);
  assert.deepEqual(visiblesPara(sesion('', 'CAJERO', 'A')), []);
});
test('ADMIN de A no ve antiguas de otros cajeros sin evidencia de empresa (no se adivina)', () => {
  const vis = visiblesPara(sesion('admin-a', 'ADMIN', 'A'));
  assert.ok(!vis.includes('a1-antigua'));
  assert.ok(!vis.includes('b1-antigua'));
});
test('lo no visible no se borra ni se modifica: solo se informa la cantidad', () => {
  const copia = structuredClone(OPS);
  const r = acceso.diarioVisible(OPS, sesion('cajero-a2', 'CAJERO', 'A'), VENTANA_A);
  assert.deepEqual(OPS, copia);
  assert.equal(r.visibles.length + r.noVisibles, OPS.length);
  assert.ok(r.visibles.every((o) => OPS.includes(o)));
});
test('la exportación contiene solo lo visible: sin nombres, RTN ni importes de otras empresas o cajeros', () => {
  const s = sesion('cajero-a1', 'CAJERO', 'A');
  const { visibles } = acceso.diarioVisible(OPS, s, VENTANA_A);
  const texto = acceso.exportarDiarioVisible(visibles, { id: 'disp', codigo: '01' }, s, new Date('2026-11-04T12:00:00Z'));
  for (const ajeno of ['b1-nueva', 'b1-antigua', 'a2-nueva', 'a2-antigua-ventana', 'falsificada']) {
    assert.ok(!texto.includes(`Cliente ${ajeno}`), ajeno);
    assert.ok(!texto.includes(`RTN-${ajeno}`), ajeno);
  }
  const json = JSON.parse(texto);
  assert.deepEqual(json.alcance, { tenantId: 'A', usuarioId: 'cajero-a1', rol: 'CAJERO' });
  assert.deepEqual(json.operaciones.map((o) => o.operacionId).sort(), ['a1-antigua', 'a1-nueva']);
  assert.ok(!/token|password|contrase/i.test(texto));
});
test('empresaDeOperacion: registro > ventana local > desconocida', () => {
  assert.equal(acceso.empresaDeOperacion({ tenantId: 'B', ventanaId: 'ventana-a' }, VENTANA_A), 'B');
  assert.equal(acceso.empresaDeOperacion({ ventanaId: 'ventana-a' }, VENTANA_A), 'A');
  assert.equal(acceso.empresaDeOperacion({ ventanaId: 'otra' }, VENTANA_A), undefined);
  assert.equal(acceso.empresaDeOperacion({ ventanaId: 'ventana-a' }, null), undefined);
  assert.equal(acceso.empresaDeOperacion({ tenantId: '', ventanaId: 'x' }, { ventanaId: 'x', tenantId: '' }), undefined);
});

// Integración en la página y la ruta (lectura de fuente; los E2E cubren el comportamiento en el navegador).
const pagina = fs.readFileSync('src/pages/PosContingenciaPage.tsx', 'utf8');
const app = fs.readFileSync('src/App.tsx', 'utf8');
test('la ruta /pos-contingencia excluye a VENDEDOR', () => {
  const ruta = app.split('\n').find((l) => l.includes('path="/pos-contingencia"'));
  assert.match(ruta, /allowedRoles=\{\['ADMIN', 'CAJERO'\]\}/);
  assert.ok(!ruta.includes('VENDEDOR'));
});
test('la página lista, cuenta, reimprime y exporta desde el diario visible, no desde todo el almacén', () => {
  assert.ok(!/\[\.\.\.ops\]\.reverse\(\)/.test(pagina), 'la lista no debe recorrer todas las operaciones');
  assert.match(pagina, /\[\.\.\.visibles\]\.reverse\(\)/);
  assert.match(pagina, /cuentaPorEstado\(visibles\)/);
  assert.match(pagina, /if \(!sesionDiario \|\| !puedeVerOperacion\(operacion, sesionDiario, ventana\)\) return;/);
  assert.match(pagina, /exportarDiarioVisible\(visibles/);
  assert.ok(!/exportarDiario\(\)/.test(pagina), 'no debe exportar el diario completo');
  // El cupo sí cuenta todas las ventas de la ventana para no vender de más.
  assert.match(pagina, /vendidoPorProducto\(ops, ventana\.ventanaId\)/);
});
test('cada venta nueva guarda su empresa en el mismo registro y no la envía al servidor', () => {
  assert.match(pagina, /const nueva: NuevaOperacion & \{ tenantId: string \} = \{\s*tenantId:/);
  const sync = fs.readFileSync('src/offline/sync.ts', 'utf8');
  const dto = sync.slice(sync.indexOf('export function aOperacionDto'), sync.indexOf('// ─────────────', sync.indexOf('export function aOperacionDto')));
  assert.ok(!dto.includes('tenantId'), 'el DTO del servidor no debe cambiar');
});
test('no se cambia el esquema IndexedDB (versión 1, mismos almacenes)', () => {
  const db = fs.readFileSync('src/offline/db.ts', 'utf8');
  assert.match(db, /indexedDB\.open\(NOMBRE_BASE, 1\)/);
  assert.match(db, /const NOMBRE_BASE = 'ferresystem-contingencia';/);
});
