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
  ['feat/contabilidad-honduras', 0], ['feat/contabilidad-honduras-extra', 1],
  ['codex/guia-control-modulos', 0], ['codex/guia-control-modulos-extra', 1],
  ['claude/sweet-davinci-vh7br4', 0], ['claude/sweet-davinci-vh7br4-extra', 1],
  ['claude/festive-lovelace-nfqn88', 0], ['claude/festive-lovelace-nfqn88-extra', 1],
  ['claude/zealous-hypatia-n3fjte', 0], ['claude/zealous-hypatia-n3fjte-extra', 1],
  ['claude/jowa-production-readiness-dq4no2', 0], ['claude/jowa-production-readiness-dq4no2-extra', 1],
  ['main', 0], ['fix/auditoria-admin', 1], ['fix/pilot-readiness-extra', 1],
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

// La integración autorizada conserva el sitio existente y requiere despliegue separado.
for (const branch of ['claude/persistencia-retencion-20261104', 'codex/pwa-aislamiento-20261103', 'claude/compassionate-mayer-73jljd', 'codex/pwa-integridad-20261103', 'main', 'fix/fase3-idempotencia-20261030', 'claude/sprint-contingencia-seguridad-ux-20261030', 'claude/prod-matriz-fiscal-20261030', 'claude/prod-auditoria-infra-20261030', 'claude/sharp-fermi-ryjhpl', 'claude/sprint-seguimiento-20261030', 'claude/focused-hawking-52oiqz', 'claude/sweet-ritchie-wrwsbo']) {
  test(`integración sin despliegue: ${branch} bloqueado por configuración y por ignoreCommand`, () => {
    assert.equal(configuration.git.deploymentEnabled[branch], false);
    const result = spawnSync('sh', ['-c', configuration.ignoreCommand], { cwd: frontendDir, env: { VERCEL_GIT_COMMIT_REF: branch }, encoding: 'utf8' });
    assert.equal(result.status, 0);
  });
}

// Etapa 4 (RTN): la rama no genera vistas previas; el bloqueo es por nombre exacto.
test('etapa 4 sin despliegue: claude/jowa-etapa4-rtn bloqueada por configuración y por ignoreCommand', () => {
  const branch = 'claude/jowa-etapa4-rtn';
  assert.equal(configuration.git.deploymentEnabled[branch], false);
  const ignorar = (ref) => spawnSync('sh', ['-c', configuration.ignoreCommand], { cwd: frontendDir, env: { VERCEL_GIT_COMMIT_REF: ref }, encoding: 'utf8' }).status;
  assert.equal(ignorar(branch), 0);
  assert.equal(ignorar(`${branch}-extra`), 1);
});

// A-02 (altas idempotentes, rama dependiente de #250): sin vistas previas; bloqueo por nombre exacto.
test('A-02 sin despliegue: claude/nifty-cannon-q0ourg bloqueada por configuración y por ignoreCommand', () => {
  const branch = 'claude/nifty-cannon-q0ourg';
  assert.equal(configuration.git.deploymentEnabled[branch], false);
  const ignorar = (ref) => spawnSync('sh', ['-c', configuration.ignoreCommand], { cwd: frontendDir, env: { VERCEL_GIT_COMMIT_REF: ref }, encoding: 'utf8' }).status;
  assert.equal(ignorar(branch), 0);
  assert.equal(ignorar(`${branch}-extra`), 1);
});

// La rama de la evaluación de producción también queda desactivada en la configuración, no solo en ignoreCommand.
test('evaluación sin despliegue: claude/jowa-production-readiness-dq4no2 desactivada en vercel.json', () => {
  assert.equal(configuration.git.deploymentEnabled['claude/jowa-production-readiness-dq4no2'], false);
  assert.equal(configuration.git.deploymentEnabled['claude/jowa-production-readiness-dq4no2-extra'], undefined);
});

// Auditoría de #248: la rama de la etapa 3 (caja) generaba vistas previas automáticas. Bloqueada por configuración y por
// ignoreCommand; una variante con sufijo no coincide (el bloqueo es por nombre exacto).
test('etapa 3 sin despliegue: claude/affectionate-cori-pb4pv2 bloqueada por configuración y por ignoreCommand', () => {
  const branch = 'claude/affectionate-cori-pb4pv2';
  assert.equal(configuration.git.deploymentEnabled[branch], false);
  const ignorar = (ref) => spawnSync('sh', ['-c', configuration.ignoreCommand], { cwd: frontendDir, env: { VERCEL_GIT_COMMIT_REF: ref }, encoding: 'utf8' }).status;
  assert.equal(ignorar(branch), 0);
  assert.equal(ignorar(`${branch}-extra`), 1);
  assert.equal(configuration.git.deploymentEnabled[`${branch}-extra`], undefined);
});
