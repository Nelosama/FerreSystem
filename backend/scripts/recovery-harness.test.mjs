import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

test('recovery rehearsal fails immediately if its isolated database cannot initialize', { skip: process.platform === 'win32' }, async t => {
  const tools = await mkdtemp(join(tmpdir(), 'pilot-recovery-failure-'));
  t.after(() => rm(tools, { recursive: true, force: true }));
  // No database or backend is started: inject an initdb failure, avoiding a
  // nested build. The harness must report nonzero rather than continue to API.
  await writeFile(join(tools, 'npm'), '#!/bin/sh\nexit 0\n', { mode: 0o700 });
  await writeFile(join(tools, 'initdb'), '#!/bin/sh\nexit 9\n', { mode: 0o700 });
  const script = join(dirname(fileURLToPath(import.meta.url)), 'simulacro-recuperacion.sh');
  const result = spawnSync('bash', [script], { env: { PATH: `${tools}:${process.env.PATH}`, PG_BIN: tools }, encoding: 'utf8', timeout: 15000 });
  assert.notEqual(result.status, null, 'no stalled wait for an API after database failure');
  assert.notEqual(result.status, 0);
  assert.doesNotMatch(result.stdout, /PASS:|Datos de prueba y backend/);
});
