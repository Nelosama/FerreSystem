import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const loadJson = (filePath) => {
  const content = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(content);
};

const flattenDict = (d, parentKey = '', sep = '.') => {
  let items = [];
  for (const [k, v] of Object.entries(d)) {
    const newKey = parentKey ? `${parentKey}${sep}${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      items = items.concat(Object.entries(flattenDict(v, newKey, sep)));
    } else {
      items.push([newKey, v]);
    }
  }
  return Object.fromEntries(items);
};

const esPath = fs.existsSync('src/locales/es.json') ? 'src/locales/es.json' : 'frontend/src/locales/es.json';
const enPath = fs.existsSync('src/locales/en.json') ? 'src/locales/en.json' : 'frontend/src/locales/en.json';

const esData = loadJson(esPath);
const enData = loadJson(enPath);

const flatEs = flattenDict(esData);
const flatEn = flattenDict(enData);

test('Dictionary key parity between ES and EN', () => {
  const esKeys = Object.keys(flatEs).sort();
  const enKeys = Object.keys(flatEn).sort();

  assert.equal(esKeys.length, enKeys.length, `Key count mismatch: ES (${esKeys.length}) vs EN (${enKeys.length})`);

  const missingInEn = esKeys.filter((k) => !(k in flatEn));
  const missingInEs = enKeys.filter((k) => !(k in flatEs));

  assert.deepEqual(missingInEn, [], `Keys missing in EN: ${missingInEn.join(', ')}`);
  assert.deepEqual(missingInEs, [], `Keys missing in ES: ${missingInEs.join(', ')}`);
});

test('No raw or missing translation placeholders in ES dictionary values', () => {
  for (const [key, val] of Object.entries(flatEs)) {
    assert.ok(typeof val === 'string' && val.trim().length > 0, `Empty translation string in ES for key: ${key}`);
    assert.ok(!val.includes('[MISSING]'), `Key ${key} has missing indicator in ES`);
  }
});

test('No raw or missing translation placeholders in EN dictionary values', () => {
  for (const [key, val] of Object.entries(flatEn)) {
    assert.ok(typeof val === 'string' && val.trim().length > 0, `Empty translation string in EN for key: ${key}`);
    assert.ok(!val.includes('[MISSING]'), `Key ${key} has missing indicator in EN`);
  }
});

test('Parameter interpolation placeholders consistency', () => {
  for (const [key, esVal] of Object.entries(flatEs)) {
    if (typeof esVal === 'string' && esVal.includes('{')) {
      const esParams = (esVal.match(/\{(\w+)\}/g) || []).sort();
      const enVal = flatEn[key];
      if (typeof enVal === 'string') {
        const enParams = (enVal.match(/\{(\w+)\}/g) || []).sort();
        assert.deepEqual(esParams, enParams, `Mismatch in interpolation parameter names for key: ${key}`);
      }
    }
  }
});

test('Navigation & Menu keys existence', () => {
  const requiredNavKeys = [
    'menu.dashboard',
    'menu.inventory',
    'menu.pos',
    'menu.quotations',
    'menu.layaway',
    'menu.cash_drawer',
    'menu.purchase_orders',
    'menu.transfers',
    'menu.warranties',
    'menu.special_orders',
    'menu.price_lists',
    'menu.commissions',
    'menu.reports',
    'menu.stock_taking',
    'menu.configuration',
    'menu.super_admin',
    'navigation.SYSTEM',
    'navigation.OPERACION',
    'navigation.INVENTARIO',
    'navigation.CLIENTES',
    'navigation.GESTION',
    'navigation.ANALISIS',
    'navigation.CONFIGURACION',
  ];

  for (const navKey of requiredNavKeys) {
    assert.ok(navKey in flatEs, `Missing navigation key in ES: ${navKey}`);
    assert.ok(navKey in flatEn, `Missing navigation key in EN: ${navKey}`);
  }
});
