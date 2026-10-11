import 'reflect-metadata';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ResolverOperacionDto } from '../src/contingencia/dto/contingencia.dto';
import { VISIBLES_MINIMOS, caracteresVisibles, limpiarTextoLibre, longitudDeNegocio, mensajeTextoMinimo, validarTextoMinimo } from '../src/contingencia/texto-minimo';

// Política de longitud mínima (decisión del propietario) y residuos D-1/D-2 de la auditoría sobre 0ac3f741. No requiere base de datos.
const rep = (cp: number | string, n: number) => (typeof cp === 'number' ? String.fromCodePoint(cp) : cp).repeat(n);

describe('Vectores compartidos con el frontend', () => {
  const vectores = JSON.parse(readFileSync(resolve('../frontend/test/fixtures/texto-minimo-vectores.json'), 'utf8')).casos as Array<{ descripcion: string; texto: string; minimo: number; ok: boolean }>;
  it.each(vectores.map((v) => [v.descripcion, v] as const))('%s', (_d, v) => {
    expect(validarTextoMinimo(v.texto, v.minimo).ok).toBe(v.ok);
  });
});

describe('Texto mínimo: longitud de negocio con espacios + 3 caracteres visibles', () => {
  // [descripción, texto, mínimo, ¿válido?]
  const casos: Array<[string, string, number, boolean]> = [
    ['frase con espacios que antes se rechazaba (11 con espacios, 9 visibles)', 'Ya se cobró', 10, true],
    ['frase corta con 9 caracteres', 'Sin stock', 10, false],
    ['los espacios cuentan para la longitud', 'a b c d e f', 10, true],
    ['solo dos visibles aunque la longitud alcance', 'a        b', 10, false],
    ['tres visibles separados por espacios', 'a b      c', 10, true],
    ['espacios en los extremos no cuentan', '          abc', 10, false],
    ['solo espacios y saltos de línea', ' \n\t \n\t \n\t \n ', 10, false],
    ['exactamente 3 visibles y longitud suficiente con espacios internos', 'a   b   c ', 10, false],
    ['motivo de 20 con espacios', 'Caja cerrada por error del turno', 20, true],
    ['motivo de 19', 'abcdefghijklmnopqrs', 20, false],
    // D-1: privados, sin asignar y objeto de reemplazo no satisfacen el mínimo por sí solos
    ['D-1 uso privado U+E000 ×12', rep(0xe000, 12), 10, false],
    ['D-1 uso privado U+F8FF ×12', rep(0xf8ff, 12), 10, false],
    ['D-1 sin asignar U+0378 ×12', rep(0x378, 12), 10, false],
    ['D-1 no carácter U+FFFE ×12', rep(0xfffe, 12), 10, false],
    ['D-1 no carácter U+FDD0 ×12', rep(0xfdd0, 12), 10, false],
    ['D-1 objeto de reemplazo U+FFFC ×12', rep(0xfffc, 12), 10, false],
    ['D-1 sustitución U+FFFD ×12', rep(0xfffd, 12), 10, false],
    ['D-1 uso privado del plano 15 ×12', rep(0xf0000, 12), 10, false],
    ['D-1 tres visibles rellenados con privados', 'abc' + rep(0xe000, 7), 10, false],
    ['D-1 control U+0001 ×12', rep(1, 12), 10, false],
    ['D-1 tres visibles rellenados con controles', 'abc' + rep(1, 7), 10, false],
    // invisibles ya cubiertos por rondas anteriores
    ['marcas de combinación sueltas', rep(0x301, 12), 10, false],
    ['espacio de ancho cero', rep(0x200b, 12), 10, false],
    ['relleno hangul U+3164 ×12', rep(0x3164, 12), 10, false],
    ['selectores de variación suplementarios', rep(0xe0100, 12), 10, false],
    ['tres visibles rellenados con ZWSP', 'abc' + rep(0x200b, 7), 10, false],
    // D-2: escrituras legítimas
    ['D-2 hindi corto con signos vocálicos', 'मैंने सामान लौटाया है', 10, true],
    ['D-2 hindi 19 puntos de código', 'नमस्ते दुनिया कैसे हो', 10, true],
    ['D-2 hindi con virama y matras', 'क्षत्रिय ज्ञान प्रश्न', 10, true],
    ['D-2 árabe', 'تم إلغاء العملية بالخطأ', 10, true],
    ['D-2 tailandés con marcas', 'ยกเลิกรายการโดยผิดพลาด', 10, true],
    ['D-2 japonés', '誤って取引を取り消しました', 10, true],
    ['D-2 coreano', '실수로 거래를 취소했습니다', 10, true],
    ['D-2 español NFC', 'Devolución del niño por error', 10, true],
    ['D-2 español NFD (n + virgulilla combinante)', 'Devolución del niño', 10, true],
    ['D-2 español con signos', '¿Qué pasó?¡', 10, true],
    ['D-2 emoji ×10', rep('😀', 10), 10, true],
    ['D-2 secuencia con ZWJ (se limpia el unión, quedan los emoji)', '👨‍👩‍👧‍👦👨‍👩‍👧‍👦👨‍👩‍👧‍👦👨‍👩‍👧‍👦', 10, true],
    ['D-2 número de pieza', 'Nº 5 ref. 2026-10', 10, true],
  ];
  it.each(casos)('%s', (_d, texto, minimo, ok) => {
    const r = validarTextoMinimo(texto, minimo);
    expect(r.ok, JSON.stringify({ longitud: r.longitud, visibles: r.visibles })).toBe(ok);
  });

  it('un valor que no es texto nunca es válido', () => {
    for (const v of [undefined, null, 12345678901, {}, [], true]) expect(validarTextoMinimo(v, 1).ok).toBe(false);
  });

  it('las marcas de combinación cuentan en la longitud pero no como visibles por sí solas', () => {
    expect(longitudDeNegocio('नमस्ते')).toBe(6);
    expect(caracteresVisibles('́́́́')).toBe(0);
    expect(caracteresVisibles('ab́c')).toBe(3);
  });

  it('limpiarTextoLibre recorta y quita caracteres de formato, pero conserva el texto legítimo', () => {
    expect(limpiarTextoLibre('  ​hola⁠ mundo  ')).toBe('hola mundo');
    expect(limpiarTextoLibre('Nº 5 😀')).toBe('Nº 5 😀');
  });

  it('el DTO aplica la misma regla y devuelve el mismo mensaje que la interfaz', async () => {
    const mala = plainToInstance(ResolverOperacionDto, { accion: 'CERRAR_MANUAL', nota: 'ab        c'.replace('c', ' ') } as any);
    const errores = await validate(mala);
    const msg = Object.values(errores.find((e) => e.property === 'nota')?.constraints ?? {});
    expect(msg).toContain(mensajeTextoMinimo(10));
    const buena = plainToInstance(ResolverOperacionDto, { accion: 'CERRAR_MANUAL', nota: 'Ya se cobró' } as any);
    expect((await validate(buena)).filter((e) => e.property === 'nota')).toHaveLength(0);
    const motivo = plainToInstance(ResolverOperacionDto, { accion: 'CERRAR_MANUAL', nota: 'Ya se cobró', regularizarCajaCerrada: true, motivoRegularizacion: rep(0xe000, 25) } as any);
    expect((await validate(motivo)).some((e) => e.property === 'motivoRegularizacion')).toBe(true);
    expect(mensajeTextoMinimo(20)).toContain('20 caracteres (los espacios cuentan)');
    expect(mensajeTextoMinimo(20)).toContain(`${VISIBLES_MINIMOS} letras, números o símbolos visibles`);
  });

  it('el módulo del backend y el del frontend son el mismo archivo (la interfaz aplica exactamente la regla del servidor)', () => {
    const backend = readFileSync(resolve('src/contingencia/texto-minimo.ts'), 'utf8');
    const frontend = readFileSync(resolve('../frontend/src/utils/textoMinimo.ts'), 'utf8');
    expect(frontend).toBe(backend);
  });
});
