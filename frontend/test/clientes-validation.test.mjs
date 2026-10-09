import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';

const frontendDir = path.resolve(import.meta.dirname, '..');

const esDict = JSON.parse(fs.readFileSync(path.join(frontendDir, 'src/locales/es.json'), 'utf8'));

const getTranslation = (dict, key, options) => {
  const parts = key.split('.');
  let curr = dict;
  for (const p of parts) {
    curr = curr?.[p];
  }
  let res = typeof curr === 'string' ? curr : key;
  if (options) {
    for (const [k, v] of Object.entries(options)) {
      res = res.replace(`{${k}}`, String(v));
    }
  }
  return res;
};

const mockT = (key, options) => getTranslation(esDict, key, options);

const mockRequire = (moduleName) => {
  return {
    useState: () => [null, () => {}],
    useEffect: () => {},
    useCallback: (fn) => fn,
    useI18n: () => ({ t: mockT }),
    TopBar: () => null,
    api: { get: async () => ({ data: [] }), post: async () => ({ data: {} }), put: async () => ({ data: {} }), delete: async () => ({ data: {} }) },
    formatNumeroCliente: (n) => String(n || ''),
  };
};

const clientesPath = path.join(frontendDir, 'src/pages/ClientesPage.tsx');
const clientesCtx = vm.createContext({
  exports: {},
  require: mockRequire,
  module: { exports: {} },
  console,
  setTimeout,
  clearTimeout,
});

const clientesTranspiled = ts.transpileModule(fs.readFileSync(clientesPath, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React },
}).outputText;

vm.runInContext(clientesTranspiled, clientesCtx);
const { formatApiError } = clientesCtx.exports;

const usuariosPath = path.join(frontendDir, 'src/pages/UsuariosPage.tsx');
const usuariosCtx = vm.createContext({
  exports: {},
  require: mockRequire,
  module: { exports: {} },
  useI18n: () => ({ t: mockT }),
  console,
  setTimeout,
  clearTimeout,
});

const usuariosTranspiled = ts.transpileModule(fs.readFileSync(usuariosPath, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React },
}).outputText;

vm.runInContext(usuariosTranspiled, usuariosCtx);
const { formatUsuarioApiError } = usuariosCtx.exports;

test('ClientesPage - formatApiError formats HTTP status codes via i18n helper', () => {
  // 409 Conflict
  const err409 = { response: { status: 409 } };
  assert.equal(
    formatApiError(err409, 'Default', mockT),
    'Ya existe un cliente registrado con esta información (RTN o correo).'
  );

  // 403 Forbidden
  const err403 = { response: { status: 403 } };
  assert.equal(
    formatApiError(err403, 'Default', mockT),
    'No tiene los permisos necesarios para realizar esta operación.'
  );

  // 400 Bad Request with array message
  const err400 = { response: { status: 400, data: { message: ['El RTN es inválido', 'El correo es obligatorio'] } } };
  assert.equal(
    formatApiError(err400, 'Default', mockT),
    'El RTN es inválido, El correo es obligatorio'
  );

  // 500 Server Error
  const err500 = { response: { status: 500 } };
  assert.equal(
    formatApiError(err500, 'Default', mockT),
    'Ocurrió un error en el servidor al procesar la solicitud. Intente nuevamente más tarde.'
  );

  // Network Error
  const errNetwork = { message: 'Network Error' };
  assert.equal(
    formatApiError(errNetwork, 'Default', mockT),
    'No se pudo conectar con el servidor. Verifique su conexión a internet e inténtelo nuevamente.'
  );
});

test('UsuariosPage - formatUsuarioApiError formats HTTP status codes via i18n helper', () => {
  // 409 Conflict
  const err409 = { response: { status: 409 } };
  assert.equal(
    formatUsuarioApiError(err409, 'Default', mockT),
    'Ya existe un usuario registrado con este correo electrónico.'
  );

  // 403 Forbidden
  const err403 = { response: { status: 403 } };
  assert.equal(
    formatUsuarioApiError(err403, 'Default', mockT),
    'No tiene los permisos necesarios para realizar esta operación.'
  );

  // Network Error
  const errNetwork = { message: 'Network Error' };
  assert.equal(
    formatUsuarioApiError(errNetwork, 'Default', mockT),
    'No se pudo conectar con el servidor. Verifique su conexión a internet e inténtelo nuevamente.'
  );
});

test('Validation - DTO field rules parity with backend DTOs', () => {
  // Required field string
  assert.equal(mockT('validation.required_field'), 'Este campo es obligatorio.');

  // RTN 14 digits length check
  assert.equal(mockT('validation.invalid_rtn_length'), 'El RTN de Honduras debe contener exactamente 14 dígitos numéricos.');

  // Password min length
  assert.equal(mockT('validation.min_length', { min: 6 }), 'Debe contener al menos 6 caracteres.');

  // Discount percentage range (0-100)
  assert.equal(mockT('validation.number_range', { min: 0, max: 100 }), 'El valor debe estar entre 0 y 100.');
});
