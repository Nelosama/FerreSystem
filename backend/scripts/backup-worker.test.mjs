import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { configuration, backupAttempt, runCycle, notifyTechnical, schedule } from './backup-worker.mjs';
import { isolatedEnvironment } from './backup-verify-isolated.mjs';

const env = { RESTIC_REPOSITORY: 's3:https://example.invalid/bucket', RESTIC_PASSWORD_FILE: '/secret', FERRE_BACKUP_INSTANCE: 'fixture', FERRE_BACKUP_STATE_DIR: '/state', FERRE_BACKUP_TEMP_DIR: '/temp', PGHOST: 'source.invalid', PGDATABASE: 'source', PGUSER: 'reader' };
async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'fs41-unit-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const config = { ...configuration(env), state: join(root, 'state'), temp: join(root, 'work') };
  await mkdir(config.state); await mkdir(config.temp);
  return config;
}
test('requires remote encrypted repository, explicit source, bounded retention/frequency', () => {
  assert.equal(configuration(env).keep, 14);
  for (const override of [{ RESTIC_REPOSITORY: '/local' }, { RESTIC_REPOSITORY: 'rest:http://plain' }, { RESTIC_PASSWORD_FILE: '' }, { BACKUP_KEEP_LAST: '0' }, { BACKUP_INTERVAL_SECONDS: 'NaN' }, { FERRE_BACKUP_INSTANCE: '../other' }, { PGHOST: '' }]) {
    assert.throws(() => configuration({ ...env, ...override }));
  }
});
test('upload/readback/restore precede retention; corruption and restore errors never prune', async t => {
  const config = await fixture(t);
  for (const failure of [null, 'dump', 'upload', 'corrupt', 'restore', 'retention']) {
    const calls = [];
    const command = async (name, args, options) => {
      if (name.endsWith('pg_dump')) {
        if (failure === 'dump') throw Error('secret source password');
        await writeFile(args.at(-1), 'archive fixture'); return '';
      }
      calls.push(args[0]);
      if (args[0] === 'backup') {
        if (failure === 'upload') throw Error('secret cloud key');
        return JSON.stringify({ message_type: 'summary', snapshot_id: 'a'.repeat(64) });
      }
      if (args[0] === 'dump') { await writeFile(options.outputFile, failure === 'corrupt' ? 'broken' : 'archive fixture'); return ''; }
      if (args[0] === 'forget') {
        assert.ok(calls.includes('verified'));
        assert.ok(args.includes('fixture')); assert.ok(args.includes('14'));
        if (failure === 'retention') throw Error('locked');
      }
      return '';
    };
    const result = await backupAttempt(config, env, { command, verify: async () => { if (failure === 'restore') throw Error('bad restore'); calls.push('verified'); } });
    assert.equal(result.success, failure === null);
    if (failure && failure !== 'retention') assert.ok(!calls.includes('forget'));
    assert.ok(!JSON.stringify(result).includes('secret'));
  }
});
test('bounded exponential retry records every run, last success survives failure and restart', async t => {
  const config = await fixture(t), sleeps = [], alerts = [];
  let count = 0;
  const result = await runCycle(config, env, {
    attempt: async () => ({ success: ++count === 3, errorCode: count === 3 ? undefined : 'UPLOAD' }),
    sleep: async ms => sleeps.push(ms), notify: async (_, event) => { alerts.push(event); return 'failed'; },
  });
  assert.equal(result, true); assert.deepEqual(sleeps, [60000, 120000]);
  const saved = JSON.parse(await readFile(join(config.state, 'latest-status.json'), 'utf8'));
  assert.equal(saved.history.length, 3); assert.ok(saved.lastSuccess); assert.equal(alerts.length, 3);
  await runCycle({ ...config, attempts: 1 }, env, { attempt: async () => ({ success: false, errorCode: 'DUMP' }), notify: async () => 'failed' });
  const failed = JSON.parse(await readFile(join(config.state, 'latest-status.json'), 'utf8'));
  assert.equal(failed.lastSuccess, saved.lastSuccess); assert.equal(failed.success, false);
  assert.equal((await readFile(join(config.state, 'executions.jsonl'), 'utf8')).trim().split('\n').length, 8);
});
test('webhook failures remain visible and payload contains no database details', async () => {
  assert.equal(await notifyTechnical(env, {}), 'unconfigured');
  assert.equal(await notifyTechnical({ ...env, FERRE_BACKUP_ALERT_URL: 'https://example.invalid' }, { success: false, errorCode: 'UPLOAD' }, async (_, options) => {
    assert.ok(!options.body.includes('source.invalid'));
    assert.equal(options.redirect, 'error'); throw Error('offline');
  }), 'failed');
});
test('restore environment cannot inherit source service, URL, credentials or cloud secrets', async t => {
  const config = await fixture(t);
  const isolated = await isolatedEnvironment(config.temp, { ...process.env, ...env, PGSERVICE: 'production', PGPASSWORD: 'production', DATABASE_URL: 'production', AWS_SECRET_ACCESS_KEY: 'secret' });
  assert.equal(isolated.local.PGHOST, '127.0.0.1');
  assert.equal(isolated.local.PGDATABASE, 'postgres');
  assert.equal(isolated.local.PGSERVICE, undefined); assert.equal(isolated.local.DATABASE_URL, undefined);
  assert.equal(isolated.local.AWS_SECRET_ACCESS_KEY, undefined); assert.notEqual(isolated.local.PGPASSWORD, 'production');
});
test('scheduler runs independently, waits configured interval and never overlaps cycles', async () => {
  let runs = 0, running = false; const waits = [];
  await schedule({ interval: 600 }, {}, {
    cycle: async () => { assert.equal(running, false); running = true; await Promise.resolve(); runs++; running = false; },
    sleep: async ms => { assert.equal(running, false); waits.push(ms); }, stopped: () => runs === 3,
  });
  assert.equal(runs, 3); assert.deepEqual(waits, [600000, 600000]);
});
