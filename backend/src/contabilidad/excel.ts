/**
 * Libro de Excel (.xlsx) sin dependencias. Escritura en Office Open XML mínimo con estilos propios:
 * - Importes numéricos con formato de lempiras; cantidades enteras; fechas tipadas (dd/mm/yyyy).
 * - RTN, CAI, números de documento y correlativos como texto (@), sin perder ceros iniciales.
 * - Encabezados congelados, filtros automáticos, encabezados repetidos al imprimir y ancho de columnas por contenido.
 * - Totales y subtotales como fórmulas (SUM / SUMPRODUCT con signo) con su valor calculado guardado.
 * - Texto que empieza por = + - @ se neutraliza: nunca se interpreta como fórmula.
 * - Celdas sin dato quedan vacías: nunca se sustituyen por ceros.
 */

export type Tipo = 'texto' | 'codigo' | 'largo' | 'monto' | 'entero' | 'fecha' | 'porcentaje';
export type Valor = string | number | boolean | null | undefined;
export interface CeldaEspecial { valor?: Valor; tipo?: Tipo; formula?: string; resultado?: number | string }
export type Celda = Valor | CeldaEspecial;
export interface Columna { titulo: string; tipo?: Tipo; ancho?: number }
export interface Totales { etiqueta: string; sumar: number[]; signo?: number; extra?: Record<number, CeldaEspecial> }
export interface Hoja {
  nombre: string;
  titulo: string;
  /** Líneas de identificación: empresa, RTN, período, fecha de generación, aviso. */
  metadatos: string[];
  columnas: Columna[];
  filas: Celda[][];
  totales?: Totales;
  notas?: string[];
}
export interface Libro { titulo: string; autor: string; creado: Date; hojas: Hoja[] }

export const LIMITE_CELDA = 32000;
const MAX_NOMBRE_HOJA = 31;
const TEXTO_CON_RIESGO = /^[=+\-@\t\r]/;

const esNumero = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const esEspecial = (c: Celda): c is CeldaEspecial => typeof c === 'object' && c !== null;
const esNumeroTexto = (s: string) => /^-?\d+(\.\d+)?$/.test(s.trim());
const esTipoMonetario = (t: Tipo) => t === 'monto' || t === 'entero' || t === 'porcentaje';

/** Texto seguro para hoja de cálculo: un prefijo impide que se ejecute como fórmula. */
export function textoSeguro(texto: string): string {
  const recortado = texto.length > LIMITE_CELDA ? `${texto.slice(0, LIMITE_CELDA - 3)}...` : texto;
  return TEXTO_CON_RIESGO.test(recortado) ? `'${recortado}` : recortado;
}

/** Valor plano de una celda (para CSV, PDF y para calcular totales). */
export function valorPlano(c: Celda): Valor | number | string {
  if (esEspecial(c)) {
    if (c.formula !== undefined) return c.resultado;
    return c.valor;
  }
  return c;
}

/** Suma de una columna, aplicando el signo de otra columna cuando se indica (notas de crédito, anulados). */
export function sumaColumna(filas: Celda[][], columna: number, signoColumna?: number): number {
  let total = 0;
  for (const fila of filas) {
    const v = valorPlano(fila[columna] ?? null);
    const n = typeof v === 'number' ? v : typeof v === 'string' && esNumeroTexto(v) ? Number(v) : NaN;
    if (!Number.isFinite(n)) continue;
    const signo = signoColumna === undefined ? 1 : Number(valorPlano(fila[signoColumna] ?? 0));
    total += n * (Number.isFinite(signo) ? signo : 0);
  }
  return Math.round(total * 100) / 100;
}

/** Valores planos de la fila de totales (para CSV y PDF): etiqueta, sumas y celdas extra. */
export function valoresTotales(hoja: Hoja): Valor[] | null {
  const t = hoja.totales;
  if (!t) return null;
  return hoja.columnas.map((_, i) => {
    if (i === 0) return t.etiqueta;
    const extra = t.extra?.[i];
    if (extra !== undefined) return valorPlano(extra) as Valor;
    return t.sumar.includes(i) ? sumaColumna(hoja.filas, i, t.signo) : null;
  });
}

