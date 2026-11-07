import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import ts from 'typescript';

// Ejecutar el código real del cliente sin incorporarlo al programa de tipos del backend.
// La carga de tipos cruzada desplaza el directorio común de fuentes y rompe el lint TS6.
// payload.ts solo importa tipos: el JavaScript emitido no requiere dependencias del frontend.
const fuente = readFileSync(resolve('../frontend/src/offline/payload.ts'), 'utf8');
const codigo = ts.transpileModule(fuente, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const modulo = { exports: {} };
new Function('exports', 'module', codigo)(modulo.exports, modulo);
export const { aOperacionDto, payloadCanonico } = modulo.exports as {
  aOperacionDto: (op: any) => Record<string, unknown>;
  payloadCanonico: (op: any) => string;
};
