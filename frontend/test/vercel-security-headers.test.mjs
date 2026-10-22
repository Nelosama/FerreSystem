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

test('cross-origin requests do not send the full application URL as referrer', () => {
  assert.equal(cabeceras['Referrer-Policy'], 'strict-origin-when-cross-origin');
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

test('CSP: scripts solo del propio origen, sin unsafe-inline ni unsafe-eval (WASM permitido para el PDF)', () => {
  const csp = cabeceras['Content-Security-Policy'];
  assert.ok(csp, 'falta Content-Security-Policy');
  const directivas = Object.fromEntries(csp.split(';').map((d) => d.trim().split(/\s+/)).map(([k, ...v]) => [k, v]));
  assert.deepEqual(directivas['script-src'], ["'self'", "'wasm-unsafe-eval'"]);
  assert.deepEqual(directivas['object-src'], ["'none'"]);
  assert.deepEqual(directivas['base-uri'], ["'self'"]);
  assert.deepEqual(directivas['frame-ancestors'], ["'self'"]);
  assert.ok(!csp.includes("'unsafe-eval'"), 'unsafe-eval habilitaría eval de JavaScript');
  assert.ok(!directivas['script-src'].includes("'unsafe-inline'"));
  // La API productiva está en otro origen HTTPS; el WASM de react-pdf se carga desde data:.
  assert.deepEqual(directivas['connect-src'], ["'self'", 'https:', 'data:']);
});
