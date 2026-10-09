import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { join, resolve } from 'node:path';
import { createServer } from 'node:net';

export async function isolatedEnvironment(work, env) {
  const cluster = await mkdtemp(join(work, 'verify-'));
  const password = randomBytes(32).toString('hex');
  const passwordFile = join(cluster, 'password');
  await writeFile(passwordFile, password, { mode: 0o600 });
  const port = await new Promise((done, fail) => {
    const server = createServer(); server.once('error', fail);
    server.listen(0, '127.0.0.1', () => { const value = server.address().port; server.close(() => done(value)); });
  });
  // Whitelist OS runtime only: no PG service, source password, cloud keys or URLs.
  const local = Object.fromEntries(['PATH', 'Path', 'SystemRoot', 'SYSTEMROOT', 'WINDIR', 'TEMP', 'TMP', 'HOME', 'LANG'].filter(key => env[key]).map(key => [key, env[key]]));
  Object.assign(local, { PGHOST: '127.0.0.1', PGPORT: String(port), PGDATABASE: 'postgres', PGUSER: 'ferre_verify', PGPASSWORD: password, PGSSLMODE: 'disable', PGCONNECT_TIMEOUT: '10' });
  return { cluster, data: join(cluster, 'data'), passwordFile, port, local };
}

export async function verifyIsolated(dump, work, env, run) {
  const binary = name => env.PG_BIN ? join(env.PG_BIN, name + (process.platform === 'win32' ? '.exe' : '')) : name;
  const sandbox = await isolatedEnvironment(work, env);
  const { cluster, data, passwordFile, port, local } = sandbox;
  let started = false;
  try {
    await run(binary('initdb'), ['-D', data, '-U', 'ferre_verify', '--pwfile', passwordFile, '--auth=scram-sha-256', '--encoding=UTF8', '--no-locale'], { env: local });
    await writeFile(join(data, 'postgresql.auto.conf'), `listen_addresses = '127.0.0.1'\nport = ${port}\nunix_socket_directories = ''\nmax_connections = 10\nshared_buffers = '32MB'\n`);
    await run(binary('pg_ctl'), ['-D', data, '-l', join(cluster, 'postgres.log'), '-w', 'start'], { env: local, timeout: 60000 });
    started = true;
    const actual = (await run(binary('psql'), ['-X', '-At', '-v', 'ON_ERROR_STOP=1', '-c', 'SHOW data_directory'], { env: local })).trim();
    if (resolve(actual) !== resolve(data)) throw new Error('ISOLATION');
    await run(binary('pg_restore'), ['--exit-on-error', '--no-owner', '--no-acl', '--dbname', 'postgres', dump], { env: local });
    // A full restore validates constraints; verify readable core tables without publishing rows/counts.
    for (const table of ['tenants', 'usuarios', 'productos', 'clientes', 'ventas']) {
      await run(binary('psql'), ['-X', '-At', '-v', 'ON_ERROR_STOP=1', '-c', `SELECT count(*) FROM public."${table}"`], { env: local });
    }
  } finally {
    // pg_ctl targets only data created by initdb here, never a supplied connection URL.
    if (started || await readFile(join(data, 'postmaster.pid'), 'utf8').catch(() => '')) {
      try { await run(binary('pg_ctl'), ['-D', data, '-m', 'fast', '-w', 'stop'], { env: local, timeout: 60000 }); }
      catch { throw new Error('ISOLATED_STOP_FAILED'); }
    }
  }
}
