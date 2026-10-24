import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const configuration = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
// Vercel ejecuta ignoreCommand desde el directorio raíz del proyecto (frontend/).
const frontendDir = new URL('..', import.meta.url).pathname;

test('vercel.json respeta el límite de 256 caracteres de ignoreCommand (validación del esquema de Vercel)', () => {
  // Con 266 caracteres Vercel rechazó el despliegue: «ignoreCommand should NOT be longer than 256 characters».
  assert.equal(typeof configuration.ignoreCommand, 'string');
  assert.ok(configuration.ignoreCommand.length <= 256, `ignoreCommand mide ${configuration.ignoreCommand.length}`);
});
test('pilot branch is excluded from Git previews in Vercel configuration', () => {
  assert.equal(configuration.git.deploymentEnabled['fix/pilot-readiness'], false);
});
test('monetary audit branch is excluded from Git previews', () => {
  assert.equal(configuration.git.deploymentEnabled['codex/auditoria-precision-monetaria'], false);
});
test('session correction branch is excluded from Git previews', () => {
  assert.equal(configuration.git.deploymentEnabled['codex/fix-expired-sessions'], false);
});
for (const [branch, expected] of [
  ['fix/pilot-readiness', 0], ['nexus/review', 0], ['fix/inventario-inicial-seguro', 0],
  ['codex/auditoria-precision-monetaria', 0], ['codex/fix-expired-sessions', 0],
  ['fix/jowa-operacion-estable', 0], ['fix/jowa-operacion-estable-extra', 1],
  ['codex/fix-expired-sessions-extra', 1],
  ['codex/fix-camera-lifecycle-ios', 0], ['codex/fix-camera-lifecycle-ios-extra', 1],
  ['codex/estabilidad-operativa', 0], ['codex/estabilidad-operativa-extra', 1],
  ['codex/guia-control-modulos', 0], ['codex/guia-control-modulos-extra', 1],
  ['claude/sweet-davinci-vh7br4', 0], ['claude/sweet-davinci-vh7br4-extra', 1],
  ['main', 1], ['fix/auditoria-admin', 1], ['fix/pilot-readiness-extra', 1],
  ['claude/revision-seguridad-jowa-20261020', 0], ['claude/revision-seguridad-jowa-20261020-extra', 1],
]) {
  test(`Vercel ignoreCommand: ${branch} exits ${expected}`, { skip: process.platform === 'win32' }, () => {
    // Only evaluates Vercel's local decision; never invokes a deployment tool.
    const result = spawnSync('sh', ['-c', configuration.ignoreCommand], { cwd: frontendDir, env: { VERCEL_GIT_COMMIT_REF: branch }, encoding: 'utf8' });
    assert.equal(result.status, expected);
  });
}

test('operational stability branch is excluded from Git previews', () => {
  assert.equal(configuration.git.deploymentEnabled['codex/estabilidad-operativa'], false);
});

test('security review branch is excluded from automatic previews', () => {
  assert.equal(configuration.git.deploymentEnabled['claude/revision-seguridad-jowa-20261020'], false);
});

test('PR 195 no genera despliegues automáticos', () => {
  assert.equal(configuration.git.deploymentEnabled['claude/sweet-davinci-vh7br4'], false);
});