const letra = (i: number) => {
  let s = '';
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
};

// Caracteres de control: no son válidos en XML 1.0 y se eliminan.
// oxlint-disable-next-line no-control-regex
const xml = (s: string) => s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g, '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Fecha YYYY-MM-DD a número de serie de Excel (base 1899-12-30). */
export function serieFecha(fecha: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return null;
  const d = Date.parse(`${fecha}T00:00:00Z`);
  if (Number.isNaN(d) || new Date(d).toISOString().slice(0, 10) !== fecha) return null;
  return (d - Date.UTC(1899, 11, 30)) / 86400000;
}

// Índices de estilo (ver styles.xml más abajo).
const ESTILO: Record<string, number> = { normal: 0, cabecera: 1, monto: 2, fecha: 3, entero: 4, codigo: 5, titulo: 6, meta: 7, montoTotal: 8, etiquetaTotal: 9, largo: 10, enteroTotal: 11, porcentaje: 12, nota: 13 };
const ESTILO_TIPO: Record<Tipo, number> = { texto: ESTILO.normal, codigo: ESTILO.codigo, largo: ESTILO.largo, monto: ESTILO.monto, entero: ESTILO.entero, fecha: ESTILO.fecha, porcentaje: ESTILO.porcentaje };

function celdaXml(ref: string, c: Celda, tipo: Tipo, estilo: number): string {
  if (c === null || c === undefined) return '';
  if (esEspecial(c) && c.formula !== undefined) {
    const r = c.resultado;
    if (typeof r === 'number') return `<c r="${ref}" s="${estilo}"><f>${xml(c.formula)}</f><v>${r}</v></c>`;
    return `<c r="${ref}" s="${estilo}" t="str"><f>${xml(c.formula)}</f><v>${xml(String(r ?? ''))}</v></c>`;
  }
  const valor = esEspecial(c) ? c.valor : c;
  const tipoEfectivo = esEspecial(c) && c.tipo ? c.tipo : tipo;
  const estiloEfectivo = esEspecial(c) && c.tipo ? ESTILO_TIPO[c.tipo] : estilo;
  if (valor === null || valor === undefined || valor === '') return '';
  if (typeof valor === 'boolean') return celdaTexto(ref, valor ? 'Sí' : 'No', estiloEfectivo);
  if (esNumero(valor)) {
    if (esTipoMonetario(tipoEfectivo)) return `<c r="${ref}" s="${estiloEfectivo}"><v>${valor}</v></c>`;
    return celdaTexto(ref, String(valor), estiloEfectivo);
  }
  const texto = String(valor);
  if (tipoEfectivo === 'fecha') {
    const serie = serieFecha(texto);
    if (serie !== null) return `<c r="${ref}" s="${ESTILO.fecha}"><v>${serie}</v></c>`;
  }
  if (esTipoMonetario(tipoEfectivo) && esNumeroTexto(texto)) return `<c r="${ref}" s="${estiloEfectivo}"><v>${Number(texto)}</v></c>`;
  return celdaTexto(ref, texto, estiloEfectivo);
}

function celdaTexto(ref: string, texto: string, estilo: number) {
  return `<c r="${ref}" s="${estilo}" t="inlineStr"><is><t xml:space="preserve">${xml(textoSeguro(texto))}</t></is></c>`;
}

