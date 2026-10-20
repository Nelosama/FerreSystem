import { aCsv, aPdf, aXlsx, crc32, Tabla } from './exportacion';

const tabla: Tabla = {
  titulo: 'Libro de ventas 2026-09', subtitulo: 'Ferretería Ñandú · RTN 08011990123456', columnas: ['Fecha', 'Cliente', 'Total'],
  filas: [['2026-09-01', 'José "Pepe", Pérez', 1150.5], ['2026-09-02', '=HYPERLINK("x")', 10], ['2026-09-03', null, -3]], pie: ['Total L 1157.50'],
};

describe('Exportación de libros', () => {
  it('CSV en UTF-8 con BOM, comillas y fórmulas neutralizadas', () => {
    const csv = aCsv(tabla).toString('utf8');
    expect(csv.startsWith('\uFEFFLibro de ventas 2026-09\r\n')).toBe(true);
    expect(csv).toContain('"José ""Pepe"", Pérez",1150.5');
    expect(csv).toContain(`"'=HYPERLINK(""x"")"`);
    expect(csv).toContain('2026-09-03,,-3');
  });

  it('CRC-32 estándar', () => {
    expect(crc32(Buffer.from('123456789'))).toBe(0xcbf43926);
  });

  it('XLSX: ZIP válido con las partes mínimas y texto escapado', () => {
    const zip = aXlsx(tabla);
    expect(zip.subarray(0, 4).toString('hex')).toBe('504b0304');
    expect(zip.readUInt32LE(zip.length - 22)).toBe(0x06054b50);
    expect(zip.readUInt16LE(zip.length - 12)).toBe(5);
    const texto = zip.toString('utf8');
    expect(texto).toContain('xl/worksheets/sheet1.xml');
    expect(texto).toContain('José &quot;Pepe&quot;, Pérez');
    expect(texto).toContain('<c r="C5"><v>1150.5</v></c>');
  });

  it('PDF: estructura, tabla de referencias cruzadas coherente y texto Latin-1', () => {
    const pdf = aPdf({ ...tabla, filas: Array.from({ length: 120 }, (_, i) => [`2026-09-${String((i % 28) + 1).padStart(2, '0')}`, `Cliente ${i} (ñ)`, i]) });
    const s = pdf.toString('latin1');
    expect(s.startsWith('%PDF-1.4')).toBe(true);
    expect(s.trimEnd().endsWith('%%EOF')).toBe(true);
    const startxref = Number(/startxref\n(\d+)/.exec(s)![1]);
    expect(s.slice(startxref, startxref + 4)).toBe('xref');
    // Cada desplazamiento de la tabla apunta al inicio de su objeto.
    const entradas = s.slice(startxref).split('\n').filter(l => l.endsWith(' 00000 n ')).map(l => Number(l.slice(0, 10)));
    entradas.forEach((offset, i) => expect(s.slice(offset, offset + `${i + 1} 0 obj`.length)).toBe(`${i + 1} 0 obj`));
    expect(s).toContain('/Count 3');
    expect(s).toContain('Cliente 7 \\(\xf1\\)');
    expect(s).toContain('P\xe1gina 3 de 3');
  });
});
