import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const project = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const prepare = join(project, 'deploy/local/prepare.mjs');
const agregar = join(project, 'deploy/local/agregar-clave-contingencia.mjs');
const posixOnly = { skip: process.platform === 'win32' };
const entorno = (d) => ({ PATH: process.env.PATH, DOCKER_CONFIG: d });

test('prepare crea el secreto de la contingencia, privado, de al menos 32 caracteres, y compose lo entrega al backend', posixOnly, t => {
  const directory = mkdtempSync(join(tmpdir(), 'ferre-clave-contingencia-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const target = join(directory, 'privado');
  const r = spawnSync(process.execPath, [prepare, target, 'fixture.lan', 'fixture@example.test', 'Fixture'], { env: entorno(directory), encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  const archivo = join(target, 'secrets', 'contingencia_clave_operaciones');
  assert.ok(existsSync(archivo));
  assert.equal(statSync(archivo).mode & 0o777, 0o600);
  const valor = readFileSync(archivo, 'utf8');
  assert.ok(valor.length >= 32);
  assert.notEqual(valor, readFileSync(join(target, 'secrets', 'jwt_secret'), 'utf8'), 'independiente de jwt_secret');
  assert.equal(r.stdout.includes(valor) || r.stderr.includes(valor), false, 'no se imprime el valor');
  const compose = readFileSync(join(project, 'deploy/local/compose.yaml'), 'utf8');
  assert.match(compose, /secrets: \[database_password, jwt_secret, contingencia_clave_operaciones, initial_admin_password\]/);
  assert.match(compose, /contingencia_clave_operaciones: \{file: '\$\{SECRETS_DIRECTORY\}\/contingencia_clave_operaciones'\}/);
  const entrada = readFileSync(join(project, 'backend/scripts/container-entry.mjs'), 'utf8');
  assert.match(entrada, /\/run\/secrets\/contingencia_clave_operaciones/);
});

test('instalación existente: agregar-clave-contingencia crea el secreto sin imprimirlo y no lo reemplaza', posixOnly, t => {
  const directory = mkdtempSync(join(tmpdir(), 'ferre-clave-contingencia-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const target = join(directory, 'existente');
  mkdirSync(join(target, 'secrets'), { recursive: true, mode: 0o700 });
  writeFileSync(join(target, 'secrets', 'jwt_secret'), 'x'.repeat(48), { mode: 0o600 });
  const primera = spawnSync(process.execPath, [agregar, target], { env: entorno(directory), encoding: 'utf8' });
  assert.equal(primera.status, 0, primera.stderr);
  const archivo = join(target, 'secrets', 'contingencia_clave_operaciones');
  const valor = readFileSync(archivo, 'utf8');
  assert.equal(statSync(archivo).mode & 0o777, 0o600);
  assert.ok(valor.length >= 32);
  assert.equal(primera.stdout.includes(valor), false);
  const segunda = spawnSync(process.execPath, [agregar, target], { env: entorno(directory), encoding: 'utf8' });
  assert.notEqual(segunda.status, 0);
  assert.match(segunda.stderr, /ya existe; no se reemplaza/);
  assert.equal(readFileSync(archivo, 'utf8'), valor, 'el valor existente no cambia');
  assert.equal(segunda.stderr.includes(valor), false);
});

test('agregar-clave-contingencia rechaza destinos dentro del repositorio o sin directorio de secretos', posixOnly, t => {
  const dentro = spawnSync(process.execPath, [agregar, join(project, 'tmp-no-usar')], { env: { PATH: process.env.PATH }, encoding: 'utf8' });
  assert.notEqual(dentro.status, 0);
  assert.match(dentro.stderr, /fuera del repositorio/);
  assert.ok(!existsSync(join(project, 'tmp-no-usar')));
  const directory = mkdtempSync(join(tmpdir(), 'ferre-clave-contingencia-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const vacio = spawnSync(process.execPath, [agregar, join(directory, 'sin-secretos')], { env: { PATH: process.env.PATH }, encoding: 'utf8' });
  assert.notEqual(vacio.status, 0);
  assert.match(vacio.stderr, /Ejecute primero prepare\.mjs/);
});
