import { aCsv, aPdf, aExcel } from './exportacion';
import { Hoja, Libro, crc32, nombresHoja, serieFecha, textoSeguro, valoresTotales } from './excel';

// Lectura mínima del ZIP que genera el escritor (método 0, sin compresión): sirve para verificar el XLSX sin dependencias.
function leerZip(buf: Buffer): Record<string, string> {
  const fin = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  expect(fin).toBeGreaterThan(0);
  const cantidad = buf.readUInt16LE(fin + 10);
  let p = buf.readUInt32LE(fin + 16);
  const salida: Record<string, string> = {};
  for (let i = 0; i < cantidad; i++) {
    expect(buf.readUInt32LE(p)).toBe(0x02014b50);
    const metodo = buf.readUInt16LE(p + 10);
    expect(metodo).toBe(0);
    const tam = buf.readUInt32LE(p + 20), crc = buf.readUInt32LE(p + 16);
    const nLen = buf.readUInt16LE(p + 28), eLen = buf.readUInt16LE(p + 30), cLen = buf.readUInt16LE(p + 32);
    const offset = buf.readUInt32LE(p + 42);
    const nombre = buf.subarray(p + 46, p + 46 + nLen).toString('utf8');
    const local = offset + 30 + buf.readUInt16LE(offset + 26) + buf.readUInt16LE(offset + 28);
    const datos = buf.subarray(local, local + tam);
    expect(crc32(datos)).toBe(crc);
    salida[nombre] = datos.toString('utf8');
    p += 46 + nLen + eLen + cLen;
  }
  return salida;
}

const hojaBase = (over: Partial<Hoja> = {}): Hoja => ({
  nombre: 'Ventas', titulo: 'Libro de ventas · Ferretería Ñandú', metadatos: ['Empresa: Ferretería Ñandú', 'RTN: 08011990123456', 'Período contable: 09/2026 (del 2026-09-01 al 2026-09-30)', 'Estado del período: ABIERTO', 'Generado: 2026-10-20 01:30:00 (America/Tegucigalpa) por Ana', 'Aviso'],
  columnas: [
    { titulo: 'Fecha', tipo: 'fecha' }, { titulo: 'RTN', tipo: 'codigo' }, { titulo: 'Número', tipo: 'codigo' },
    { titulo: 'Total', tipo: 'monto' }, { titulo: 'Efecto', tipo: 'entero' }, { titulo: 'Observación', tipo: 'texto' },
  ],
  filas: [
    ['2026-09-10', '08011990123456', '000-001-01-00000001', 1150.5, 1, 'Normal'],
    ['2026-09-11', '08019000000001', '000-001-06-00000001', 115, -1, '=HYPERLINK("http://x")'],
    ['2026-09-12', null, null, null, 0, '+cmd'],
  ],
  totales: { etiqueta: 'Total del libro', sumar: [3], signo: 4 },
  notas: ['Nota final'],
  ...over,
});

const libro = (hojas: Hoja[]): Libro => ({ titulo: 'Libro de prueba', autor: 'Jowa System', creado: new Date('2026-10-20T07:30:00Z'), hojas });

