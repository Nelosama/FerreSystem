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
const context = { exports: {}, require, Uint8ClampedArray };
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
  ['UPC-A', ean13('0012345678905'), '012345678905'],
  // Start C, 12, 34, 56, checksum 44, stop (fixed published bar patterns).
  ['CODE-128', code128(['211232', '112232', '131123', '331121', '132131', '2331112']), '123456'],
]) {
  test(`ZXing real lee ${format} de imagen sintética`, () => assert.equal(decode(image(bits)), expected));
}
test('un checksum EAN incorrecto no se acepta', () => assert.equal(decode(image(ean13('5901234123458'))), null));
