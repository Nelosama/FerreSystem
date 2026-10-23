/**
 * alertas.test.mjs
 *
 * Servicio de notificaciones (src/utils/alertasOpciones.ts): textos con respaldo cuando falta la traducción,
 * opciones de confirmación (foco en Cancelar en acciones peligrosas) y control de mensajes duplicados.
 * Función pura, sin navegador ni SweetAlert2.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function load(file) {
  const out = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(out, { module, exports: module.exports, Math, Number, String });
  return module.exports;
}

const { iconoToast, duracionToast, textoTraducido, opcionesConfirmacion, crearControlDuplicados } = load('src/utils/alertasOpciones.ts');

const enIngles = (clave) => ({ 'alerts.confirm': 'Confirm', 'alerts.cancel': 'Cancel' })[clave] ?? clave;

test('iconos: éxito, error y advertencia tienen icono propio', () => {
  assert.equal(iconoToast('exito'), 'success');
  assert.equal(iconoToast('error'), 'error');
  assert.equal(iconoToast('advertencia'), 'warning');
});

test('duración: los errores permanecen más tiempo que los avisos de éxito', () => {
  assert.ok(duracionToast('error') > duracionToast('exito'));
  assert.equal(duracionToast('advertencia'), duracionToast('exito'));
});

test('textoTraducido usa la traducción cuando existe y el respaldo cuando la clave falta', () => {
  assert.equal(textoTraducido(enIngles, 'alerts.confirm', 'Confirmar'), 'Confirm');
  // Un traductor que devuelve la propia clave (I18nContext hace eso si falta) activa el respaldo.
  assert.equal(textoTraducido(enIngles, 'alerts.inexistente', 'Respaldo'), 'Respaldo');
  assert.equal(textoTraducido(null, 'alerts.confirm', 'Confirmar'), 'Confirmar');
});

test('confirmación normal: foco en Confirmar y botones del idioma activo', () => {
  const o = opcionesConfirmacion({ texto: 'Guardar cambios' }, enIngles);
  assert.equal(o.text, 'Guardar cambios');
  assert.equal(o.title, '¿Está seguro?');
  assert.equal(o.confirmButtonText, 'Confirm');
  assert.equal(o.cancelButtonText, 'Cancel');
  assert.equal(o.focusConfirm, true);
  assert.equal(o.focusCancel, false);
  assert.equal(o.icon, 'question');
});

test('confirmación peligrosa: foco inicial en Cancelar para evitar un Enter accidental', () => {
  const o = opcionesConfirmacion({ texto: '¿Desactivar?', peligroso: true, confirmar: 'Desactivar' }, null);
  assert.equal(o.confirmButtonText, 'Desactivar');
  assert.equal(o.cancelButtonText, 'Cancelar');
  assert.equal(o.focusConfirm, false);
  assert.equal(o.focusCancel, true);
  assert.equal(o.icon, 'warning');
});

test('título y botones explícitos prevalecen sobre el diccionario', () => {
  const o = opcionesConfirmacion({ texto: 'x', titulo: 'Título propio', cancelar: 'No' }, enIngles);
  assert.equal(o.title, 'Título propio');
  assert.equal(o.cancelButtonText, 'No');
  assert.equal(o.confirmButtonText, 'Confirm');
});

test('control de duplicados: bloquea el mismo mensaje dentro de la ventana y permite otro texto o pasado el tiempo', () => {
  const nuevo = crearControlDuplicados(2000);
  assert.equal(nuevo('Guardado', 1000), true);
  assert.equal(nuevo('Guardado', 1500), false, 'doble aviso inmediato');
  assert.equal(nuevo('Otro aviso', 1600), true, 'texto distinto sí se muestra');
  assert.equal(nuevo('Otro aviso', 1700), false);
  assert.equal(nuevo('Otro aviso', 3700), true, 'tras la ventana vuelve a mostrarse');
});

test('control de duplicados: instancias independientes no comparten estado', () => {
  const a = crearControlDuplicados();
  const b = crearControlDuplicados();
  assert.equal(a('Hola', 0), true);
  assert.equal(b('Hola', 0), true);
});
