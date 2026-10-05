import { PrismaClient } from '@prisma/client';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, mkdtempSync, mkdirSync, writeFileSync, rmSync, createReadStream } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

class SafeError extends Error {}

const backend = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const migrationsDir = join(backend, 'prisma/migrations');
const names = readdirSync(migrationsDir).filter(name => /^\d{14}_/.test(name)).sort();
const baseline = '20260925000000_initial_core';
const sha = value => createHash('sha256').update(value).digest('hex');
const checksums = new Map(names.map(name => {
  const sql = readFileSync(join(migrationsDir, name, 'migration.sql'), 'utf8');
  const lf = sql.replace(/\r\n/g, '\n');
  return [name, new Set([sha(sql), sha(lf), sha(lf.replace(/\n/g, '\r\n'))])];
}));

function selectedUrl(value) {
  if (!value) throw new SafeError('Configure DIRECT_URL o DATABASE_URL explícitamente.');
  const parsed = new URL(value);
  if (!['postgres:', 'postgresql:'].includes(parsed.protocol) || (parsed.searchParams.get('schema') || 'public') !== 'public') {
    throw new SafeError('Este procedimiento requiere PostgreSQL y el esquema public.');
  }
  return value;
}

async function inspect(url) {
  const prisma = new PrismaClient({ datasources: { db: { url } } });
  try {
    return await prisma.$transaction(async tx => {
      await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
      const objects = await tx.$queryRawUnsafe(`SELECT c.relname AS name FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname='public' AND c.relkind IN ('r','p','v','m','f') AND c.relname <> '_prisma_migrations'
        UNION ALL SELECT t.typname FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='public' AND t.typtype='e'`);
      const [table] = await tx.$queryRawUnsafe("SELECT to_regclass('public._prisma_migrations') IS NOT NULL AS present");
      const history = table.present ? await tx.$queryRawUnsafe('SELECT migration_name, checksum, finished_at, rolled_back_at FROM public._prisma_migrations ORDER BY started_at') : [];
      const active = history.filter(row => !row.rolled_back_at);
      const errors = [];
      if (active.some(row => !row.finished_at)) errors.push('MIGRACION_INCOMPLETA');
      if (active.some(row => !checksums.has(row.migration_name))) errors.push('MIGRACION_DESCONOCIDA');
      if (active.some(row => checksums.has(row.migration_name) && !checksums.get(row.migration_name).has(row.checksum))) errors.push('CHECKSUM_DISTINTO');
      const applied = active.filter(row => row.finished_at).map(row => row.migration_name).sort();
      if (new Set(applied).size !== applied.length) errors.push('HISTORIAL_DUPLICADO');
      const missingBaseline = !applied.includes(baseline);
      const order = missingBaseline ? names.filter(name => name !== baseline) : names;
      if (applied.some((name, i) => name !== order[i])) errors.push('HISTORIAL_CON_HUECOS');
      if (applied.length) {
        const present = new Set(objects.map(row => row.name));
        for (const name of applied.filter(name => checksums.has(name))) {
          const sql = readFileSync(join(migrationsDir, name, 'migration.sql'), 'utf8');
          const required = [...sql.matchAll(/CREATE TABLE (?:IF NOT EXISTS )?"([^"]+)"/g)].map(match => match[1]);
          if (required.some(table => !present.has(table))) { errors.push('ESQUEMA_INCOMPLETO'); break; }
        }
        if (applied.includes('20261002000000_add_customer_numbers')) {
          const [trigger] = await tx.$queryRawUnsafe("SELECT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid=to_regclass('public.clientes') AND tgname='clientes_assign_number' AND tgenabled IN ('O','A')) AS present");
          if (!trigger.present) errors.push('TRIGGER_CLIENTES_AUSENTE');
        }
      }
      const pending = names.filter(name => !applied.includes(name));
      const state = errors.length ? 'BLOQUEADA' : objects.length && missingBaseline ? 'REQUIERE_BASELINE' :
        !objects.length && !applied.length ? 'VACIA' : applied.length && !objects.length ? 'BLOQUEADA' : 'LISTA';
      if (applied.length && !objects.length) errors.push('ESQUEMA_AUSENTE');
      return { state, baseline, applied, pending, errors, objectCount: objects.length };
    });
  } finally { await prisma.$disconnect(); }
}

