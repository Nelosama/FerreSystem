import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

// Ejecuta el adaptador real. SweetAlert resuelve su resultado antes de didClose;
// retirar el contenedor del DOM tampoco garantiza que didClose ya se haya ejecutado.
function harness() {
  const calls = [];
  const swal = { mixin: () => ({ fire: async () => {} }), fire: options => new Promise(resolve => calls.push({ options, resolve })) };
  const context = { exports: {}, require: name => {
    if (name === 'sweetalert2') return { default: swal, __esModule: true };
    if (name.endsWith('.css')) return {};
    return { crearControlDuplicados: () => () => true, opcionesConfirmacion: x => x, textoTraducido: (_t, _k, s) => s };
  } };
  const code = ts.transpileModule(fs.readFileSync('src/utils/alertas.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
  vm.runInNewContext(code, context);
  return { alertas: context.exports.alertas, calls };
}
for (const isConfirmed of [false, true]) {
  test(`confirmar espera al cierre completo antes de liberar al consumidor (${isConfirmed ? 'aceptar' : 'cancelar'})`, async () => {
    const { alertas, calls } = harness();
    let settled = false;
    const first = alertas.confirmar({ texto: 'Descartar' }).then(result => { settled = true; return result; });
    calls[0].resolve({ isConfirmed });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(settled, false, 'el POS debe seguir bloqueado mientras el adaptador no admita el siguiente modal');
    assert.equal(await alertas.confirmar({ texto: 'Duplicada durante el cierre' }), false);
    assert.equal(calls.length, 1);
    calls[0].options.didClose();
    assert.equal(await first, isConfirmed);
    const second = alertas.confirmar({ texto: 'Reabrir' });
    assert.equal(calls.length, 2, 'el siguiente clic después del cierre debe abrir otra confirmación');
    calls[1].resolve({ isConfirmed: false });
    calls[1].options.didClose();
    assert.equal(await second, false);
  });
}
