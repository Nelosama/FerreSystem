import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const configuration = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
const cabeceras = Object.fromEntries(
  configuration.headers.filter((regla) => regla.source === '/(.*)').flatMap((regla) => regla.headers.map(({ key, value }) => [key, value])),
);

test('security headers apply to every route', () => {
  assert.ok(configuration.headers.some((regla) => regla.source === '/(.*)'));
});

test('browsers must not sniff content types', () => {
  assert.equal(cabeceras['X-Content-Type-Options'], 'nosniff');
});

test('the app cannot be framed by other sites', () => {
  assert.equal(cabeceras['X-Frame-Options'], 'SAMEORIGIN');
});

test('camera stays available to the app itself for barcode scanning', () => {
  assert.match(cabeceras['Permissions-Policy'], /camera=\(self\)/);
  assert.match(cabeceras['Permissions-Policy'], /microphone=\(\)/);
});

test('HSTS is enabled for the deployed frontend', () => {
  assert.match(cabeceras['Strict-Transport-Security'], /max-age=\d{7,}/);
});

test('the SPA rewrite is preserved next to the headers', () => {
  assert.deepEqual(configuration.rewrites, [{ source: '/(.*)', destination: '/index.html' }]);
});
