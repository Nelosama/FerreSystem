import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
import * as renderer from '@react-pdf/renderer';

// Renderizador PDF real y datos ficticios. No acredita papel, corte ni impresora física.
const format = { exports: {} };
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/utils/formatoImpresion.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText, format);
const context = { exports: {}, require: name => {
  if (name === 'react') return React;
  if (name === '@react-pdf/renderer') return renderer;
  if (name.endsWith('/utils/formatoImpresion')) return format.exports;
  throw new Error(name);
} };
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/components/ReciboPDF.tsx', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: true },
}).outputText, context);
const tenant = { id: 'prueba-pdf', nombreComercial: 'Negocio ficticio', colorPrimario: '#0284C7' };
for (const tipo of ['VENTA', 'COTIZACION']) {
  for (const [formato, width] of [['A4', 595.28], ['ROLLO_80MM', 226.77], ['ROLLO_58MM', 164.41]]) {
    test(`PDF real ${tipo} ${formato}: documento válido y ancho de todas las páginas`, async () => {
      const pdf = await renderer.renderToBuffer(React.createElement(context.exports.ReciboPDF, {
        tipo, formato, tenant, numeroDocumento: 'PRUEBA-001', fechaEmision: '17/10/2026',
        clienteNombre: 'Cliente ficticio', subtotal: 100, isv: 15, total: 115,
        items: [{ codigo: 'P-001', descripcion: 'Producto de prueba con descripción larga para rollo', cantidad: 2.5, precioUnitario: 40, subtotal: 100, isv: 15, totalLinea: 115 }],
      }));
      const content = pdf.toString('latin1');
      assert.ok(content.startsWith('%PDF-'));
      const pages = [...content.matchAll(/\/MediaBox\s*\[0 0 ([\d.]+) ([\d.]+)\]/g)];
      assert.ok(pages.length > 0);
      for (const page of pages) {
        assert.ok(Math.abs(Number(page[1]) - width) < 0.02);
        assert.ok(Number(page[2]) > 0);
      }
      assert.match(content, /%%EOF/);
    });
  }
}
