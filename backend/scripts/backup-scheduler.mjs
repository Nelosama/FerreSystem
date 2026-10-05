import { spawn } from 'node:child_process';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync, writeFileSync, renameSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { resolvePrivateDirectory } from './private-directory.mjs';

if (!process.argv[2]) throw new Error('Defina el directorio de respaldos');
const project = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const directory = resolvePrivateDirectory(process.argv[2], project);
const interval = Number(process.env.BACKUP_INTERVAL_SECONDS || 21600);
if (!Number.isSafeInteger(interval) || interval < 60 || interval > 604800) {
  throw new Error('Intervalo de respaldo inválido (60 a 604800 segundos)');
}
mkdirSync(directory, { recursive: true, mode: 0o700 });

let stopped = false, child;
const pause = ms => new Promise(done => {
  const finish = () => {
    clearTimeout(timer);
    process.removeListener('SIGTERM', finish);
    process.removeListener('SIGINT', finish);
    done();
  };
  const timer = setTimeout(finish, ms);
  process.once('SIGTERM', finish);
  process.once('SIGINT', finish);
});

function status(result) {
  const path = join(directory, 'latest-status.json');
  const temp = `${path}.${randomUUID()}.tmp`;
  writeFileSync(temp, JSON.stringify({ lastAttempt: new Date().toISOString(), ...result }), { mode: 0o600, flag: 'wx' });
  renameSync(temp, path);
}

for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => {
  stopped = true;
  child?.kill(signal);
});

while (!stopped) {
  const result = await new Promise(done => {
    let evidence;
    child = spawn(process.execPath, [join(dirname(fileURLToPath(import.meta.url)), 'backup-preflight.mjs'), directory], {
      env: process.env, stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
    });
    // El hijo comunica su propia copia una vez escrito el manifiesto. No inferirla
    // buscando la carpeta más nueva: puede haber respaldos manuales concurrentes.
    child.on('message', message => {
      if (message?.type === 'backup-completed' && /^ferresystem-[A-Za-z0-9-]+$/.test(message.backupDirectory || '') && /^[0-9a-f]{64}$/.test(message.sha256 || '')) {
        evidence = { backupDirectory: message.backupDirectory, sha256: message.sha256 };
      }
    });
    child.once('error', () => done({ success: false }));
    child.once('close', code => done(code === 0 && evidence ? { success: true, ...evidence } : { success: false }));
  });
  status(result);
  console.log(result.success ? 'Respaldo generado; requiere verificación de restauración.' : 'Falló el respaldo. Revisar almacenamiento y conexión.');
  if (!stopped) await pause(interval * 1000);
}
