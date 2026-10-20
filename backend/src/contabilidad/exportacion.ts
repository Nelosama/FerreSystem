/**
 * Exportación de libros y reportes a CSV, Excel (.xlsx) y PDF sin dependencias nuevas.
 * Las tablas se generan en el servidor, después de autorizar, a partir de las mismas filas que ve la pantalla.
 */

export type Celda = string | number | null;
export interface Tabla { titulo: string; subtitulo?: string; columnas: string[]; filas: Celda[][]; pie?: string[] }

// Un texto que empieza con = + - @ (o tabulación/retorno) se interpretaría como fórmula en una hoja de cálculo.
const neutralizar = (texto: string) => (/^[=+\-@\t\r]/.test(texto) ? `'${texto}` : texto);

export function aCsv(t: Tabla): Buffer {
  const celda = (v: Celda) => {
    if (v === null) return '';
    if (typeof v === 'number') return String(v);
    const s = neutralizar(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lineas = [[t.titulo], ...(t.subtitulo ? [[t.subtitulo]] : []), t.columnas, ...t.filas, ...(t.pie ?? []).map(p => [p])]
    .map(fila => fila.map(celda).join(','));
  // BOM para que Excel abra el UTF-8 con tildes correctas.
  return Buffer.from(`﻿${lineas.join('\r\n')}\r\n`, 'utf8');
}

// ---------- XLSX (Office Open XML mínimo, ZIP sin compresión) ----------
// Los caracteres de control no son válidos en XML 1.0: se eliminan.
// oxlint-disable-next-line no-control-regex
const xml = (s: string) => s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const columna = (i: number) => { let s = ''; for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s; return s; };

const TABLA_CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
export function crc32(datos: Buffer): number {
  let c = 0xffffffff;
  for (const b of datos) c = TABLA_CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export function zipSinCompresion(archivos: { nombre: string; datos: Buffer }[]): Buffer {
  const locales: Buffer[] = [], centrales: Buffer[] = [];
  let desplazamiento = 0;
  for (const { nombre, datos } of archivos) {
    const n = Buffer.from(nombre, 'utf8'), crc = crc32(datos);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x0800, 6); local.writeUInt16LE(0, 8);
    local.writeUInt16LE(0, 10); local.writeUInt16LE(0x21, 12); local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(datos.length, 18); local.writeUInt32LE(datos.length, 22); local.writeUInt16LE(n.length, 26); local.writeUInt16LE(0, 28);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(0, 10); central.writeUInt16LE(0, 12); central.writeUInt16LE(0x21, 14); central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(datos.length, 20); central.writeUInt32LE(datos.length, 24); central.writeUInt16LE(n.length, 28);
    central.writeUInt32LE(desplazamiento, 42);
    locales.push(local, n, datos); centrales.push(central, n);
    desplazamiento += 30 + n.length + datos.length;
  }
  const directorio = Buffer.concat(centrales), fin = Buffer.alloc(22);
  fin.writeUInt32LE(0x06054b50, 0); fin.writeUInt16LE(archivos.length, 8); fin.writeUInt16LE(archivos.length, 10);
  fin.writeUInt32LE(directorio.length, 12); fin.writeUInt32LE(desplazamiento, 16);
  return Buffer.concat([...locales, directorio, fin]);
}

export function aXlsx(t: Tabla): Buffer {
  const filas: Celda[][] = [[t.titulo], ...(t.subtitulo ? [[t.subtitulo]] : []), [], t.columnas, ...t.filas, ...(t.pie ? [[], ...t.pie.map(p => [p])] : [])];
  const cuerpo = filas.map((fila, r) => `<row r="${r + 1}">${fila.map((v, c) => {
    const ref = `${columna(c)}${r + 1}`;
    if (v === null) return '';
    if (typeof v === 'number') return `<c r="${ref}"><v>${v}</v></c>`;
    return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${xml(v)}</t></is></c>`;
  }).join('')}</row>`).join('');
  const hoja = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${cuerpo}</sheetData></worksheet>`;
  const b = (s: string) => Buffer.from(s, 'utf8');
  return zipSinCompresion([
    { nombre: '[Content_Types].xml', datos: b('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>') },
    { nombre: '_rels/.rels', datos: b('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>') },
    { nombre: 'xl/workbook.xml', datos: b('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Libro" sheetId="1" r:id="rId1"/></sheets></workbook>') },
    { nombre: 'xl/_rels/workbook.xml.rels', datos: b('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>') },
    { nombre: 'xl/worksheets/sheet1.xml', datos: b(hoja) },
  ]);
}