async function nativeSignature(url) {
  const prisma = new PrismaClient({ datasources: { db: { url } } });
  try {
    return await prisma.$transaction(async tx => {
      await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
      // Prisma diff no compara triggers, funciones, CHECK ni políticas RLS.
      return await tx.$queryRawUnsafe(`
        SELECT 'constraint' AS kind, c.relname || ':' || k.conname AS key,
          pg_get_constraintdef(k.oid) || ':validated=' || k.convalidated::text AS value
        FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname='public' AND c.relname <> '_prisma_migrations'
        UNION ALL SELECT 'trigger', c.relname || ':' || t.tgname, pg_get_triggerdef(t.oid) || ':enabled=' || t.tgenabled::text
        FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname='public' AND NOT t.tgisinternal
        UNION ALL SELECT 'function', p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')', pg_get_functiondef(p.oid)
        FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.prokind IN ('f','p')
        UNION ALL SELECT 'rls', c.relname, c.relrowsecurity::text || ':' || c.relforcerowsecurity::text
        FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p') AND c.relname <> '_prisma_migrations'
        UNION ALL SELECT 'policy', tablename || ':' || policyname, row_to_json(p)::text FROM pg_policies p WHERE schemaname='public'
        ORDER BY kind, key, value`);
    });
  } finally { await prisma.$disconnect(); }
}

function prismaCommand(args, url, extraEnv = {}) {
  const result = spawnSync(process.execPath, [join(backend, 'node_modules/prisma/build/index.js'), ...args], {
    cwd: backend, env: { ...process.env, DATABASE_URL: url, DIRECT_URL: url, ...extraEnv },
    encoding: 'utf8', timeout: 300000, maxBuffer: 10 * 1024 * 1024,
  });
  if (result.error || result.status !== 0) throw new SafeError('Prisma no completó el procedimiento. Revise el diagnóstico; no se imprimen detalles de conexión.');
  return result.stdout;
}

async function backupEvidence(manifestPath) {
  if (!manifestPath) throw new SafeError('La adopción requiere un manifiesto de respaldo y una restauración probada.');
  const manifest = JSON.parse(readFileSync(resolve(manifestPath), 'utf8'));
  if (!manifest.archiveReadable || !manifest.restoreTested || !/^[0-9a-f]{64}$/.test(manifest.sha256 || '')) {
    throw new SafeError('El manifiesto debe indicar archivo legible y restauración comprobada.');
  }
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(join(dirname(resolve(manifestPath)), 'database.dump'))) hash.update(chunk);
  if (hash.digest('hex') !== manifest.sha256) throw new SafeError('El respaldo no coincide con su checksum.');
}

