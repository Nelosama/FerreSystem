import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const loadUtilsFormat = () => {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync('src/utils/format.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true },
  }).outputText;
  vm.runInNewContext(code, { exports });
  return exports;
};

const { formatDateHN, formatDateOnlyHN } = loadUtilsFormat();

test('formatDateOnlyHN handles date-only ISO strings without day shift', () => {
  // ISO date 2026-10-08T00:00:00.000Z should stay 08/10/2026 or 8/10/2026
  const formattedObj = formatDateOnlyHN('2026-10-08T00:00:00.000Z');
  assert.ok(formattedObj === '08/10/2026' || formattedObj === '8/10/2026', `Expected 08/10/2026 or 8/10/2026, got ${formattedObj}`);

  // Month boundary / end of month
  const monthEnd = formatDateOnlyHN('2026-02-28T00:00:00.000Z');
  assert.ok(monthEnd === '28/02/2026' || monthEnd === '28/2/2026', `Expected 28/02/2026, got ${monthEnd}`);

  // Leap year
  const leapYear = formatDateOnlyHN('2028-02-29T00:00:00.000Z');
  assert.ok(leapYear === '29/02/2028' || leapYear === '29/2/2028', `Expected 29/02/2028, got ${leapYear}`);

  // Already formatted string
  assert.equal(formatDateOnlyHN('15/10/2026'), '15/10/2026');
});

test('formatDateHN formats full timestamp ISO strings in Tegucigalpa timezone', () => {
  // Oct 8 03:00 UTC is Oct 7 21:00 in Tegucigalpa (UTC-6)
  const timestamp = '2026-10-08T03:00:00.000Z';
  const formatted = formatDateHN(timestamp);
  assert.ok(formatted === '07/10/2026' || formatted === '7/10/2026', `Expected 07/10/2026, got ${formatted}`);
});

test('formatDateHN routes date-only strings to formatDateOnlyHN to avoid day shift', () => {
  const dateOnly = '2026-10-08T00:00:00.000Z';
  const formatted = formatDateHN(dateOnly);
  assert.ok(formatted === '08/10/2026' || formatted === '8/10/2026', `Expected 08/10/2026, got ${formatted}`);
});
