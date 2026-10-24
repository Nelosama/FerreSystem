/**
 * alertas-guard.test.mjs
 *
 * Evita que vuelvan a entrar diálogos nativos (alert / window.confirm) en la interfaz: las notificaciones y
 * confirmaciones pasan por src/utils/alertas.ts. También comprueba que sus textos existan en ES y EN.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const RAIZ = 'src';

function archivosFuente(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entrada) => {
    const ruta = path.join(dir, entrada.name);
    if (entrada.isDirectory()) return archivosFuente(ruta);
    return /\.(tsx?|jsx?)$/.test(entrada.name) ? [ruta] : [];
  });
}

const NATIVO = /(^|[^\w.$])(window\.)?(alert|confirm)\s*\(/;

test('no quedan alert() ni window.confirm() nativos en src', () => {
  const infractores = [];
  for (const archivo of archivosFuente(RAIZ)) {
    fs.readFileSync(archivo, 'utf8').split('\n').forEach((linea, i) => {
      if (NATIVO.test(linea)) infractores.push(`${archivo}:${i + 1}`);
    });
  }
  assert.deepEqual(infractores, []);
});

test('los puntos migrados importan el servicio de alertas', () => {
  const migrados = [
    'src/components/ProductoGestion.tsx',
    'src/components/ProveedoresProductoPanel.tsx',
    'src/components/ProveedoresGestion.tsx',
    'src/components/LogotipoNegocioEditor.tsx',
    'src/components/SoporteBanner.tsx',
    'src/pages/OperacionesPage.tsx',
    'src/pages/LevantamientoPage.tsx',
    'src/pages/ArqueoCajaPage.tsx',
    'src/pages/NegocioDetallePage.tsx',
    'src/pages/SuperAdminPage.tsx',
    'src/utils/csvExport.ts',
    'src/utils/excelExport.ts',
  ];
  for (const archivo of migrados) {
    assert.match(fs.readFileSync(archivo, 'utf8'), /from '(\.\.\/)+utils\/alertas'|from '\.\/alertas'/, archivo);
  }
});

test('las claves alerts.* existen en español e inglés', () => {
  const claves = ['confirm_title', 'confirm', 'cancel', 'no_export_data'];
  for (const idioma of ['es', 'en']) {
    const diccionario = JSON.parse(fs.readFileSync(`${RAIZ}/locales/${idioma}.json`, 'utf8'));
    for (const clave of claves) {
      assert.equal(typeof diccionario.alerts?.[clave], 'string', `${idioma}: alerts.${clave}`);
    }
  }
});
