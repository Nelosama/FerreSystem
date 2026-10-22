/**
 * marca-jowa-guard.test.mjs
 *
 * Guardia de regresión de la identidad visible: la plataforma se llama Jowa System y el panel
 * del negocio no muestra la sección «En preparación». Solo se revisan textos visibles; los
 * identificadores internos, rutas, claves de traducción y datos de prueba quedan fuera.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

test('título, manifiesto y metadatos usan Jowa System', () => {
  assert.match(read('index.html'), /<title>Jowa System — /);
  const manifest = JSON.parse(read('public/manifest.webmanifest'));
  assert.equal(manifest.name, 'Jowa System');
  assert.equal(manifest.short_name, 'Jowa System');
});

test('no quedan referencias comerciales a FerreSystem en la interfaz', () => {
  const archivos = [
    'index.html',
    'public/manifest.webmanifest',
    'src/components/Sidebar.tsx',
    'src/components/TopNavigation.tsx',
    'src/components/TenantBrand.tsx',
    'src/components/ReciboPDF.tsx',
    'src/context/TenantContext.tsx',
    'src/utils/tenantSettings.ts',
    'src/pages/LoginPage.tsx',
    'src/pages/POSPage.tsx',
    'src/utils/barcodeScanner.ts',
  ];
  for (const rel of archivos) {
    assert.doesNotMatch(read(rel), /FerreSystem|FERRESYSTEM|Ferresystem/, rel);
  }
});

test('el panel del negocio no incluye la sección «En preparación» ni indicadores pendientes', () => {
  const home = read('src/pages/admin/AdminHomePage.tsx');
  assert.doesNotMatch(home, /En preparación|Próximamente|PROXIMAMENTE/);
});

test('el logotipo de la marca enlaza a Inicio en Sidebar y TopNav', () => {
  // El nombre accesible se traduce (navigation.home_link) y sigue nombrando a Jowa System en ES y EN.
  assert.match(read('src/components/Sidebar.tsx'), /<NavLink to="\/" aria-label=\{t\('navigation.home_link'\)\}/);
  assert.match(read('src/components/TopNavigation.tsx'), /<NavLink to="\/" aria-label=\{t\('navigation.home_link'\)\}/);
  assert.equal(JSON.parse(read('src/locales/es.json')).navigation.home_link, 'Jowa System: ir a Inicio');
  assert.match(JSON.parse(read('src/locales/en.json')).navigation.home_link, /^Jowa System: /);
});
