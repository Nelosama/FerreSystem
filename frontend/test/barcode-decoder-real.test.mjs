import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';

// Decodificador ZXing real con imágenes sintéticas según EAN/Code 128.
// No usa mocks de lector. No acredita iluminación, óptica ni cámara de iPhone.
const require = createRequire(import.meta.url);
const source = readFileSync(new URL('../src/utils/zxingDecoder.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const adapter = { exports: {}, require };
vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../src/utils/upceReader.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, adapter);
const context = { exports: {}, require: name => name === './upceReader' ? adapter.exports : require(name), Uint8ClampedArray };
vm.runInNewContext(compiled, context);
const decode = context.exports.createImageDecoder();

const L = ['0001101', '0011001', '0010011', '0111101', '0100011', '0110001', '0101111', '0111011', '0110111', '0001011'];
const invert = bits => [...bits].map(b => b === '1' ? '0' : '1').join('');
const G = L.map(bits => invert([...bits].reverse().join('')));
const R = L.map(invert);
const parity = ['LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG', 'LGGLLG', 'LGGGLL', 'LGLGLG', 'LGLGGL', 'LGGLGL'];
const ean13 = digits => '101' + [...digits.slice(1, 7)].map((d, i) => (parity[Number(digits[0])][i] === 'L' ? L : G)[Number(d)]).join('') + '01010' + [...digits.slice(7)].map(d => R[Number(d)]).join('') + '101';
const ean8 = digits => '101' + [...digits.slice(0, 4)].map(d => L[Number(d)]).join('') + '01010' + [...digits.slice(4)].map(d => R[Number(d)]).join('') + '101';
const code128 = patterns => patterns.map(pattern => [...pattern].map((width, i) => (i % 2 === 0 ? '1' : '0').repeat(Number(width))).join('')).join('');
function image(bits) {
  const modules = '0'.repeat(20) + bits + '0'.repeat(20);
  const width = modules.length * 3, height = 120;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const offset = (y * width + x) * 4;
    const value = y < 10 || y >= 110 || modules[Math.floor(x / 3)] === '0' ? 255 : 0;
    data[offset] = data[offset + 1] = data[offset + 2] = value; data[offset + 3] = 255;
  }
  return { data, width, height };
}
for (const [format, bits, expected] of [
  ['EAN-13', ean13('5901234123457'), '5901234123457'],
  ['EAN-8', ean8('96385074'), '96385074'],
  // UPC-E 04252614: number system 0, check digit 4 => parity GLGGLL (0x2c).
  ['UPC-E', '101' + [...'425261'].map((d, i) => ('G' === 'GLGGLL'[i] ? G : L)[Number(d)]).join('') + '010101', '04252614'],
  ['UPC-A', ean13('0012345678905'), '012345678905'],
  // Start C, 12, 34, 56, checksum 44, stop (fixed published bar patterns).
  ['CODE-128', code128(['211232', '112232', '131123', '331121', '132131', '2331112']), '123456'],
]) {
  test(`ZXing real lee ${format} de imagen sintética`, () => assert.equal(decode(image(bits)), expected));
}
test('un checksum EAN incorrecto no se acepta', () => assert.equal(decode(image(ean13('5901234123458'))), null));