describe('Excel (.xlsx) generado sin dependencias', () => {
  it('es un ZIP válido con las partes mínimas y CRC correcto', () => {
    const archivos = leerZip(aExcel(libro([hojaBase()])));
    expect(Object.keys(archivos).sort()).toEqual(['[Content_Types].xml', '_rels/.rels', 'docProps/core.xml', 'xl/_rels/workbook.xml.rels', 'xl/styles.xml', 'xl/workbook.xml', 'xl/worksheets/sheet1.xml']);
    expect(archivos['docProps/core.xml']).toContain('<dc:title>Libro de prueba</dc:title>');
  });

  it('nombres de hoja: identificados, sin caracteres prohibidos, máximo 31 y únicos', () => {
    const nombres = nombresHoja(['Resumen general', 'Balanza de comprobación: 2026/09', 'Balanza de comprobación: 2026/09 con un nombre muy largo', 'Ventas', 'ventas']);
    expect(nombres[0]).toBe('Resumen general');
    expect(nombres[1]).toBe('Balanza de comprobación 2026 09');
    expect(nombres[2].length).toBeLessThanOrEqual(31);
    expect(new Set(nombres.map(n => n.toLowerCase())).size).toBe(nombres.length);
    expect(nombres[4]).toBe('ventas 2');
  });

  it('RTN, CAI y números se guardan como texto y conservan ceros iniciales', () => {
    const xml = leerZip(aExcel(libro([hojaBase()])))['xl/worksheets/sheet1.xml'];
    expect(xml).toContain('<c r="B10" s="5" t="inlineStr"><is><t xml:space="preserve">08011990123456</t></is></c>');
    expect(xml).toContain('<t xml:space="preserve">000-001-01-00000001</t>');
    expect(xml).not.toMatch(/<c r="B10"[^>]*><v>/);
  });

  it('importes numéricos con estilo de lempiras; enteros y fechas tipadas', () => {
    const libroXlsx = leerZip(aExcel(libro([hojaBase()])));
    const xml = libroXlsx['xl/worksheets/sheet1.xml'], estilos = libroXlsx['xl/styles.xml'];
    expect(xml).toContain('<c r="D10" s="2"><v>1150.5</v></c>');
    expect(xml).toContain('<c r="E10" s="4"><v>1</v></c>');
    expect(xml).toContain('<c r="A10" s="3"><v>46275</v></c>');
    expect(estilos).toContain('formatCode="&quot;L.&quot; #,##0.00');
    expect(estilos).toContain('formatCode="dd/mm/yyyy"');
  });

  it('texto que empieza por = + - @ se neutraliza; nunca se evalúa', () => {
    const xml = leerZip(aExcel(libro([hojaBase()])))['xl/worksheets/sheet1.xml'];
    expect(xml).toContain("'=HYPERLINK(&quot;http://x&quot;)");
    expect(xml).toContain("'+cmd");
    expect(xml).not.toContain('<f>HYPERLINK');
    expect(textoSeguro('@SUM(1;1)')).toBe("'@SUM(1;1)");
    expect(textoSeguro('-3 libras')).toBe("'-3 libras");
  });

  it('datos vacíos quedan vacíos (no se convierten en cero)', () => {
    const xml = leerZip(aExcel(libro([hojaBase()])))['xl/worksheets/sheet1.xml'];
    // Fila 12: sin RTN, sin número y sin importe. Esas celdas no existen en el XML (no hay cero inventado).
    expect(xml).toMatch(/<row r="12"><c r="A12" s="3"><v>\d+<\/v><\/c><c r="E12" s="4"><v>0<\/v><\/c>/);
    expect(xml).not.toMatch(/<c r="B12"/);
    expect(xml).not.toMatch(/<c r="C12"/);
    expect(xml).not.toMatch(/<c r="D12"/);
  });

  it('panel congelado en el encabezado, filtro automático, impresión con encabezados y ancho de columnas', () => {
    const xml = leerZip(aExcel(libro([hojaBase()])))['xl/worksheets/sheet1.xml'];
    expect(xml).toContain('<pane ySplit="9" topLeftCell="A10" activePane="bottomLeft" state="frozen"/>');
    expect(xml).toContain('<autoFilter ref="A9:F12"/>');
    expect(xml).toContain('<col min="1" max="1"');
    const libroXml = leerZip(aExcel(libro([hojaBase()])))['xl/workbook.xml'];
    expect(libroXml).toContain('_xlnm._FilterDatabase');
    expect(libroXml).toContain("'Ventas'!$9:$9");
  });

  it('totales con fórmula SUM o SUMPRODUCT (con signo) y valor calculado', () => {
    const xml = leerZip(aExcel(libro([hojaBase()])))['xl/worksheets/sheet1.xml'];
    // Solo cuentan las filas con efecto: 1150.5 − 115 = 1035.5; la fila sin efecto (0) no suma.
    expect(xml).toContain('<f>SUMPRODUCT(D10:D12,E10:E12)</f><v>1035.5</v>');
    expect(valoresTotales(hojaBase())?.[3]).toBe(1035.5);
    expect(valoresTotales(hojaBase())?.[0]).toBe('Total del libro');
  });

  it('subtotal sin signo usa SUM y un total extra puede llevar fórmula de cuadre', () => {
    const h = hojaBase({ totales: { etiqueta: 'Totales', sumar: [3], extra: { 5: { formula: 'IF(ROUND(D13-D13,2)=0,"Cuadra","No cuadra")', resultado: 'Cuadra' } } } });
    const xml = leerZip(aExcel(libro([h])))['xl/worksheets/sheet1.xml'];
    expect(xml).toContain('<f>SUM(D10:D12)</f><v>1265.5</v>');
    expect(xml).toContain('t="str"><f>IF(ROUND(D13-D13,2)=0,&quot;Cuadra&quot;,&quot;No cuadra&quot;)</f><v>Cuadra</v>');
  });

  it('varias hojas: cada una con su encabezado, nombre y pestaña seleccionada solo la primera', () => {
    const archivos = leerZip(aExcel(libro([hojaBase(), hojaBase({ nombre: 'ISV', titulo: 'ISV' })])));
    expect(archivos['xl/workbook.xml']).toContain('<sheet name="Ventas" sheetId="1" r:id="rId1"/><sheet name="ISV" sheetId="2" r:id="rId2"/>');
    expect(archivos['xl/worksheets/sheet1.xml']).toContain('tabSelected="1"');
    expect(archivos['xl/worksheets/sheet2.xml']).not.toContain('tabSelected');
  });

  it('serie de fecha de Excel correcta y fechas inválidas no se convierten', () => {
    expect(serieFecha('1899-12-30')).toBe(0);
    expect(serieFecha('2026-09-10')).toBe(46275);
    expect(serieFecha('2026-02-30')).toBeNull();
  });

  it('volumen alto: 20.000 filas se generan en tiempo razonable y el ZIP vuelve a leerse', () => {
    const filas = Array.from({ length: 20000 }, (_, i) => ['2026-09-10', '08011990123456', `000-001-01-${String(i + 1).padStart(8, '0')}`, i + 0.5, 1, 'Detalle']);
    const h = hojaBase({ filas, totales: { etiqueta: 'Total', sumar: [3], signo: 4 } });
    const inicio = Date.now();
    const buf = aExcel(libro([h]));
    const tardo = Date.now() - inicio;
    expect(tardo).toBeLessThan(5000);
    const xml = leerZip(buf)['xl/worksheets/sheet1.xml'];
    expect(xml).toContain('<autoFilter ref="A9:F20009"/>');
    expect(xml).toContain('<f>SUMPRODUCT(D10:D20009,E10:E20009)</f>');
  });

  it('hojas sin filas: encabezado y total en cero solo cuando el total existe; sin datos se indica en nota', () => {
    const h = hojaBase({ filas: [], notas: ['No hay registros en el período.'] });
    const xml = leerZip(aExcel(libro([h])))['xl/worksheets/sheet1.xml'];
    expect(xml).toContain('No hay registros en el período.');
    expect(xml).toContain('<autoFilter ref="A9:F9"/>');
  });

  it('el libro escrito sin hojas reconocibles nunca produce XML con caracteres de control', () => {
    const h = hojaBase({ filas: [['2026-09-10', '08011990123456', '000', 1, 1, 'Texto\u0001con control']] });
    const xml = leerZip(aExcel(libro([h])))['xl/worksheets/sheet1.xml'];
    expect(xml).not.toContain('\u0001');
    expect(xml).toContain('Textocon control');
  });
});

