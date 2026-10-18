import { BarcodeFormat, ChecksumException, EAN13Reader, NotFoundException, OneDReader, Result, ResultPoint } from '@zxing/library';
import type { BitArray } from '@zxing/library';

// Compatibility adapter for @zxing/library 0.23.0's experimental UPC-E reader.
// Its decodeMiddle returns a number where its parent expects {rowOffset,resultString};
// it also uses the EAN end guard/checksum and expands ASCII codes as digits.
// Reuse ZXing's row sampling, digit matching, guard matching and checksum instead.
const PARITIES = [
  [0x38, 0x34, 0x32, 0x31, 0x2c, 0x26, 0x23, 0x2a, 0x29, 0x25],
  [0x07, 0x0b, 0x0d, 0x0e, 0x13, 0x19, 0x1c, 0x15, 0x16, 0x1a],
];
const END = Int32Array.from([1, 1, 1, 1, 1, 1]);

export function expandUpce(code: string): string {
  const digits = code.slice(1, 7), last = digits[5];
  let body: string;
  if ('012'.includes(last)) body = digits.slice(0, 2) + last + '0000' + digits.slice(2, 5);
  else if (last === '3') body = digits.slice(0, 3) + '00000' + digits.slice(3, 5);
  else if (last === '4') body = digits.slice(0, 4) + '00000' + digits[4];
  else body = digits.slice(0, 5) + '0000' + last;
  return code[0] + body + code[7];
}

export class UpceReader extends OneDReader {
  constructor() {
    super();
    // Initialize the shared L/G patterns via the supported EAN reader.
    new EAN13Reader();
  }
  decodeRow(rowNumber: number, row: BitArray): Result {
    const start = EAN13Reader.findStartGuardPattern(row);
    const counters = new Int32Array(4);
    let offset = start[1], digits = '', parity = 0;
    for (let i = 0; i < 6; i++) {
      const match = EAN13Reader.decodeDigit(row, counters, offset, EAN13Reader.L_AND_G_PATTERNS);
      digits += String(match % 10);
      for (const width of counters) offset += width;
      if (match >= 10) parity |= 1 << (5 - i);
    }
    let code = '';
    for (let system = 0; system <= 1; system++) {
      const check = PARITIES[system].indexOf(parity);
      if (check >= 0) { code = String(system) + digits + String(check); break; }
    }
    if (!code) throw NotFoundException.getNotFoundInstance();
    const end = EAN13Reader.findGuardPatternWithoutCounters(row, offset, true, END);
    const quietEnd = end[1] + end[1] - end[0];
    if (quietEnd >= row.getSize() || !row.isRange(end[1], quietEnd, false)) throw NotFoundException.getNotFoundInstance();
    if (!EAN13Reader.checkStandardUPCEANChecksum(expandUpce(code))) throw ChecksumException.getChecksumInstance();
    return new Result(code, new Uint8Array(0), 0, [new ResultPoint((start[0] + start[1]) / 2, rowNumber), new ResultPoint((end[0] + end[1]) / 2, rowNumber)], BarcodeFormat.UPC_E, Date.now());
  }
}
