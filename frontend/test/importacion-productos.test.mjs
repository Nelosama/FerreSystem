import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

// Carga el módulo puro real (sin mocks): las reglas que se prueban son las que se envían al servidor.
const evaluar = (file, globals = {}) => {
  const salida = {};
  const contexto = {
    exports: salida,
    crypto: globalThis.crypto,
    ...globals,
    require: (name) => (name.endsWith('/unidadMedida') ? evaluar('src/utils/unidadMedida.ts') : undefined),
  };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, contexto);
  return salida;
};
const imp = evaluar('src/utils/importacionProductos.ts');

const fila = (sobrescritos = {}) => ({
  codigo: 'CLV-1', nombre: 'Clavo 2 pulgadas', categoria: 'Tornillería', unidadMedida: 'UNIDAD',
  stockActual: '10', stockMinimo: '2', precioCosto: '50.00', precioVenta: '85.00', ...sobrescritos,
});
const admin = { existentes: [], sobrescribir: false, aprobarPrecios: false, puedePrecios: true };

test('celda de precio vacía es «no informado»: nunca se envía como 0', () => {
  const { filas, resumen } = imp.prepararPrevia([fila({ precioVenta: '', precioCosto: '' })], admin);
  assert.equal(resumen.conError, 0);
  assert.equal(filas[0].envio.precioVenta, undefined);
  assert.equal(filas[0].envio.precioCosto, undefined);
  assert.equal(filas[0].estadoPrecioPrevisto, 'SIN_PRECIO');
});

test('precio de venta 0 o negativo bloquea la fila; costo 0 explícito sí se acepta', () => {
  const cero = imp.prepararPrevia([fila({ precioVenta: '0' })], admin);
  assert.equal(cero.filas[0].accion, 'ERROR');
  assert.ok(cero.filas[0].errores.some((e) => e.campo === 'precioVenta'));
  const negativo = imp.prepararPrevia([fila({ precioVenta: '-5' })], admin);
  assert.equal(negativo.filas[0].accion, 'ERROR');
  const costoCero = imp.prepararPrevia([fila({ precioCosto: '0' })], admin);
  assert.equal(costoCero.filas[0].accion, 'NUEVO');
  assert.equal(costoCero.filas[0].envio.precioCosto, '0.00');
});

test('coma decimal de Excel se acepta; más de dos decimales o separador de miles no', () => {
  assert.equal(imp.importeParaEnvio('2,5').valor, '2.50');
  assert.equal(imp.importeParaEnvio('25.99').valor, '25.99');
  assert.equal(imp.importeParaEnvio('2.555').error, 'admite como máximo dos decimales');
  assert.ok(imp.importeParaEnvio('1,000.5').error);
  const r = imp.prepararPrevia([fila({ stockActual: '2,75' })], admin);
  assert.equal(r.filas[0].envio.stockActual, '2.75');
});

test('código o código de barras repetidos en el archivo bloquean todas las filas del grupo', () => {
  const { filas, resumen } = imp.prepararPrevia([fila(), fila({ nombre: 'Otro' }), fila({ codigo: 'OTRO', codigoBarras: '111' }), fila({ codigo: 'X', codigoBarras: '111' })], admin);
  assert.equal(filas[0].accion, 'ERROR');
  assert.equal(filas[1].accion, 'ERROR');
  assert.equal(filas[2].accion, 'ERROR');
  assert.equal(filas[3].accion, 'ERROR');
  assert.equal(resumen.conError, 4);
});

test('código existente se omite sin sobrescribir y se actualiza con la casilla; no cuenta como error', () => {
  const existentes = [{ id: 'p1', codigo: 'CLV-1', nombre: 'Clavo', precioVenta: 80, precioAprobado: true, estadoPrecio: 'APROBADO' }];
  const omitir = imp.prepararPrevia([fila()], { ...admin, existentes, sobrescribir: false });
  assert.equal(omitir.filas[0].accion, 'OMITIR');
  assert.equal(omitir.filas[0].estadoPrecioPrevisto, 'APROBADO');
  const actualizar = imp.prepararPrevia([fila()], { ...admin, existentes, sobrescribir: true });
  assert.equal(actualizar.filas[0].accion, 'ACTUALIZAR');
  assert.equal(actualizar.resumen.conError, 0);
});

test('sin aprobación el precio queda pendiente; con aprobación de ADMIN queda aprobado', () => {
  const pendiente = imp.prepararPrevia([fila()], admin);
  assert.equal(pendiente.filas[0].estadoPrecioPrevisto, 'PENDIENTE_APROBACION');
  const aprobado = imp.prepararPrevia([fila()], { ...admin, aprobarPrecios: true });
  assert.equal(aprobado.filas[0].estadoPrecioPrevisto, 'APROBADO');
  const solicitud = imp.construirSolicitud(aprobado.filas, { sobrescribir: false, aprobarPrecios: true, puedePrecios: true }, 'id');
  assert.equal(solicitud.aprobarPrecios, true);
});

test('un producto existente con precio aprobado conserva su precio si la fila no trae precio (no baja a L.0.00)', () => {
  const existentes = [{ id: 'p1', codigo: 'CLV-1', nombre: 'Clavo', precioVenta: 80, precioAprobado: true, estadoPrecio: 'APROBADO' }];
  const r = imp.prepararPrevia([fila({ precioVenta: '' })], { ...admin, existentes, sobrescribir: true });
  assert.equal(r.filas[0].envio.precioVenta, undefined);
  assert.equal(r.filas[0].estadoPrecioPrevisto, 'APROBADO');
});

