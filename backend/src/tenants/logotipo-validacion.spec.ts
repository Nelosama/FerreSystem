import { describe, expect, it } from 'vitest';
import { PayloadTooLargeException, UnprocessableEntityException, UnsupportedMediaTypeException } from '@nestjs/common';
import { LIMITE_LOGOTIPO_BYTES, detectarTipoLogotipo, dimensionesLogotipo, validarLogotipo } from './logotipo-validacion';

// Cabeceras mínimas reales de cada formato. La validación comprueba firma, tipo y dimensiones;
// no decodifica píxeles (no hay librería de imagen en el backend). Ver docs/CONTEXTO_MAESTRO.md.
const png = (ancho: number, alto: number) => {
  const datos = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(datos, 0);
  datos.writeUInt32BE(13, 8);
  datos.write('IHDR', 12, 'latin1');
  datos.writeUInt32BE(ancho, 16);
  datos.writeUInt32BE(alto, 20);
  return datos;
};
const jpeg = (ancho: number, alto: number) => {
  const app0 = Buffer.from([0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00]);
  const sof0 = Buffer.alloc(19);
  sof0[0] = 0xff; sof0[1] = 0xc0; sof0.writeUInt16BE(0x0011, 2); sof0[4] = 8; sof0.writeUInt16BE(alto, 5); sof0.writeUInt16BE(ancho, 7); sof0[9] = 3;
  return Buffer.concat([Buffer.from([0xff, 0xd8]), app0, sof0, Buffer.from([0xff, 0xd9])]);
};
const webpVp8x = (ancho: number, alto: number) => {
  const datos = Buffer.alloc(30);
  datos.write('RIFF', 0, 'latin1'); datos.writeUInt32LE(22, 4); datos.write('WEBP', 8, 'latin1'); datos.write('VP8X', 12, 'latin1');
  datos.writeUInt32LE(10, 16);
  datos.writeUIntLE(ancho - 1, 24, 3); datos.writeUIntLE(alto - 1, 27, 3);
  return datos;
};
const webpVp8l = (ancho: number, alto: number) => {
  const datos = Buffer.alloc(25);
  datos.write('RIFF', 0, 'latin1'); datos.writeUInt32LE(17, 4); datos.write('WEBP', 8, 'latin1'); datos.write('VP8L', 12, 'latin1');
  datos.writeUInt32LE(5, 16); datos[20] = 0x2f;
  datos.writeUInt32LE(((alto - 1) << 14) | (ancho - 1), 21);
  return datos;
};

describe('validación de logotipos', () => {
  it('identifica PNG, JPEG y WEBP por firma binaria', () => {
    expect(detectarTipoLogotipo(png(2, 2))).toBe('image/png');
    expect(detectarTipoLogotipo(jpeg(2, 2))).toBe('image/jpeg');
    expect(detectarTipoLogotipo(webpVp8x(2, 2))).toBe('image/webp');
  });

  it('lee dimensiones de cada formato', () => {
    expect(dimensionesLogotipo(png(640, 320), 'image/png')).toEqual({ ancho: 640, alto: 320 });
    expect(dimensionesLogotipo(jpeg(300, 120), 'image/jpeg')).toEqual({ ancho: 300, alto: 120 });
    expect(dimensionesLogotipo(webpVp8x(512, 256), 'image/webp')).toEqual({ ancho: 512, alto: 256 });
    expect(dimensionesLogotipo(webpVp8l(77, 33), 'image/webp')).toEqual({ ancho: 77, alto: 33 });
  });

  it('acepta un logotipo válido y devuelve su tipo real', () => {
    expect(validarLogotipo(png(200, 80), 'image/png')).toMatchObject({ mime: 'image/png', ancho: 200, alto: 80 });
    expect(validarLogotipo(jpeg(200, 80), 'image/jpg')).toMatchObject({ mime: 'image/jpeg' }); // MIME con variante habitual
    expect(validarLogotipo(webpVp8x(200, 80), undefined)).toMatchObject({ mime: 'image/webp' });
  });

  it('rechaza SVG, HTML y texto aunque declaren imagen', () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
    const html = Buffer.from('<!doctype html><script>alert(1)</script>');
    expect(() => validarLogotipo(svg, 'image/png')).toThrow(UnsupportedMediaTypeException);
    expect(() => validarLogotipo(html, 'image/jpeg')).toThrow(UnsupportedMediaTypeException);
  });

  it('rechaza un MIME declarado distinto del contenido real', () => {
    expect(() => validarLogotipo(png(10, 10), 'image/jpeg')).toThrow(UnsupportedMediaTypeException);
  });

  it('limita el tamaño a 2 MB y rechaza archivos vacíos', () => {
    const grande = Buffer.concat([png(10, 10), Buffer.alloc(LIMITE_LOGOTIPO_BYTES)]);
    expect(() => validarLogotipo(grande, 'image/png')).toThrow(PayloadTooLargeException);
    expect(() => validarLogotipo(Buffer.alloc(0), 'image/png')).toThrow(UnprocessableEntityException);
  });

  it('rechaza dimensiones fuera de rango y cabeceras truncadas', () => {
    expect(() => validarLogotipo(png(0, 10), 'image/png')).toThrow(UnprocessableEntityException);
    expect(() => validarLogotipo(png(5000, 10), 'image/png')).toThrow(UnprocessableEntityException);
    expect(() => validarLogotipo(png(10, 10).subarray(0, 20), 'image/png')).toThrow(UnprocessableEntityException);
  });
});