async function adopt(url, plan, through, manifestPath, referenceUrl) {
  if (plan.state !== 'REQUIERE_BASELINE') throw new SafeError('La base no necesita adopción o tiene un historial incompatible.');
  const end = names.indexOf(through);
  if (end < 0) throw new SafeError('Indique --through con la última migración ya representada en el esquema existente.');
  const expected = names.slice(0, end + 1);
  if (plan.applied.some(name => !expected.includes(name))) throw new SafeError('La etapa seleccionada es anterior al historial registrado.');
  await backupEvidence(manifestPath);
  referenceUrl = selectedUrl(referenceUrl);
  if (url === referenceUrl) throw new SafeError('La referencia debe ser otra base vacía y desechable.');
  const reference = await inspect(referenceUrl);
  if (reference.state !== 'VACIA') throw new SafeError('La base de referencia debe estar vacía y sin migraciones.');
  // Reproducir el prefijo histórico real en otra base; nunca inferir solo por nombres de tablas.
  const directory = mkdtempSync(join(tmpdir(), 'ferre-migration-reference-'));
  try {
    const schema = readFileSync(join(backend, 'prisma/schema.prisma'), 'utf8');
    writeFileSync(join(directory, 'schema.prisma'), schema);
    const directoryMigrations = join(directory, 'migrations');
    mkdirSync(directoryMigrations);
    writeFileSync(join(directoryMigrations, 'migration_lock.toml'), readFileSync(join(migrationsDir, 'migration_lock.toml')));
    for (const name of expected) {
      mkdirSync(join(directoryMigrations, name));
      writeFileSync(join(directoryMigrations, name, 'migration.sql'), readFileSync(join(migrationsDir, name, 'migration.sql')));
    }
    prismaCommand(['migrate', 'deploy', '--schema', join(directory, 'schema.prisma')], referenceUrl);
    // Las URLs viajan por el entorno, no por argumentos ni salida de procesos.
    const referenceSchema = schema.replace('env("DATABASE_URL")', 'env("FERRE_REFERENCE_DATABASE_URL")').replace('env("DIRECT_URL")', 'env("FERRE_REFERENCE_DATABASE_URL")');
    writeFileSync(join(directory, 'reference.prisma'), referenceSchema);
    const comparison = spawnSync(process.execPath, [join(backend, 'node_modules/prisma/build/index.js'), 'migrate', 'diff',
      '--from-schema-datasource', join(backend, 'prisma/schema.prisma'), '--to-schema-datasource', join(directory, 'reference.prisma'), '--exit-code'], {
      cwd: backend, env: { ...process.env, DATABASE_URL: url, DIRECT_URL: url, FERRE_REFERENCE_DATABASE_URL: referenceUrl },
      encoding: 'utf8', timeout: 300000, maxBuffer: 10 * 1024 * 1024,
    });
    if (comparison.error || comparison.status !== 0) throw new SafeError('El esquema no coincide exactamente con la etapa histórica elegida o no pudo compararse. No se adoptó ninguna migración.');
    const [actualNative, expectedNative] = await Promise.all([nativeSignature(url), nativeSignature(referenceUrl)]);
    if (JSON.stringify(actualNative) !== JSON.stringify(expectedNative)) {
      throw new SafeError('Triggers, funciones, restricciones o políticas no coinciden. No se adoptó ninguna migración.');
    }
    for (const name of expected) {
      if (!plan.applied.includes(name)) prismaCommand(['migrate', 'resolve', '--applied', name], url);
    }
    return await inspect(url);
  } finally { rmSync(directory, { recursive: true, force: true }); }
}

try {
  const [command, ...args] = process.argv.slice(2);
  const flags = new Map();
  if (args.length % 2) throw new SafeError('Las opciones requieren un valor.');
  for (let i = 0; i < args.length; i += 2) {
    if (!['--through', '--backup-manifest'].includes(args[i]) || flags.has(args[i])) throw new SafeError('Opción desconocida o repetida.');
    flags.set(args[i], args[i + 1]);
  }
  if (!['inspect', 'deploy', 'adopt'].includes(command) || (command !== 'adopt' && args.length)) throw new SafeError('Uso: migration-safe.mjs inspect|deploy|adopt [--through MIGRACION --backup-manifest ARCHIVO]');
  const url = selectedUrl(process.env.DIRECT_URL || process.env.DATABASE_URL);
  let plan = await inspect(url);
  if (command === 'adopt') plan = await adopt(url, plan, flags.get('--through'), flags.get('--backup-manifest'), process.env.FERRE_REFERENCE_DATABASE_URL);
  if (command === 'deploy') {
    if (!['VACIA', 'LISTA'].includes(plan.state)) throw new SafeError(`Despliegue bloqueado: ${plan.state}. Revise historial y respaldo antes de continuar.`);
    prismaCommand(['migrate', 'deploy'], url);
    plan = await inspect(url);
  }
  console.log(JSON.stringify(plan, null, 2));
  if (plan.state === 'BLOQUEADA') process.exitCode = 1;
} catch (error) {
  // Las excepciones del motor pueden contener conexiones; devolver un mensaje seguro.
  if (error instanceof SafeError) console.error(error.message);
  console.error('Procedimiento no completado. Ejecute migrate:inspect, revise historial/checksums, respaldo restaurado, etapa y referencia vacía. No use reset ni db push.');
  process.exitCode = 1;
}