function anchoColumna(hoja: Hoja, i: number): number {
  const col = hoja.columnas[i];
  if (col.ancho) return col.ancho;
  const tipo = col.tipo ?? 'texto';
  let max = col.titulo.length;
  for (const fila of hoja.filas.slice(0, 5000)) {
    const v = valorPlano(fila[i] ?? null);
    if (v === null || v === undefined) continue;
    const largo = typeof v === 'number' ? (tipo === 'monto' ? 14 : 8) : String(v).length;
    if (largo > max) max = largo;
  }
  const base = tipo === 'monto' ? Math.max(max + 2, 14) : tipo === 'largo' ? Math.min(max + 2, 60) : Math.max(max + 2, 10);
  return Math.min(base, 60);
}

/** Construye la hoja. Devuelve también la fila de encabezado y la última fila de datos, para filtros e impresión. */
function hojaXml(hoja: Hoja, indice: number): { xml: string; cabecera: number; ultima: number } {
  const filas: string[] = [];
  const n = hoja.columnas.length;
  const ultimaColumna = letra(Math.max(0, n - 1));
  let r = 1;
  filas.push(`<row r="${r}"><c r="A${r}" s="${ESTILO.titulo}" t="inlineStr"><is><t xml:space="preserve">${xml(textoSeguro(hoja.titulo))}</t></is></c></row>`);
  r++;
  for (const linea of hoja.metadatos) {
    filas.push(`<row r="${r}">${celdaTexto(`A${r}`, linea, ESTILO.meta)}</row>`);
    r++;
  }
  r++; // fila en blanco antes de la tabla
  const cabecera = r;
  const celdasCabecera = hoja.columnas.map((c, i) => celdaTexto(`${letra(i)}${r}`, c.titulo, ESTILO.cabecera)).join('');
  filas.push(`<row r="${r}" ht="30" customHeight="1">${celdasCabecera}</row>`);
  r++;
  const primeraDato = r;
  for (const fila of hoja.filas) {
    const celdas = hoja.columnas.map((c, i) => {
      const cel = fila[i] ?? null;
      return celdaXml(`${letra(i)}${r}`, cel, c.tipo ?? 'texto', ESTILO_TIPO[c.tipo ?? 'texto']);
    }).join('');
    filas.push(`<row r="${r}">${celdas}</row>`);
    r++;
  }
  const ultimaDato = r - 1;
  const ultimaDatoEfectiva = ultimaDato >= primeraDato ? ultimaDato : cabecera;
  const t = hoja.totales;
  if (t) {
    const rangoSuma = (i: number) => (t.signo === undefined
      ? `SUM(${letra(i)}${primeraDato}:${letra(i)}${ultimaDatoEfectiva})`
      : `SUMPRODUCT(${letra(i)}${primeraDato}:${letra(i)}${ultimaDatoEfectiva},${letra(t.signo)}${primeraDato}:${letra(t.signo)}${ultimaDatoEfectiva})`);
    const celdas = hoja.columnas.map((c, i) => {
      const ref = `${letra(i)}${r}`;
      if (i === 0) return celdaTexto(ref, t.etiqueta, ESTILO.etiquetaTotal);
      const estiloTotal = c.tipo === 'entero' ? ESTILO.enteroTotal : ESTILO.montoTotal;
      const extra = t.extra?.[i];
      if (extra !== undefined) {
        if (esEspecial(extra) && extra.formula !== undefined) {
          const res = extra.resultado;
          return typeof res === 'number'
            ? `<c r="${ref}" s="${estiloTotal}"><f>${xml(extra.formula)}</f><v>${res}</v></c>`
            : `<c r="${ref}" s="${ESTILO.etiquetaTotal}" t="str"><f>${xml(extra.formula)}</f><v>${xml(String(res ?? ''))}</v></c>`;
        }
        return celdaXml(ref, extra, c.tipo ?? 'texto', ESTILO.etiquetaTotal);
      }
      if (t.sumar.includes(i)) {
        return `<c r="${ref}" s="${estiloTotal}"><f>${xml(rangoSuma(i))}</f><v>${sumaColumna(hoja.filas, i, t.signo)}</v></c>`;
      }
      return '';
    }).join('');
    filas.push(`<row r="${r}">${celdas}</row>`);
    r++;
  }
  if (hoja.notas?.length) {
    r++;
    for (const nota of hoja.notas) {
      filas.push(`<row r="${r}">${celdaTexto(`A${r}`, nota, ESTILO.nota)}</row>`);
      r++;
    }
  }
  const cols = hoja.columnas.map((_, i) => `<col min="${i + 1}" max="${i + 1}" width="${anchoColumna(hoja, i)}" customWidth="1"/>`).join('');
  const ultimaFila = r - 1;
  const xmlHoja = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`
    + `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">`
    + `<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>`
    + `<dimension ref="A1:${ultimaColumna}${ultimaFila}"/>`
    + `<sheetViews><sheetView workbookViewId="0"${indice === 0 ? ' tabSelected="1"' : ''}><pane ySplit="${cabecera}" topLeftCell="A${cabecera + 1}" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A${cabecera + 1}" sqref="A${cabecera + 1}"/></sheetView></sheetViews>`
    + `<sheetFormatPr defaultRowHeight="15"/>`
    + `<cols>${cols}</cols>`
    + `<sheetData>${filas.join('')}</sheetData>`
    + `<autoFilter ref="A${cabecera}:${ultimaColumna}${ultimaDatoEfectiva}"/>`
    + `<pageMargins left="0.4" right="0.4" top="0.5" bottom="0.5" header="0.3" footer="0.3"/>`
    + `<pageSetup orientation="landscape" fitToWidth="1" fitToHeight="0"/>`
    + `</worksheet>`;
  return { xml: xmlHoja, cabecera, ultima: ultimaDatoEfectiva };
}