// ---------- PDF (texto tabular, Helvetica, carta horizontal) ----------
// WinAnsi cubre el español; lo que no es Latin-1 se sustituye por «?» en lugar de corromper el archivo.
const latin1 = (s: string) => s.normalize('NFC').replace(/[^ -~ -ÿ]/g, '?');
const textoPdf = (s: string) => latin1(s).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');

export function aPdf(t: Tabla): Buffer {
  const ancho = 792, alto = 612, margen = 30, tam = 7, interlinea = 10;
  const util = ancho - margen * 2;
  const pesos = t.columnas.map((c, i) => Math.max(c.length, ...t.filas.slice(0, 200).map(f => String(f[i] ?? '').length), 4));
  const totalPeso = pesos.reduce((a, b) => a + b, 0);
  const anchos = pesos.map(p => (p / totalPeso) * util);
  const maxCar = anchos.map(a => Math.max(3, Math.floor(a / (tam * 0.5))));
  const recortar = (v: Celda, i: number) => { const s = v === null ? '' : String(v); return s.length > maxCar[i] ? `${s.slice(0, maxCar[i] - 1)}.` : s; };
  const filasPorPagina = Math.floor((alto - margen * 2 - 50) / interlinea);
  const bloques: Celda[][][] = [];
  for (let i = 0; i < Math.max(t.filas.length, 1); i += filasPorPagina) bloques.push(t.filas.slice(i, i + filasPorPagina));
  const paginas = bloques.map((filas, p) => {
    const ops: string[] = ['BT', `/F1 11 Tf ${margen} ${alto - margen} Td (${textoPdf(t.titulo)}) Tj ET`];
    if (t.subtitulo) ops.push('BT', `/F1 8 Tf ${margen} ${alto - margen - 13} Td (${textoPdf(t.subtitulo)}) Tj ET`);
    let y = alto - margen - 34;
    const fila = (celdas: Celda[], fuente: string) => {
      let x = margen;
      celdas.forEach((v, i) => { ops.push('BT', `/${fuente} ${tam} Tf ${x.toFixed(1)} ${y} Td (${textoPdf(recortar(v, i))}) Tj ET`); x += anchos[i]; });
      y -= interlinea;
    };
    fila(t.columnas, 'F2');
    for (const f of filas) fila(f, 'F1');
    if (p === bloques.length - 1) for (const linea of t.pie ?? []) { y -= 4; ops.push('BT', `/F2 ${tam} Tf ${margen} ${y} Td (${textoPdf(linea)}) Tj ET`); y -= interlinea; }
    ops.push('BT', `/F1 6 Tf ${ancho - margen - 60} ${margen - 12} Td (${textoPdf(`Página ${p + 1} de ${bloques.length}`)}) Tj ET`);
    return ops.join('\n');
  });
  const objetos: string[] = [];
  const n = paginas.length;
  // 1 catálogo, 2 páginas, 3 y 4 fuentes, luego (página, contenido) por cada hoja.
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

export const FORMATOS = {
  csv: { tipo: 'text/csv; charset=utf-8', extension: 'csv', generar: aCsv },
  xlsx: { tipo: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', extension: 'xlsx', generar: aXlsx },
  pdf: { tipo: 'application/pdf', extension: 'pdf', generar: aPdf },
} as const;
export type Formato = keyof typeof FORMATOS;
