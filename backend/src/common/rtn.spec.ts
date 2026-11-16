import { BadRequestException } from '@nestjs/common';
import { DIGITOS_RTN, normalizarRtn, rtnOpcional } from './rtn';
import { normalizarRtn as normalizarRtnContabilidad } from '../contabilidad/fiscal-hn';

// Etapa 4 (decisión del dueño del 2026-11-12): RTN vacío o de exactamente 14 dígitos; separadores visuales admitidos.
describe('RTN: regla común', () => {
  it('acepta 14 dígitos con o sin espacios y guiones, y guarda solo los dígitos', () => {
    for (const valor of ['08011999000001', '0801-1999-000001', '0801 1999 000001', '  0801-1999 000001  ', '0-8-0-1-1-9-9-9-0-0-0-0-0-1']) {
      expect(normalizarRtn(valor)).toBe('08011999000001');
      expect(rtnOpcional(valor)).toBe('08011999000001');
    }
    expect(DIGITOS_RTN).toBe(14);
  });

  it('rechaza 13 o 15 dígitos, letras y otros separadores con un mensaje en español', () => {
    for (const valor of ['0801199900000', '080119990000011', 'abc', '0801199900000A', '0801.1999.000001', '0801/1999/000001', '+50408011999000']) {
      expect(() => rtnOpcional(valor, 'RTN del cliente')).toThrow(BadRequestException);
      expect(() => rtnOpcional(valor, 'RTN del cliente')).toThrow(/RTN del cliente: debe tener exactamente 14 dígitos/);
    }
  });

  it('vacío, en blanco o ausente es un RTN no pedido: null', () => {
    for (const valor of [undefined, null, '', '   ']) expect(rtnOpcional(valor)).toBeNull();
    // Solo separadores no es «vacío»: es un RTN mal escrito.
    expect(() => rtnOpcional('- -')).toThrow(BadRequestException);
  });

  it('un valor que no es texto se rechaza (400), nunca 500', () => {
    for (const valor of [8011999000001, {}, [], true]) expect(() => rtnOpcional(valor)).toThrow(BadRequestException);
    expect(() => normalizarRtn(undefined)).toThrow(/valor requerido/);
  });

  it('Contabilidad usa la misma regla', () => {
    expect(normalizarRtnContabilidad).toBe(normalizarRtn);
  });
});
