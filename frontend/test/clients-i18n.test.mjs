import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('clients.new_client translation key exists in es and en locales', () => {
  const es = JSON.parse(fs.readFileSync('src/locales/es.json', 'utf8'));
  const en = JSON.parse(fs.readFileSync('src/locales/en.json', 'utf8'));

  assert.equal(es.clients?.new_client, 'Nuevo cliente');
  assert.equal(en.clients?.new_client, 'New customer');
});
