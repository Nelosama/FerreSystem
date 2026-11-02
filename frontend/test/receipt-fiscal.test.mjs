import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
const Block = ({ children }) => React.createElement('div', null, children);
const letras={}; vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/utils/montoEnLetras.ts','utf8'),{ compilerOptions:{ module:ts.ModuleKind.CommonJS } }).outputText,{ exports:letras });
const fmt={}; vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/utils/formatoImpresion.ts','utf8'),{ compilerOptions:{ module:ts.ModuleKind.CommonJS } }).outputText,{ exports:fmt, require:()=>{throw new Error('dep');} });
const context={ exports:{}, require:name=>{
  if(name==='react')return React;
  if(name==='@react-pdf/renderer')return { Document:Block, Page:Block, Text:Block, View:Block, Image:()=>null, StyleSheet:{ create:value=>value } };
  if(name.endsWith('/utils/formatoImpresion'))return fmt;
  if(name.endsWith('/utils/montoEnLetras'))return letras;
  throw new Error(name);
} };
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/components/ReciboPDF.tsx','utf8'),{ compilerOptions:{ module:ts.ModuleKind.CommonJS, jsx:ts.JsxEmit.React, esModuleInterop:true } }).outputText,context);
const { ReciboPDF }=context.exports;
const render=props=>renderToStaticMarkup(React.createElement(ReciboPDF,props));
const legacySale={ tipo:'VENTA', numeroDocumento:42, fechaEmision:'2026-01-02', clienteNombre:'Cliente anterior', subtotal:100, isv:15, total:115, items:[{ descripcion:'Cable', cantidad:1, precioUnitario:100, subtotal:100, totalLinea:100 }] };
const tenant={ id:'A', nombreComercial:'Empresa', colorPrimario:'#0284C7', moneda:{ simbolo:'L.', codigo:'HNL' }, impuesto:{ nombre:'ISV', tasa:15 } };
test('comprobante de venta anterior conserva dinero e ISV al cambiar configuración visual fiscal antigua',()=>{
  const first=render({ ...legacySale,tenant });
  const after=render({ ...legacySale,tenant:{ ...tenant, moneda:{ simbolo:'$', codigo:'USD' }, impuesto:{ nombre:'VAT', tasa:0 } } });
  assert.equal(after,first); assert.match(after,/L\. 115\.00/); assert.match(after,/ISV:/);
  assert.doesNotMatch(after,/VAT|USD|\$|\(0%\)|\(15%\)/);
});
test('cotización con ISV transaccional mixto no se etiqueta con tasa global del tenant',()=>{
  const props={ ...legacySale, tipo:'COTIZACION', subtotal:100, isv:7.5, total:107.5, items:[{ descripcion:'Exento', cantidad:1, precioUnitario:50, subtotal:50,isv:0,totalLinea:50 },{ descripcion:'Gravado', cantidad:1,precioUnitario:50,subtotal:50,isv:7.5,totalLinea:57.5 }] };
  const html=render({ ...props,tenant:{ ...tenant, impuesto:{ nombre:'Otro', tasa:18 } } });
  assert.match(html,/L\. 7\.50/); assert.match(html,/L\. 107\.50/);
  assert.match(html,/ISV:/); assert.doesNotMatch(html,/%|Otro/);
});
test('usa tasa transaccional de cotización, incluido cero, cuando el contrato la proporciona',()=>{
  for (const rate of [0,15]) {
    const html=render({ ...legacySale,tipo:'COTIZACION',porcentajeIsv:rate,isv:rate,total:100+rate,tenant:{ ...tenant,impuesto:{nombre:'VAT',tasa:18} } });
    assert.ok(html.includes(`ISV (${rate}%, salvo exentos):`)); assert.doesNotMatch(html,/18%|VAT/);
  }
});
test('comprobante de venta con formato de factura sin CAI ni leyenda: desglose y cantidad en letras',()=>{
  const html=render({ ...legacySale,subtotal:120,descuento:20,isv:15,total:115,tenant });
  assert.match(html,/Importe exento:/); assert.match(html,/L\. 0\.00/);
  assert.match(html,/Importe gravado:/); assert.match(html,/L\. 100\.00/);
  assert.match(html,/CIENTO QUINCE LEMPIRAS CON 00\/100/);
  assert.match(html,/Empresa/);
  assert.doesNotMatch(html,/CAI|RANGO AUTORIZADO|no fiscal|FACTURA/i);
});
test('cotización no lleva desglose de venta ni cantidad en letras',()=>{
  const html=render({ ...legacySale,tipo:'COTIZACION',tenant });
  assert.doesNotMatch(html,/Importe gravado|Cantidad en letras/);
});
test('comprobante muestra el RTN del emisor bajo el nombre solo cuando existe',()=>{
  const con=render({ ...legacySale,tenant:{ ...tenant, rtn:'08019999000000' } });
  assert.match(con,/RTN: 08019999000000/);
  const sin=render({ ...legacySale,tenant:{ ...tenant, rtn:null } });
  assert.doesNotMatch(sin,/RTN:/);
});
