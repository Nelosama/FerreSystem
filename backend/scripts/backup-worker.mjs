import { spawn } from 'node:child_process';
import { appendFile, mkdir, mkdtemp, open, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { createReadStream, createWriteStream } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { pipeline } from 'node:stream/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyIsolated } from './backup-verify-isolated.mjs';

const integer = (value, fallback, min, max) => {
  const n = Number(value ?? fallback);
  if (!Number.isSafeInteger(n) || n < min || n > max) throw new Error('CONFIGURATION');
  return n;
};
export function configuration(env) {
  // Only explicit remote repositories. A local disk is not disaster recovery.
  if (!/^(s3:https:\/\/|b2:|azure:|gs:|sftp:|rest:https:\/\/)/.test(env.RESTIC_REPOSITORY || '') ||
      !env.RESTIC_PASSWORD_FILE || !env.FERRE_BACKUP_STATE_DIR || !env.FERRE_BACKUP_TEMP_DIR ||
      !/^[a-zA-Z0-9-]{1,64}$/.test(env.FERRE_BACKUP_INSTANCE || '') ||
      !env.PGHOST || !env.PGDATABASE || !env.PGUSER) throw new Error('CONFIGURATION');
  if (env.FERRE_BACKUP_ALERT_URL && new URL(env.FERRE_BACKUP_ALERT_URL).protocol !== 'https:') throw new Error('CONFIGURATION');
  return {
    state: resolve(env.FERRE_BACKUP_STATE_DIR), temp: resolve(env.FERRE_BACKUP_TEMP_DIR),
    instance: env.FERRE_BACKUP_INSTANCE,
    interval: integer(env.BACKUP_INTERVAL_SECONDS, 86400, 60, 604800),
    attempts: integer(env.BACKUP_MAX_ATTEMPTS, 3, 1, 5),
    retry: integer(env.BACKUP_RETRY_SECONDS, 60, 1, 3600),
    keep: integer(env.BACKUP_KEEP_LAST, 14, 2, 3650),
  };
}

// Never log subprocess stderr, environment or command arguments (credentials/data).
export async function command(name, args, { env = process.env, cwd, inputFile, outputFile, timeout = 1800000 } = {}) {
  return new Promise((done, fail) => {
    const daemonControl = /(?:^|[\\/])pg_ctl(?:\.exe)?$/.test(name);
    const child = spawn(name, args, { env, cwd, windowsHide: true, stdio: [inputFile ? 'pipe' : 'ignore', daemonControl ? 'ignore' : 'pipe', 'ignore'] });
    let output = '', overflow = false;
    const timer = setTimeout(() => child.kill('SIGKILL'), timeout);
    const input = inputFile ? pipeline(createReadStream(inputFile), child.stdin).catch(() => { overflow = true; child.kill(); }) : Promise.resolve();
    const destination = outputFile ? pipeline(child.stdout, createWriteStream(outputFile, { mode: 0o600, flags: 'wx' })).catch(() => { overflow = true; child.kill(); }) : Promise.resolve();
    if (!outputFile) child.stdout?.on('data', chunk => {
      if (output.length + chunk.length > 4 * 1024 * 1024) { overflow = true; child.kill(); }
      else output += chunk.toString();
    });
    child.once('error', () => { clearTimeout(timer); fail(new Error('COMMAND_FAILED')); });
    child.once('close', async code => {
      clearTimeout(timer); await input; await destination;
      if (code !== 0 || overflow) fail(new Error('COMMAND_FAILED')); else done(output);
    });
  });
}
export const pgBinary = (name, env) => env.PG_BIN ? join(env.PG_BIN, name + (process.platform === 'win32' ? '.exe' : '')) : name;
export async function digest(path) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest('hex');
}
export async function atomicJson(path, data) {
  const temp = `${path}.${randomUUID()}.tmp`;
  await writeFile(temp, JSON.stringify(data), { mode: 0o600, flag: 'wx' });
  await rename(temp, path);
}

export async function backupAttempt(config, env, dependencies = {}) {
  const run = dependencies.command || command;
  const verify = dependencies.verify || verifyIsolated;
  const restic = env.RESTIC_BIN || 'restic';
  const work = await mkdtemp(join(config.temp, 'fs41-'));
  let stage = 'DUMP', cleanup = true;
  try {
    const dump = join(work, 'database.dump');
    await run(pgBinary('pg_dump', env), ['--format=custom', '--no-owner', '--no-acl', '--lock-wait-timeout=5000', '--file', dump], { env });
    if (!(await stat(dump)).size) throw new Error('EMPTY_ARCHIVE');
    const sha256 = await digest(dump);
    stage = 'UPLOAD';
    const report = await run(restic, ['backup', '--stdin', '--stdin-filename', 'database.dump', '--host', config.instance, '--tag', 'fs41', '--json'], { env, inputFile: dump });
    const summary = report.trim().split('\n').map(line => JSON.parse(line)).find(row => row.message_type === 'summary');
    if (!/^[a-f0-9]{64}$/.test(summary?.snapshot_id || '')) throw new Error('NO_SNAPSHOT');
    const snapshot = summary.snapshot_id;
    stage = 'INTEGRITY';
    const recovered = join(work, 'recovered.dump');
    // Reading every byte back verifies transport, decryption and the exact archive.
    await run(restic, ['dump', snapshot, '/database.dump'], { env, outputFile: recovered });
    if (await digest(recovered) !== sha256) throw new Error('CHECKSUM');
    stage = 'RESTORE';
    await verify(recovered, work, env, run);
    const verifiedAt = new Date().toISOString();
    stage = 'RETENTION';
    // Never expire an older recovery point before the NEW copy restores successfully.
    await run(restic, ['forget', '--host', config.instance, '--tag', 'fs41', '--group-by', 'host,tags', '--keep-last', String(config.keep), '--prune'], { env });
    return { success: true, encrypted: true, destinationVerified: true, restoreTested: true, verifiedAt, snapshot, sha256 };
  } catch (error) { cleanup = error?.message !== 'ISOLATED_STOP_FAILED'; return { success: false, errorCode: stage }; }
  finally {
    // Only the fresh mkdtemp child is removed. Never a configured source/destination.
    if (cleanup && dirname(work) === config.temp && work.startsWith(join(config.temp, 'fs41-'))) await rm(work, { recursive: true, force: true });
  }
}

