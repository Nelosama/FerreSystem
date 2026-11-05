import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

// Carga módulos TypeScript del frontend con sus dependencias relativas, para probarlos en Node sin bundler.
// `externos` sustituye paquetes no relativos (p. ej. react o fake-indexeddb).
export function modulos(externos = {}) {
  const cache = new Map();
  function cargar(archivo) {
    const ruta = path.resolve(archivo);
    if (cache.has(ruta)) return cache.get(ruta);
    const modulo = { exports: {} };
    cache.set(ruta, modulo.exports);
    const codigo = ts.transpileModule(fs.readFileSync(ruta, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
    }).outputText;
    new Function('exports', 'require', 'module', codigo)(modulo.exports, (nombre) => {
      if (nombre in externos) return externos[nombre];
      if (!nombre.startsWith('.')) throw new Error(`dependencia no permitida en la prueba: ${nombre}`);
      return cargar(path.join(path.dirname(ruta), `${nombre}.ts`));
    }, modulo);
    return modulo.exports;
  }
  return cargar;
}