test('un cambio de precio sobre un producto aprobado lo deja pendiente si no se aprueba', () => {
  const existentes = [{ id: 'p1', codigo: 'CLV-1', nombre: 'Clavo', precioVenta: 80, precioAprobado: true, estadoPrecio: 'APROBADO' }];
  const r = imp.prepararPrevia([fila({ precioVenta: '90' })], { ...admin, existentes, sobrescribir: true });
  assert.equal(r.filas[0].estadoPrecioPrevisto, 'PENDIENTE_APROBACION');
});

test('BODEGUERO no envía precios: se ignoran con aviso y el cuerpo no los contiene', () => {
  const { filas, avisos } = imp.prepararPrevia([fila()], { ...admin, puedePrecios: false });
  assert.ok(avisos.length === 1 && avisos[0].includes('solo el administrador'));
  assert.equal(filas[0].envio.precioVenta, undefined);
  assert.equal(filas[0].envio.precioCosto, undefined);
  assert.equal(filas[0].estadoPrecioPrevisto, null);
  const cuerpo = imp.construirSolicitud(filas, { sobrescribir: false, aprobarPrecios: false, puedePrecios: false }, 'id');
  assert.equal('aprobarPrecios' in cuerpo, false);
  assert.equal(JSON.stringify(cuerpo).includes('precio'), false);
});

test('código de barras de otro producto existente bloquea la fila', () => {
  const existentes = [{ id: 'p9', codigo: 'OTRO', nombre: 'Otro', codigoBarras: '7501', precioVenta: 1 }];
  const r = imp.prepararPrevia([fila({ codigoBarras: '7501' })], { ...admin, existentes });
  assert.equal(r.filas[0].accion, 'ERROR');
  assert.ok(r.filas[0].errores.some((e) => e.campo === 'codigoBarras'));
});

test('nombres parecidos con otro código avisan sin bloquear', () => {
  const existentes = [{ id: 'p1', codigo: 'CLV-9', nombre: 'Clavo 2 Pulgadas', precioVenta: 80 }];
  const r = imp.prepararPrevia([fila({ nombre: 'clavo 2  pulgadas' })], { ...admin, existentes });
  assert.equal(r.filas[0].accion, 'NUEVO');
  assert.ok(r.filas[0].advertencias.some((a) => a.includes('CLV-9')));
  const dentro = imp.prepararPrevia([fila(), fila({ codigo: 'CLV-2' })], admin);
  assert.ok(dentro.filas[0].advertencias.length === 1 && dentro.filas[1].advertencias.length === 1);
  assert.equal(dentro.resumen.conError, 0);
});

test('el solicitudId no forma parte de la huella; cambiar un dato o una opción sí la cambia', () => {
  const base = imp.construirSolicitud(imp.prepararPrevia([fila()], admin).filas, { sobrescribir: false, aprobarPrecios: false, puedePrecios: true }, 'A');
  const mismo = imp.construirSolicitud(imp.prepararPrevia([fila()], admin).filas, { sobrescribir: false, aprobarPrecios: false, puedePrecios: true }, 'B');
  assert.equal(imp.huellaSolicitud(base), imp.huellaSolicitud(mismo));
  const conSobrescribir = imp.construirSolicitud(imp.prepararPrevia([fila()], admin).filas, { sobrescribir: true, aprobarPrecios: false, puedePrecios: true }, 'A');
  assert.notEqual(imp.huellaSolicitud(base), imp.huellaSolicitud(conSobrescribir));
});

test('nuevoSolicitudId genera UUID v4 válidos', () => {
  for (let i = 0; i < 20; i++) {
    assert.match(imp.nuevoSolicitudId(), /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  }
});

test('errores del servidor: 400 muestra errores por fila; 403 es de permisos; 409 pide nueva solicitud o recarga', () => {
  const e400 = imp.interpretarErrorImportacion({ response: { status: 400, data: { code: 'IMPORTACION_INVALIDA', errores: [{ fila: 3, campo: 'precioVenta', mensaje: 'cero' }] } } });
  assert.equal(e400.tipo, 'VALIDACION');
  assert.deepEqual(e400.errores, [{ fila: 3, campo: 'precioVenta', mensaje: 'cero' }]);
  assert.equal(imp.interpretarErrorImportacion({ response: { status: 403, data: {} } }).tipo, 'PERMISO');
  const version = imp.interpretarErrorImportacion({ response: { status: 409, data: { code: 'PRODUCTO_VERSION' } } });
  assert.equal(version.tipo, 'CONFLICTO');
  assert.equal(version.recargar, true);
  assert.equal(version.nuevaSolicitud, true);
  const reutilizado = imp.interpretarErrorImportacion({ response: { status: 409, data: { message: 'La solicitud de importación ya se utilizó con otros datos' } } });
  assert.equal(reutilizado.nuevaSolicitud, true);
  assert.equal(reutilizado.recargar, false);
});

test('sin respuesta del servidor se conserva el solicitudId para reintentar sin duplicar', () => {
  assert.equal(imp.interpretarErrorImportacion(new Error('Network Error')).tipo, 'RED');
  assert.equal(imp.interpretarErrorImportacion({ response: { status: 500, data: {} } }).tipo, 'RED');
});

test('archivo con más filas que el límite no se envía desde la lógica (el modal lo bloquea antes)', () => {
  assert.equal(imp.MAX_FILAS_IMPORTACION, 5000);
});
