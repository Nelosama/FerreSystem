import { PayloadTooLargeException, UnprocessableEntityException, UnsupportedMediaTypeException } from '@nestjs/common';

/** Límite inicial acordado para logotipos corporativos. */
export const LIMITE_LOGOTIPO_BYTES = 2 * 1024 * 1024;
/** Dimensión máxima por lado; evita imágenes que consumen memoria desproporcionada al mostrarse. */
export const DIMENSION_MAXIMA_LOGOTIPO = 4096;

export type TipoLogotipo = 'image/png' | 'image/jpeg' | 'image/webp';
export const TIPOS_LOGOTIPO: readonly TipoLogotipo[] = ['image/png', 'image/jpeg', 'image/webp'];

export interface LogotipoValidado {
  mime: TipoLogotipo;
  bytes: number;
  ancho: number;
  alto: number;
}

/** Identifica el formato por su firma binaria, nunca por el nombre o el MIME declarado. */
export function detectarTipoLogotipo(datos: Buffer): TipoLogotipo | null {
  if (datos.length >= 8 && datos.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (datos.length >= 3 && datos[0] === 0xff && datos[1] === 0xd8 && datos[2] === 0xff) return 'image/jpeg';
  if (datos.length >= 12 && datos.subarray(0, 4).toString('latin1') === 'RIFF' && datos.subarray(8, 12).toString('latin1') === 'WEBP') return 'image/webp';
  return null;
}

/** Lee ancho y alto desde la cabecera del formato. Devuelve null si la cabecera no es coherente. */
export function dimensionesLogotipo(datos: Buffer, mime: TipoLogotipo): { ancho: number; alto: number } | null {
  if (mime === 'image/png') {
    if (datos.length < 24 || datos.subarray(12, 16).toString('latin1') !== 'IHDR') return null;
    return { ancho: datos.readUInt32BE(16), alto: datos.readUInt32BE(20) };
  }
  if (mime === 'image/jpeg') return dimensionesJpeg(datos);
  return dimensionesWebp(datos);
}

function dimensionesJpeg(datos: Buffer): { ancho: number; alto: number } | null {
  let i = 2;
  while (i + 9 < datos.length) {
    if (datos[i] !== 0xff) return null;
    const marcador = datos[i + 1];
    if (marcador === 0xd8 || marcador === 0x01 || (marcador >= 0xd0 && marcador <= 0xd7)) { i += 2; continue; }
    const longitud = datos.readUInt16BE(i + 2);
    // SOF0–SOF15 excepto DHT (C4), JPG (C8) y DAC (CC): contienen alto y ancho del fotograma.
    if (marcador >= 0xc0 && marcador <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marcador)) {
      return { alto: datos.readUInt16BE(i + 5), ancho: datos.readUInt16BE(i + 7) };
    }
    i += 2 + longitud;
  }
  return null;
}

function dimensionesWebp(datos: Buffer): { ancho: number; alto: number } | null {
  const formato = datos.subarray(12, 16).toString('latin1');
  if (formato === 'VP8X' && datos.length >= 30) {
    return { ancho: 1 + datos.readUIntLE(24, 3), alto: 1 + datos.readUIntLE(27, 3) };
  }
  if (formato === 'VP8 ' && datos.length >= 30 && datos[23] === 0x9d && datos[24] === 0x01 && datos[25] === 0x2a) {
    return { ancho: datos.readUInt16LE(26) & 0x3fff, alto: datos.readUInt16LE(28) & 0x3fff };
  }
  if (formato === 'VP8L' && datos.length >= 25 && datos[20] === 0x2f) {
    const bits = datos.readUInt32LE(21);
    return { ancho: (bits & 0x3fff) + 1, alto: ((bits >> 14) & 0x3fff) + 1 };
  }
  return null;
}

/**
 * Valida el contenido real de un logotipo subido. Rechaza SVG, HTML y cualquier formato no listado,
 * aunque el cliente declare otro MIME, y limita tamaño y dimensiones.
 */
export function validarLogotipo(datos: Buffer, mimeDeclarado: string | undefined): LogotipoValidado {
  if (datos.length === 0) throw new UnprocessableEntityException('El archivo del logotipo está vacío');
  if (datos.length > LIMITE_LOGOTIPO_BYTES) throw new PayloadTooLargeException('El logotipo supera el límite de 2 MB');
  const mime = detectarTipoLogotipo(datos);
  if (!mime) throw new UnsupportedMediaTypeException('Formato no permitido: use PNG, JPG o WEBP');
  // «image/jpg» no es un tipo estándar, pero algunos clientes lo envían: se trata como image/jpeg.
  const declarado = mimeDeclarado?.split(';')[0].trim().toLowerCase().replace('image/jpg', 'image/jpeg');
  if (declarado && declarado !== mime) {
    throw new UnsupportedMediaTypeException('El tipo declarado no coincide con el contenido del archivo');
  }
  const dimensiones = dimensionesLogotipo(datos, mime);
  if (!dimensiones || dimensiones.ancho < 1 || dimensiones.alto < 1) throw new UnprocessableEntityException('La imagen está dañada o no se puede leer');
  if (dimensiones.ancho > DIMENSION_MAXIMA_LOGOTIPO || dimensiones.alto > DIMENSION_MAXIMA_LOGOTIPO) {
    throw new UnprocessableEntityException(`Las dimensiones no pueden superar ${DIMENSION_MAXIMA_LOGOTIPO} px por lado`);
  }
  return { mime, bytes: datos.length, ancho: dimensiones.ancho, alto: dimensiones.alto };
}