/** Nombre de hoja válido para Excel: sin caracteres prohibidos, máximo 31, único. */
export function nombresHoja(nombres: string[]): string[] {
  const usados = new Set<string>();
  return nombres.map(original => {
    let base = original.replace(/[[\]:*?/\\]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, MAX_NOMBRE_HOJA) || 'Hoja';
    let nombre = base;
    for (let k = 2; usados.has(nombre.toLowerCase()); k++) {
      const sufijo = ` ${k}`;
      nombre = `${base.slice(0, MAX_NOMBRE_HOJA - sufijo.length)}${sufijo}`;
    }
    usados.add(nombre.toLowerCase());
    return nombre;
  });
}

const ESTILOS_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`
  + `<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">`
  + `<numFmts count="4">`
  + `<numFmt numFmtId="164" formatCode="&quot;L.&quot; #,##0.00;[Red]\\-&quot;L.&quot; #,##0.00"/>`
  + `<numFmt numFmtId="165" formatCode="dd/mm/yyyy"/>`
  + `<numFmt numFmtId="166" formatCode="#,##0;[Red]\\-#,##0"/>`
  + `<numFmt numFmtId="167" formatCode="0.00&quot;%&quot;"/>`
  + `</numFmts>`
  + `<fonts count="5">`
  + `<font><sz val="10"/><name val="Arial"/><family val="2"/></font>`
  + `<font><b/><sz val="10"/><name val="Arial"/><family val="2"/></font>`
  + `<font><b/><sz val="14"/><color rgb="FF1F3A5F"/><name val="Arial"/><family val="2"/></font>`
  + `<font><i/><sz val="9"/><color rgb="FF555555"/><name val="Arial"/><family val="2"/></font>`
  + `<font><b/><sz val="10"/><color rgb="FFFFFFFF"/><name val="Arial"/><family val="2"/></font>`
  + `</fonts>`
  + `<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF1F3A5F"/><bgColor indexed="64"/></patternFill></fill></fills>`
  + `<borders count="3"><border><left/><right/><top/><bottom/><diagonal/></border>`
  + `<border><left/><right/><top/><bottom style="thin"><color rgb="FFBFBFBF"/></bottom><diagonal/></border>`
  + `<border><left/><right/><top style="thin"><color rgb="FF1F3A5F"/></top><bottom style="double"><color rgb="FF1F3A5F"/></bottom><diagonal/></border></borders>`
  + `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>`
  + `<cellXfs count="14">`
  + `<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>`
  + `<xf numFmtId="0" fontId="4" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>`
  + `<xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/>`
  + `<xf numFmtId="165" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center"/></xf>`
  + `<xf numFmtId="166" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/>`
  + `<xf numFmtId="49" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/>`
  + `<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>`
  + `<xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1"/>`
  + `<xf numFmtId="164" fontId="1" fillId="0" borderId="2" xfId="0" applyNumberFormat="1" applyFont="1" applyBorder="1"/>`
  + `<xf numFmtId="0" fontId="1" fillId="0" borderId="2" xfId="0" applyFont="1" applyBorder="1"/>`
  + `<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>`
  + `<xf numFmtId="166" fontId="1" fillId="0" borderId="2" xfId="0" applyNumberFormat="1" applyFont="1" applyBorder="1"/>`
  + `<xf numFmtId="167" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/>`
  + `<xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1"/>`
  + `</cellXfs>`
  + `<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>`
  + `</styleSheet>`;

