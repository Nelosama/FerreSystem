import { crc32 } from '../../src/contabilidad/excel';

// Lector mínimo de los .xlsx de Jowa System (ZIP sin compresión): para verificar el contenido sin dependencias.
export function leerZipXlsx(buf: Buffer): Record<string, string> {
  const fin = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (fin < 0) throw new Error('ZIP sin registro final');
  const cantidad = buf.readUInt16LE(fin + 10);
  let p = buf.readUInt32LE(fin + 16);
  const salida: Record<string, string> = {};
  for (let i = 0; i < cantidad; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('Directorio central inválido');
    const tam = buf.readUInt32LE(p + 20), crc = buf.readUInt32LE(p + 16);
    const nLen = buf.readUInt16LE(p + 28), eLen = buf.readUInt16LE(p + 30), cLen = buf.readUInt16LE(p + 32);
    const offset = buf.readUInt32LE(p + 42);
    const nombre = buf.subarray(p + 46, p + 46 + nLen).toString('utf8');
    const local = offset + 30 + buf.readUInt16LE(offset + 26) + buf.readUInt16LE(offset + 28);
    const datos = buf.subarray(local, local + tam);
    if (crc32(datos) !== crc) throw new Error(`CRC incorrecto en ${nombre}`);
    salida[nombre] = datos.toString('utf8');
    p += 46 + nLen + eLen + cLen;
  }
  return salida;
}

const decodificar = (s: string) => s.replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

export function nombresHojas(archivos: Record<string, string>): string[] {
  return [...archivos['xl/workbook.xml'].matchAll(/<sheet name="([^"]+)"/g)].map(m => decodificar(m[1]));
}

/** Valor de una celda: texto (inlineStr), número (v), o fórmula con su valor calculado. */
export function celda(archivos: Record<string, string>, hoja: number, ref: string): { texto?: string; numero?: number; formula?: string; estilo?: number } | null {
  const xml = archivos[`xl/worksheets/sheet${hoja}.xml`];
  const m = new RegExp(`<c r="${ref}"([^>]*)>(.*?)</c>`).exec(xml);
  if (!m) return null;
  const estilo = /s="(\d+)"/.exec(m[1]);
  const formula = /<f>(.*?)<\/f>/.exec(m[2]);
  const texto = /<t[^>]*>(.*?)<\/t>/.exec(m[2]);
  const v = /<v>(.*?)<\/v>/.exec(m[2]);
  return {
    estilo: estilo ? Number(estilo[1]) : undefined,
    formula: formula ? decodificar(formula[1]) : undefined,
    texto: texto ? decodificar(texto[1]) : undefined,
    numero: !texto && v ? Number(v[1]) : undefined,
  };
}

/** Todas las celdas de texto de una hoja, en orden (para buscar etiquetas). */
export function textosHoja(archivos: Record<string, string>, hoja: number): string[] {
  return [...archivos[`xl/worksheets/sheet${hoja}.xml`].matchAll(/<t[^>]*>(.*?)<\/t>/g)].map(m => decodificar(m[1]));
}