export async function notifyTechnical(env, event, fetcher = fetch) {
  if (!env.FERRE_BACKUP_ALERT_URL) return 'unconfigured';
  try {
    const response = await fetcher(env.FERRE_BACKUP_ALERT_URL, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, redirect: 'error',
      body: JSON.stringify({ service: 'FerreSystem backups', instance: env.FERRE_BACKUP_INSTANCE, ...event }),
      signal: AbortSignal.timeout(10000),
    });
    return response.ok ? 'delivered' : 'failed';
  } catch { return 'failed'; }
}

export async function runCycle(config, env, dependencies = {}) {
  const attempt = dependencies.attempt || backupAttempt;
  const sleep = dependencies.sleep || (ms => new Promise(done => setTimeout(done, ms)));
  const notify = dependencies.notify || notifyTechnical;
  const path = join(config.state, 'latest-status.json');
  let previous;
  try { previous = JSON.parse(await readFile(path, 'utf8')); } catch { /* first run */ }
  let history = Array.isArray(previous?.history) ? previous.history.slice(-99) : [];
  let lastSuccess = previous?.lastSuccess || null;
  let hadFailure = previous?.success === false;
  for (let n = 1; n <= config.attempts; n++) {
    const startedAt = new Date().toISOString();
    await appendFile(join(config.state, 'executions.jsonl'), JSON.stringify({ event: 'started', startedAt, attempt: n }) + '\n', { mode: 0o600 });
    // Publish in-progress so a hard crash cannot leave an apparently healthy last run.
    await atomicJson(path, { version: 2, lastAttempt: startedAt, success: false, errorCode: 'RUNNING', lastSuccess, history });
    const result = await attempt(config, env);
    const lastAttempt = new Date().toISOString();
    if (result.success) lastSuccess = lastAttempt;
    const alertDelivery = !result.success || hadFailure
      ? await notify(env, { success: result.success, errorCode: result.errorCode, at: lastAttempt })
      : (env.FERRE_BACKUP_ALERT_URL ? 'configured' : 'unconfigured');
    const record = { startedAt, lastAttempt, attempt: n, ...result, alertDelivery };
    history = [...history, record].slice(-100);
    await appendFile(join(config.state, 'executions.jsonl'), JSON.stringify({ event: 'finished', ...record }) + '\n', { mode: 0o600 });
    await atomicJson(path, { version: 2, ...record, lastSuccess, history });
    console.log(JSON.stringify({ at: lastAttempt, success: result.success, errorCode: result.errorCode, alertDelivery }));
    if (result.success) return true;
    hadFailure = true;
    if (n < config.attempts) await sleep(config.retry * 1000 * 2 ** (n - 1));
  }
  return false;
}

export async function schedule(config, env, { cycle = runCycle, sleep = ms => new Promise(done => setTimeout(done, ms)), stopped = () => false, once = false } = {}) {
  do {
    const success = await cycle(config, env);
    if (once) return success;
    if (!stopped()) await sleep(config.interval * 1000);
  } while (!stopped());
}

export async function main(env = process.env) {
  env = { ...env };
  if (env.PG_PASSWORD_FILE) env.PGPASSWORD = (await readFile(env.PG_PASSWORD_FILE, 'utf8')).trim();
  const config = configuration(env);
  await mkdir(config.state, { recursive: true, mode: 0o700 });
  await mkdir(config.temp, { recursive: true, mode: 0o700 });
  const lockPath = join(config.state, 'worker.lock');
  // No automatic stale-lock breaking: a second worker must never prune concurrently.
  const lock = await open(lockPath, 'wx', 0o600);
  let stopped = false, wake;
  const stop = () => { stopped = true; wake?.(); };
  process.on('SIGTERM', stop); process.on('SIGINT', stop);
  try {
    await lock.writeFile(JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }));
    const once = process.argv.includes('--once');
    const success = await schedule(config, env, { once, stopped: () => stopped, sleep: ms => new Promise(done => {
      const timer = setTimeout(done, ms); wake = () => { clearTimeout(timer); done(); };
    }) });
    if (once) process.exitCode = success ? 0 : 1;
  } finally { process.off('SIGTERM', stop); process.off('SIGINT', stop); await lock.close(); await rm(lockPath); }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(() => { console.error('BACKUP_WORKER_STOPPED: revisar configuración, bloqueo y monitor externo.'); process.exitCode = 1; });
}
