import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const context = { exports: {} };
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/utils/tenantSettings.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, context);
const { normalizeTenantSettings: normalize, TenantSettingsReads } = context.exports;
test('configuracion vacía reconstruye defaults sin heredar la caché; conserva solo sucursal', () => {
  const cached = { id: 'A', sucursal: 'Norte', templateVersion: 'v2', v2Mode: 'dark', fuenteTitulos: 'Poppins', moneda: { codigo: 'USD' }, impuesto: { tasa: 0 }, direccion: 'Antigua', modoNavegacion: 'TOPNAV', modulosHabilitados: ['pos'] };
  const current = normalize({ id: 'A', configuracion: {}, modulosHabilitados: [] }, cached);
  assert.equal(current.templateVersion, 'v1'); assert.equal(current.v2Mode, 'light');
  assert.equal(current.fuenteTitulos, 'Archivo'); assert.equal(current.moneda.codigo, 'HNL');
  assert.equal(current.impuesto.tasa, 15); assert.equal(current.direccion, '');
  assert.equal(current.modoNavegacion, 'SIDEBAR'); assert.equal(current.modulosHabilitados.length, 0);
  assert.equal(current.sucursal, 'Norte');
});
test('respuesta más antigua no revierte configuración por orden ni versión del servidor', () => {
  const reads = new TenantSettingsReads(); const first = reads.begin(); const second = reads.begin();
  const latest = normalize({ id: 'A', updatedAt: '2026-10-06T12:00:00Z' });
  assert.equal(reads.accepts(first, latest, latest), false);
  assert.equal(reads.accepts(second, latest, latest), true);
  assert.equal(reads.accepts(second, normalize({ id: 'A', updatedAt: '2026-10-06T11:00:00Z' }), latest), false);
  assert.equal(reads.accepts(second, normalize({ id: 'A' }), latest), false);
});
test('guardar o cambiar sesión/tenant invalida todas las lecturas anteriores', () => {
  const reads = new TenantSettingsReads(); const first = reads.begin();
  const current = normalize({ id: 'A' }); reads.invalidate();
  assert.equal(reads.accepts(first, current, current), false);
  const next = reads.begin(); assert.equal(reads.accepts(next, normalize({ id: 'B' }), current), false);
});