// Independent printed UPC-E encoding table; checksum calculated from expanded UPC-A.
const upceParity = ['GGGLLL', 'GGLGLL', 'GGLLGL', 'GGLLLG', 'GLGGLL', 'GLLGGL', 'GLLLGG', 'GLGLGL', 'GLGLLG', 'GLLGLG'];
const upceBits = code => '101' + [...code.slice(1, 7)].map((d, i) => {
  const even = upceParity[Number(code[7])][i] === 'G';
  return (even !== (code[0] === '1') ? G : L)[Number(d)];
}).join('') + '010101';
const checkDigit = body => String((10 - [...body].reverse().reduce((sum, digit, i) => sum + Number(digit) * (i % 2 ? 1 : 3), 0) % 10) % 10);
for (const [compressed, expanded] of [
  ['0123450', '01200000345'], ['0123451', '01210000345'], ['0123452', '01220000345'],
  ['0123453', '01230000045'], ['0123454', '01234000005'], ['0123455', '01234500005'],
  ['0123456', '01234500006'], ['0123457', '01234500007'], ['0123458', '01234500008'], ['0123459', '01234500009'],
  ['1123450', '11200000345'], ['1123453', '11230000045'], ['1123454', '11234000005'], ['1123459', '11234500009'],
]) {
  const code = compressed + checkDigit(expanded);
  test(`UPC-E ${code} se conserva compacto y con cero inicial, expansión ${expanded}`, () => {
    assert.equal(adapter.exports.expandUpce(code), expanded + code[7]);
    assert.equal(decode(image(upceBits(code))), code);
  });
}
test('UPC-E con checksum incorrecto no se acepta', () => assert.equal(decode(image(upceBits('04252615'))), null));
test('UPC-E sin márgenes blancos no se acepta', () => {
  const modules = upceBits('04252614');
  const fixture = image(modules);
  // Crop the quiet zones from both sides.
  const width = modules.length * 3, data = new Uint8ClampedArray(width * fixture.height * 4);
  for (let y = 0; y < fixture.height; y++) data.set(fixture.data.subarray((y * fixture.width + 60) * 4, (y * fixture.width + 60 + width) * 4), y * width * 4);
  assert.equal(decode({ width, height: fixture.height, data }), null);
});
test('UPC-E invertido horizontalmente se lee por el muestreo ZXing', () => {
  const fixture = image(upceBits('04252614'));
  for (let y = 0; y < fixture.height; y++) {
    for (let x = 0; x < Math.floor(fixture.width / 2); x++) {
      const a = (y * fixture.width + x) * 4, b = (y * fixture.width + fixture.width - 1 - x) * 4;
      for (let i = 0; i < 4; i++) [fixture.data[a + i], fixture.data[b + i]] = [fixture.data[b + i], fixture.data[a + i]];
    }
  }
  assert.equal(decode(fixture), '04252614');
});
test('reproducción: el lector UPC-E incluido en 0.23.0 falla con la misma imagen válida', () => {
  const { BinaryBitmap, HybridBinarizer, RGBLuminanceSource } = require('@zxing/library');
  const Upstream = require('@zxing/library/cjs/core/oned/UPCEReader').default;
  const fixture = image(upceBits('04252614'));
  const luminance = Uint8ClampedArray.from({ length: fixture.width * fixture.height }, (_, i) => fixture.data[i * 4]);
  assert.throws(() => new Upstream().decode(new BinaryBitmap(new HybridBinarizer(new RGBLuminanceSource(luminance, fixture.width, fixture.height)))));
});

for (const system of ['0', '1']) for (let digit = 0; digit < 10; digit++) {
  const expanded = system + String(digit) + '2345' + '00009';
  const code = system + String(digit) + '23459' + checkDigit(expanded);
  test(`UPC-E sistema ${system}, checksum ${code[7]}: tabla de paridad completa`, () => {
    assert.equal(decode(image(upceBits(code))), code);
  });
}

test('UPC-E fuera de la fila central conserva la búsqueda de fotograma completo', () => {
  const fixture = image(upceBits('04252614'));
  for (let y = 25; y < fixture.height; y++) fixture.data.fill(255, y * fixture.width * 4, (y + 1) * fixture.width * 4);
  assert.equal(decode(fixture), '04252614');
});

test('fotograma UPC-E 1280×720: diagnóstico de tiempo, sin umbral dependiente del equipo', t => {
  const modules = '0'.repeat(20) + upceBits('04252614') + '0'.repeat(20);
  const data = new Uint8ClampedArray(1280 * 720 * 4).fill(255);
  for (let y = 280; y < 440; y++) for (let x = 480; x < 480 + modules.length * 3; x++) {
    if (modules[Math.floor((x - 480) / 3)] === '1') {
      const i = (y * 1280 + x) * 4; data[i] = data[i + 1] = data[i + 2] = 0;
    }
  }
  const milliseconds = [];
  for (let i = 0; i < 3; i++) {
    const started = performance.now();
    assert.equal(decode({ width: 1280, height: 720, data }), '04252614');
    milliseconds.push(Math.round(performance.now() - started));
  }
  t.diagnostic(`UPC-E 1280×720 (ms por fotograma, entorno local): ${milliseconds.join(', ')}`);
});
