/**
 * JW-08: edición de proveedores (src/utils/proveedorEdicion.ts). Solo se envían campos cambiados; vacío borra un dato
 * opcional; el nombre es obligatorio. El servidor se prueba en backend/test/proveedores-gestion.postgres.integration.ts.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const file = fs.existsSync('src/utils/proveedorEdicion.ts') ? 'src/utils/proveedorEdicion.ts' : 'frontend/src/utils/proveedorEdicion.ts';
const mod = { exports: {} };
vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, { module: mod, exports: mod.exports });
const { datosProveedor, cambiosProveedor } = mod.exports;

test('JW-08: datosProveedor convierte null y ausentes en cadenas vacías', () => {
  assert.deepEqual({ ...datosProveedor({ nombre: 'Norte', rtn: null }) }, { nombre: 'Norte', rtn: '', telefono: '', email: '', contacto: '', direccion: '' });
});

test('JW-08: solo se envían los campos cambiados, recortados; vaciar un campo envía cadena vacía', () => {
  const antes = datosProveedor({ nombre: 'Norte', telefono: '9999-0000' });
  const r = cambiosProveedor(antes, { ...antes, nombre: ' Norte ', rtn: ' 0801-1999-000123 ', telefono: '' });
  assert.equal(r.ok, true);
  assert.deepEqual({ ...r.cambios }, { rtn: '0801-1999-000123', telefono: '' });
});

test('JW-08: el nombre vacío se rechaza antes de enviar', () => {
  const r = cambiosProveedor(datosProveedor({ nombre: 'Norte' }), datosProveedor({ nombre: '   ' }));
  assert.equal(r.ok, false);
  assert.match(r.error, /obligatorio/);
});