/** Escribe un libro .xlsx completo. Las cadenas de hoja y de libro se escapan; ninguna celda se evalúa. */
export function aLibroXlsx(libro: Libro): Buffer {
  const nombres = nombresHoja(libro.hojas.map(h => h.nombre));
  const hojas = libro.hojas.map((h, i) => ({ ...h, nombre: nombres[i] }));
  const piezas = hojas.map((h, i) => hojaXml(h, i));
  const b = (s: string) => Buffer.from(s, 'utf8');
  const hojasXml = hojas.map((h, i) => `<sheet name="${xml(h.nombre)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('');
  const definidos = hojas.flatMap((h, i) => {
    const cita = `'${h.nombre.replace(/'/g, "''")}'`;
    const ultimaCol = letra(Math.max(0, h.columnas.length - 1));
    return [
      `<definedName name="_xlnm._FilterDatabase" localSheetId="${i}" hidden="1">${xml(`${cita}!$A$${piezas[i].cabecera}:$${ultimaCol}$${piezas[i].ultima}`)}</definedName>`,
      `<definedName name="_xlnm.Print_Titles" localSheetId="${i}">${xml(`${cita}!$${piezas[i].cabecera}:$${piezas[i].cabecera}`)}</definedName>`,
    ];
  }).join('');
  const relaciones = hojas.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('');
  const creado = libro.creado.toISOString().replace(/\.\d{3}Z$/, 'Z');
  const sobrescrituras = hojas.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('');
  return zipSinCompresion([
    { nombre: '[Content_Types].xml', datos: b(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>${sobrescrituras}</Types>`) },
    { nombre: '_rels/.rels', datos: b(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>`) },
    { nombre: 'docProps/core.xml', datos: b(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${xml(libro.titulo)}</dc:title><dc:creator>${xml(libro.autor)}</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${creado}</dcterms:created></cp:coreProperties>`) },
    { nombre: 'xl/workbook.xml', datos: b(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView activeTab="0"/></bookViews><sheets>${hojasXml}</sheets><definedNames>${definidos}</definedNames><calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>`) },
    { nombre: 'xl/_rels/workbook.xml.rels', datos: b(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${relaciones}<Relationship Id="rId${hojas.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`) },
    { nombre: 'xl/styles.xml', datos: b(ESTILOS_XML) },
    ...piezas.map((p, i) => ({ nombre: `xl/worksheets/sheet${i + 1}.xml`, datos: b(p.xml) })),
  ]);
}

// ---------- ZIP sin compresión (método 0), con CRC-32 ----------
const TABLA_CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
export function crc32(datos: Buffer): number {
  let c = 0xffffffff;
  for (const byte of datos) c = TABLA_CRC[(c ^ byte) & 0xff] ^ (c >>> 8);
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