describe('CSV y PDF desde la misma hoja', () => {
  it('CSV con BOM, metadatos, totales y fórmulas neutralizadas', () => {
    const csv = aCsv(hojaBase()).toString('utf8');
    expect(csv.startsWith('﻿Libro de ventas · Ferretería Ñandú\r\n')).toBe(true);
    expect(csv).toContain('RTN: 08011990123456');
    expect(csv).toContain(`'=HYPERLINK(""http://x"")`);
    expect(csv).toContain('Total del libro,,,1035.50');
  });

  it('PDF: estructura válida y referencias cruzadas coherentes; importes con dos decimales', () => {
    const hojaGrande = hojaBase({ filas: Array.from({ length: 120 }, (_, i) => ['2026-09-10', '08011990123456', `000-001-01-${String(i + 1).padStart(8, '0')}`, i + 0.25, 1, `Cliente ${i} (ñ)`]) });
    const pdf = aPdf(hojaGrande);
    const s = pdf.toString('latin1');
    expect(s.startsWith('%PDF-1.4')).toBe(true);
    expect(s.trimEnd().endsWith('%%EOF')).toBe(true);
    const startxref = Number(/startxref\n(\d+)/.exec(s)![1]);
    expect(s.slice(startxref, startxref + 4)).toBe('xref');
    const entradas = s.slice(startxref).split('\n').filter(l => l.endsWith(' 00000 n ')).map(l => Number(l.slice(0, 10)));
    entradas.forEach((offset, i) => expect(s.slice(offset, offset + `${i + 1} 0 obj`.length)).toBe(`${i + 1} 0 obj`));
    expect(s).toContain('/Count 3');
    expect(s).toContain('119.25');
  });
});
