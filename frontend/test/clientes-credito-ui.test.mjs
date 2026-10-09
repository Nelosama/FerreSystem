import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const src = fs.readFileSync(fs.existsSync('src/pages/ClientesPage.tsx') ? 'src/pages/ClientesPage.tsx' : 'frontend/src/pages/ClientesPage.tsx', 'utf8');

test('FS-02: Clientes administra el crédito mediante PATCH /clientes/:id/credito', () => {
  assert.match(src, /api\.patch\(`\/clientes\/\$\{clienteCredito\.id\}\/credito`/);
  assert.match(src, /creditoHabilitado: creditoActivo, limiteCredito: limite/);
  assert.match(src, /abrirCredito\(c\)/);
});

test('FS-02: límite vacío significa sin límite (null) y se rechazan negativos', () => {
  assert.match(src, /texto === '' \? null : Number\(texto\)/);
  assert.match(src, /limite < 0/);
});
