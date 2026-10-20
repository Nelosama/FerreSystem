/**
 * Formatos de salida de los libros: Excel (principal), CSV (secundario) y PDF (consulta e impresión).
 * Las tres salidas se generan desde las mismas hojas (excel.ts), de modo que no pueden divergir.
 * Ninguna descarga modifica la información contable.
 */
import { Hoja, Libro, Valor, aLibroXlsx, textoSeguro, valoresTotales, valorPlano } from './excel';

export type Formato = 'xlsx' | 'csv' | 'pdf';
export const FORMATOS_ADMITIDOS: Formato[] = ['xlsx', 'csv', 'pdf'];

/** Texto de un importe para CSV y PDF: número plano con dos decimales, o «—» cuando no hay dato. */
function textoCelda(valor: Valor | number | string, tipo?: string): string {
  if (valor === null || valor === undefined || valor === '') return '';
  if (typeof valor === 'boolean') return valor ? 'Sí' : 'No';
  if (typeof valor === 'number') {
    if (tipo === 'monto') return valor.toFixed(2);
    if (tipo === 'porcentaje') return `${valor.toFixed(2)}%`;
    return String(valor);
  }
  return String(valor);
}

/** Filas de una hoja en valores planos (encabezado, datos y totales). */
function filasPlanas(hoja: Hoja): { encabezado: string[]; datos: string[][]; totales: string[] | null } {
  const encabezado = hoja.columnas.map(c => c.titulo);
  const datos = hoja.filas.map(f => hoja.columnas.map((c, i) => textoCelda(valorPlano(f[i] ?? null) as Valor, c.tipo)));
  const tot = valoresTotales(hoja);
  const totales = tot ? tot.map((v, i) => textoCelda(v, hoja.columnas[i].tipo)) : null;
  return { encabezado, datos, totales };
}

/** CSV de una hoja: UTF-8 con BOM (Excel lo abre con tildes) y fórmulas neutralizadas. */
export function aCsv(hoja: Hoja): Buffer {
  const celda = (v: string) => {
    const s = textoSeguro(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const { encabezado, datos, totales } = filasPlanas(hoja);
  const lineas = [
    [hoja.titulo], ...hoja.metadatos.map(m => [m]), [],
    encabezado, ...datos, ...(totales ? [totales] : []), ...(hoja.notas ?? []).map(n => [n]),
  ].map(fila => fila.map(celda).join(','));
  return Buffer.from(`﻿${lineas.join('\r\n')}\r\n`, 'utf8');
}

// ---------- PDF (texto tabular, Helvetica, carta horizontal) ----------
// WinAnsi cubre el español; lo que no es Latin-1 se sustituye por «?» en lugar de corromper el archivo.
const latin1 = (s: string) => s.normalize('NFC').replace(/[^ -~ -ÿ]/g, '?');
const textoPdf = (s: string) => latin1(s).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');

/** PDF de una hoja (consulta e impresión). Varias páginas con encabezados repetidos y numeración. */
export function aPdf(hoja: Hoja): Buffer {
  const { encabezado, datos, totales } = filasPlanas(hoja);
  const ancho = 792, alto = 612, margen = 30, tam = 7, interlinea = 10;
  const util = ancho - margen * 2;
  const todas = [encabezado, ...datos.slice(0, 300), ...(totales ? [totales] : [])];
  const pesos = encabezado.map((_, i) => Math.max(...todas.map(f => (f[i] ?? '').length), 4));
  const totalPeso = pesos.reduce((a, b) => a + b, 0);
  const anchos = pesos.map(p => (p / totalPeso) * util);
  const maxCar = anchos.map(a => Math.max(3, Math.floor(a / (tam * 0.5))));
  const recortar = (v: string, i: number) => (v.length > maxCar[i] ? `${v.slice(0, maxCar[i] - 1)}.` : v);
  const cabeceraPagina = 46;
  const filasPorPagina = Math.floor((alto - margen * 2 - cabeceraPagina - 24) / interlinea);
  const bloques: string[][][] = [];
  for (let i = 0; i < Math.max(datos.length, 1); i += filasPorPagina) bloques.push(datos.slice(i, i + filasPorPagina));
  const paginas = bloques.map((filas, p) => {
    const ops: string[] = [
      'BT', `/F2 11 Tf ${margen} ${alto - margen} Td (${textoPdf(hoja.titulo)}) Tj ET`,
    ];
    let y = alto - margen - 14;
    for (const linea of hoja.metadatos) { ops.push('BT', `/F1 8 Tf ${margen} ${y} Td (${textoPdf(linea)}) Tj ET`); y -= 10; }
    y -= 6;
    const fila = (celdas: string[], fuente: string) => {
      let x = margen;
      celdas.forEach((v, i) => { ops.push('BT', `/${fuente} ${tam} Tf ${x.toFixed(1)} ${y} Td (${textoPdf(recortar(v, i))}) Tj ET`); x += anchos[i]; });
      y -= interlinea;
    };
    fila(encabezado, 'F2');
    for (const f of filas) fila(f, 'F1');
    if (p === bloques.length - 1 && totales) { y -= 4; fila(totales, 'F2'); }
    if (p === bloques.length - 1) for (const nota of hoja.notas ?? []) { y -= 4; ops.push('BT', `/F1 ${tam} Tf ${margen} ${y} Td (${textoPdf(nota)}) Tj ET`); y -= interlinea; }
    ops.push('BT', `/F1 6 Tf ${ancho - margen - 80} ${margen - 12} Td (${textoPdf(`Página ${p + 1} de ${bloques.length}`)}) Tj ET`);
    return ops.join('\n');
  });
  return ensamblarPdf(paginas, ancho, alto);
}

function ensamblarPdf(paginas: string[], ancho: number, alto: number): Buffer {
  const objetos: string[] = [];
  const n = paginas.length;
  objetos[1] = '<< /Type /Catalog /Pages 2 0 R >>';
  objetos[2] = `<< /Type /Pages /Count ${n} /Kids [${paginas.map((_, i) => `${5 + i * 2} 0 R`).join(' ')}] >>`;
  objetos[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>';
  objetos[4] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>';
  paginas.forEach((contenido, i) => {
    const datos = Buffer.from(contenido, 'latin1');
    objetos[5 + i * 2] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${ancho} ${alto}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${6 + i * 2} 0 R >>`;
    objetos[6 + i * 2] = `<< /Length ${datos.length} >>\nstream\n${contenido}\nendstream`;
  });
  let salida = '%PDF-1.4\n%âãÏÓ\n';
  const offsets: number[] = [];
  for (let i = 1; i < objetos.length; i++) {
    offsets[i] = Buffer.byteLength(salida, 'latin1');
    salida += `${i} 0 obj\n${objetos[i]}\nendobj\n`;
  }
  const xref = Buffer.byteLength(salida, 'latin1');
  salida += `xref\n0 ${objetos.length}\n0000000000 65535 f \n${offsets.slice(1).map(o => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
  salida += `trailer\n<< /Size ${objetos.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(salida, 'latin1');
}

/** Libro completo a Excel (formato principal). */
export function aExcel(libro: Libro): Buffer {
  return aLibroXlsx(libro);
}

export const TIPO_MIME: Record<Formato, string> = {
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  csv: 'text/csv; charset=utf-8',
  pdf: 'application/pdf',
};

