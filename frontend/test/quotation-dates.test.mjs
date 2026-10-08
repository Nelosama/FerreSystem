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

test('formatDateOnlyHN handles date-only strings YYYY-MM-DD without day shift', () => {
  const formattedObj = formatDateOnlyHN('2026-10-08');
  assert.ok(formattedObj === '08/10/2026' || formattedObj === '8/10/2026', `Expected 08/10/2026, got ${formattedObj}`);

  const monthEnd = formatDateOnlyHN('2026-02-28');
  assert.ok(monthEnd === '28/02/2026' || monthEnd === '28/2/2026', `Expected 28/02/2026, got ${monthEnd}`);

  const leapYear = formatDateOnlyHN('2028-02-29');
  assert.ok(leapYear === '29/02/2028' || leapYear === '29/2/2028', `Expected 29/02/2028, got ${leapYear}`);

  assert.equal(formatDateOnlyHN('15/10/2026'), '15/10/2026');
});

test('formatDateHN formats 2026-10-08T00:00:00Z and 2026-10-08T03:00:00Z in America/Tegucigalpa timezone (UTC-6)', () => {
  // Midnight UTC on Oct 8 is 6:00 PM Oct 7 in Tegucigalpa
  const midnightUtc = '2026-10-08T00:00:00Z';
  const formattedMidnight = formatDateHN(midnightUtc);
  assert.ok(formattedMidnight === '07/10/2026' || formattedMidnight === '7/10/2026', `Expected 07/10/2026, got ${formattedMidnight}`);

  // 3:00 AM UTC on Oct 8 is 9:00 PM Oct 7 in Tegucigalpa
  const timestamp3am = '2026-10-08T03:00:00Z';
  const formatted3am = formatDateHN(timestamp3am);
  assert.ok(formatted3am === '07/10/2026' || formatted3am === '7/10/2026', `Expected 07/10/2026, got ${formatted3am}`);

  // 12:00 PM UTC on Oct 8 is 6:00 AM Oct 8 in Tegucigalpa
  const timestampNoon = '2026-10-08T12:00:00Z';
  const formattedNoon = formatDateHN(timestampNoon);
  assert.ok(formattedNoon === '08/10/2026' || formattedNoon === '8/10/2026', `Expected 08/10/2026, got ${formattedNoon}`);
});

test('formatDateHN delegates date-only string 2026-10-08 to formatDateOnlyHN', () => {
  const dateOnly = '2026-10-08';
  const formatted = formatDateHN(dateOnly);
  assert.ok(formatted === '08/10/2026' || formatted === '8/10/2026', `Expected 08/10/2026, got ${formatted}`);
});

test('prevents double-formatting of already formatted DD/MM/YYYY dates', () => {
  assert.equal(formatDateHN('08/10/2026'), '08/10/2026');
  assert.equal(formatDateOnlyHN('08/10/2026'), '08/10/2026');
});
