import { PrismaClient } from '@prisma/client';
import { spawnSync } from 'node:child_process';
import { createReadStream, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { createHash } from 'node:crypto';

// Solo restaura sobre otra base explícita y vacía. No crea ni borra bases.
let prisma;
try {
  if (process.argv.length !== 3 || !process.env.FERRE_RESTORE_DATABASE_URL) throw new Error('Falta manifiesto o base de restauración.');
  const destination = new URL(process.env.FERRE_RESTORE_DATABASE_URL);
  if (!['postgres:', 'postgresql:'].includes(destination.protocol) || (destination.searchParams.get('schema') || 'public') !== 'public') throw new Error('Destino no compatible.');
  const manifestPath = resolve(process.argv[2]);
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const dump = join(dirname(manifestPath), 'database.dump');
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(dump)) hash.update(chunk);
  if (!manifest.archiveReadable || hash.digest('hex') !== manifest.sha256) throw new Error('El respaldo no coincide.');
  prisma = new PrismaClient({ datasources: { db: { url: destination.href } } });
  const [{ count }] = await prisma.$queryRawUnsafe(`SELECT COUNT(*)::int AS count FROM (
    SELECT c.oid FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname NOT LIKE 'pg_toast%' AND c.relkind IN ('r','p','v','m','S','f')
    UNION ALL SELECT t.oid FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='public' AND t.typtype='e'
  ) objects`);
  if (count !== 0) throw new Error('La base de restauración no está vacía.');
  const pgEnv = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('PG') || key.startsWith('PGSSL')));
  const result = spawnSync(process.env.PG_BIN ? join(process.env.PG_BIN, process.platform === 'win32' ? 'pg_restore.exe' : 'pg_restore') : 'pg_restore',
    ['--exit-on-error', '--no-owner', '--no-acl', '--dbname', decodeURIComponent(destination.pathname.slice(1)), dump], {
      env: { ...pgEnv, PGHOST: destination.hostname, PGPORT: destination.port || '5432',
        PGUSER: decodeURIComponent(destination.username), PGPASSWORD: decodeURIComponent(destination.password),
        PGSSLMODE: destination.searchParams.get('sslmode') || process.env.PGSSLMODE || 'prefer' },
      encoding: 'utf8', timeout: 300000, maxBuffer: 10 * 1024 * 1024,
    });
  if (result.error || result.status !== 0) throw new Error('La restauración no terminó.');
  // Verificar lectura de tablas del núcleo, sin mostrar datos personales.
  const counts = {};
  for (const table of ['tenants', 'usuarios', 'productos', 'clientes', 'ventas']) {
    const [row] = await prisma.$queryRawUnsafe(`SELECT COUNT(*)::text AS count FROM public."${table}"`);
    counts[table] = row.count;
  }
  writeFileSync(manifestPath, JSON.stringify({ ...manifest, restoreTested: true,
    restoreVerification: { verifiedAt: new Date().toISOString(), counts, note: 'Restauración técnica en base vacía. Falta conciliación operativa y prueba con la aplicación.' } }, null, 2), { mode: 0o600 });
  console.log('Restauración comprobada en base aislada; manifiesto actualizado. Concilie los datos antes de actualizar producción.');
} catch {
  console.error('Restauración no comprobada. Revise checksum, versión, acceso y destino vacío. Si hubo una restauración parcial, utilice otra base vacía; no reintente sobre datos existentes.');
  process.exitCode = 1;
} finally { await prisma?.$disconnect(); }
