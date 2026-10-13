#!/usr/bin/env node
// CENTINELA — control de CI contra operaciones destructivas sobre la base de datos.
//
// Reglas:
// 1. Ningún archivo ejecutable del repositorio (scripts, workflows, Dockerfiles, deploy, package.json) puede invocar
//    `prisma db push`, `prisma migrate dev`, `prisma migrate reset`, `prisma db seed` ni `--accept-data-loss`.
// 2. Una migración nueva o modificada con SQL destructivo (DROP, TRUNCATE, DELETE, cambio de tipo, RENAME)
//    exige la línea `-- APROBACION-DESTRUCTIVA: <ticket> <responsable>` y revisión de CODEOWNERS.
// 3. Las migraciones ya publicadas son inmutables: solo se permiten archivos nuevos.
// Las migraciones aditivas y revisadas no se bloquean.
//
// Uso: node scripts/verificar-migraciones.mjs [--base origin/main]
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

// Ticket (p. ej. CHG-42) y responsable como handle de GitHub, que CODEOWNERS puede verificar.
export const MARCA_APROBACION = /^--\s*APROBACION-DESTRUCTIVA:\s+[A-Z]+-\d+\s+@[A-Za-z0-9-]+\s*$/m;

const TABLA_DE_MARCA = /\bentorno_ferresystem\b/;

const COMANDOS_PROHIBIDOS = [
  /prisma\s+db\s+(push|seed)\b/,
  /prisma\s+migrate\s+(dev|reset)\b/,
  /['"]migrate['"]\s*,\s*['"](dev|reset)['"]/,
  /['"]db['"]\s*,\s*['"](push|seed)['"]/,
  /--accept-data-loss\b/,
  /--force-reset\b/,
];

const SQL_DESTRUCTIVO = [
  { patron: /\bDROP\s+(TABLE|COLUMN|TYPE|SCHEMA|DATABASE|INDEX|CONSTRAINT)\b/i, motivo: 'DROP' },
  { patron: /\bTRUNCATE\b/i, motivo: 'TRUNCATE' },
  { patron: /\bDELETE\s+FROM\b/i, motivo: 'DELETE' },
  { patron: /\bSET\s+DATA\s+TYPE\b|\bALTER\s+COLUMN\b[^;]*\bTYPE\b/i, motivo: 'cambio de tipo' },
  { patron: /\bRENAME\s+(TO|COLUMN)\b/i, motivo: 'RENAME' },
];

const sinComentarios = (sql) => sql.split('\n').filter((linea) => !linea.trim().startsWith('--')).join('\n');

/** Comandos prohibidos en archivos ejecutables. `textos`: [{ ruta, contenido }]. */
export function buscarComandosProhibidos(textos) {
  const hallazgos = [];
  for (const { ruta, contenido } of textos) {
    contenido.split('\n').forEach((linea, indice) => {
      const patron = COMANDOS_PROHIBIDOS.find((p) => p.test(linea));
      if (patron) hallazgos.push({ ruta, linea: indice + 1, patron: String(patron) });
    });
  }
  return hallazgos;
}

/** SQL destructivo de una migración. Ignora comentarios; la marca de aprobación se evalúa aparte. */
export function analizarMigracion(ruta, contenido) {
  const sql = sinComentarios(contenido);
  const operaciones = SQL_DESTRUCTIVO.filter(({ patron }) => patron.test(sql)).map(({ motivo }) => motivo);
  // La marca de entorno del seed se crea a mano, nunca desde una migración.
  if (TABLA_DE_MARCA.test(sql)) operaciones.push('tabla de marca de entorno');
  const aprobada = MARCA_APROBACION.test(contenido);
  return { ruta, operaciones, aprobada, bloqueada: operaciones.length > 0 && !aprobada };
}

/** Cambios sobre migraciones publicadas. `cambios`: [{ estado: 'A'|'M'|'D'|'R...', ruta }]. Solo se permite 'A'. */
export function comprobarInmutables(cambios) {
  return cambios.filter(({ estado }) => !estado.startsWith('A')).map(({ estado, ruta }) => ({ estado, ruta }));
}

function git(args) {
  return execFileSync('git', args, { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 });
}

const EJECUTABLES = [/^backend\/package\.json$/, /^frontend\/package\.json$/, /^package\.json$/, /^\.github\/workflows\/.+\.ya?ml$/,
  /(^|\/)Dockerfile[^/]*$/, /^deploy\/.+/, /^backend\/scripts\/.+\.(mjs|js|sh|cjs)$/, /^backend\/prisma\/.+\.(ts|mjs|js)$/];
const EXCLUIDOS = [/\.test\.m?js$/, /verificar-migraciones\.mjs$/, /\.md$/];

function principal() {
  const base = process.argv.includes('--base') ? process.argv[process.argv.indexOf('--base') + 1] : 'origin/main';
  const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
  const archivos = git(['-C', raiz, 'ls-files']).split('\n').filter((ruta) => EJECUTABLES.some((p) => p.test(ruta)) && !EXCLUIDOS.some((p) => p.test(ruta)));
  const textos = archivos.map((ruta) => ({ ruta, contenido: readFileSync(join(raiz, ruta), 'utf8') }));
  const prohibidos = buscarComandosProhibidos(textos);

  const cambios = git(['-C', raiz, 'diff', '--name-status', `${base}...HEAD`, '--', 'backend/prisma/migrations'])
    .split('\n').filter(Boolean).map((linea) => {
      const [estado, ...rutas] = linea.split('\t');
      return { estado, ruta: rutas.at(-1) };
    });
  const inmutables = comprobarInmutables(cambios.filter(({ ruta }) => ruta.endsWith('.sql') || ruta.endsWith('.toml')));
  const nuevas = cambios.filter(({ estado, ruta }) => estado.startsWith('A') && ruta.endsWith('migration.sql'));
  const analisis = nuevas.map(({ ruta }) => analizarMigracion(ruta, readFileSync(join(raiz, ruta), 'utf8')));
  const bloqueadas = analisis.filter((a) => a.bloqueada);

  let codigo = 0;
  if (prohibidos.length) { codigo = 1; console.error('Comandos destructivos prohibidos:'); for (const h of prohibidos) console.error(`  ${h.ruta}:${h.linea}`); }
  if (inmutables.length) { codigo = 1; console.error('Migraciones publicadas modificadas o eliminadas (solo se permiten archivos nuevos):'); for (const h of inmutables) console.error(`  ${h.estado} ${h.ruta}`); }
  if (bloqueadas.length) { codigo = 1; console.error('Migraciones con SQL destructivo sin marca APROBACION-DESTRUCTIVA:'); for (const a of bloqueadas) console.error(`  ${a.ruta}: ${a.operaciones.join(', ')}`); }
  for (const a of analisis.filter((x) => x.aprobada)) console.log(`Aprobada explícitamente (requiere CODEOWNERS): ${a.ruta}`);
  console.log(codigo === 0 ? `Control de migraciones: correcto (${archivos.length} archivos ejecutables, ${nuevas.length} migraciones nuevas).` : 'Control de migraciones: FALLO.');
  process.exit(codigo);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) principal();
