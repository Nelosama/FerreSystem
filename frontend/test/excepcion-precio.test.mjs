import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const file = 'src/utils/excepcionPrecio.ts';
const context = { exports: {} };
vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), { fileName: file, compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, context);
const { puedeExcepcionPrecio, motivoExcepcionValido, esRechazoPorPrecio, PERMISO_EXCEPCION_PRECIO, MOTIVO_EXCEPCION_MIN, MOTIVO_EXCEPCION_MAX } = context.exports;

test('mismas constantes que la política del servidor', () => {
  const backend = fs.readFileSync('../backend/src/ventas/politica-precio.ts', 'utf8');
  assert.match(backend, new RegExp(`PERMISO_EXCEPCION_PRECIO = '${PERMISO_EXCEPCION_PRECIO.replace('.', '\\.')}'`));
  assert.match(backend, new RegExp(`MOTIVO_EXCEPCION_MIN = ${MOTIVO_EXCEPCION_MIN};`));
  assert.match(backend, new RegExp(`MOTIVO_EXCEPCION_MAX = ${MOTIVO_EXCEPCION_MAX};`));
  // El mensaje del 409 que reconoce la interfaz sigue siendo el del servidor.
  const mensaje = backend.match(/ConflictException\('([^']+)'\)/)[1];
  assert.equal(esRechazoPorPrecio({ response: { status: 409, data: { message: mensaje } } }), true);
});

test('solo ADMIN con el permiso explícito; el rol no basta', () => {
  assert.equal(puedeExcepcionPrecio({ rol: 'ADMIN', permisos: ['pos.excepcion_precio'] }), true);
  assert.equal(puedeExcepcionPrecio({ rol: 'ADMIN', permisos: [] }), false);
  assert.equal(puedeExcepcionPrecio({ rol: 'ADMIN' }), false);
  assert.equal(puedeExcepcionPrecio({ rol: 'CAJERO', permisos: ['pos.excepcion_precio'] }), false);
  assert.equal(puedeExcepcionPrecio({ rol: 'SUPERADMIN', permisos: ['pos.excepcion_precio'] }), false);
  assert.equal(puedeExcepcionPrecio(null), false);
});

test('motivo de 10 a 300 caracteres tras recortar', () => {
  assert.equal(motivoExcepcionValido('123456789'), false);
  assert.equal(motivoExcepcionValido('   123456789   '), false);
  assert.equal(motivoExcepcionValido('1234567890'), true);
  assert.equal(motivoExcepcionValido('x'.repeat(300)), true);
  assert.equal(motivoExcepcionValido('x'.repeat(301)), false);
});

test('reconoce solo el 409 de la política de precio', () => {
  const err = (status, message) => ({ response: { status, data: { message } } });
  assert.equal(esRechazoPorPrecio(err(409, 'El precio cambió; actualice el catálogo o solicite al administrador')), true);
  assert.equal(esRechazoPorPrecio(err(409, 'Abra su caja antes de registrar ventas o pagos')), false);
  assert.equal(esRechazoPorPrecio(err(409, 'La solicitud ya fue utilizada para otra venta')), false);
  assert.equal(esRechazoPorPrecio(err(403, 'El precio cambió')), false);
  assert.equal(esRechazoPorPrecio(new Error('network')), false);
});
