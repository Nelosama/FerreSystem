#!/usr/bin/env node
// CENTINELA — auditoría de SOLO LECTURA: ¿alguna cuenta conserva una clave de demostración conocida?
// Lee hashes en una transacción READ ONLY y compara con bcrypt. No imprime hashes ni cambia datos.
// Uso (solo con autorización del responsable, sobre la base indicada):
//   DATABASE_URL=... node scripts/auditar-claves-demo.mjs
// Códigos de salida: 0 sin coincidencias, 2 hay cuentas con clave demo, 1 error.
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

// Claves que estuvieron en el seed histórico (merge #64) y en pruebas. Son públicas: no se usan como secreto.
export const CLAVES_DEMO = ['SuperAdmin2026!', 'Ferre2026!'];

/** `cuentas`: [{ tipo, id, email, passwordHash }]. `comparar(clave, hash)` → Promise<boolean>. */
export async function detectarClavesDemo(cuentas, claves, comparar) {
  const coincidencias = [];
  for (const cuenta of cuentas) {
    if (!cuenta.passwordHash) continue;
    for (const clave of claves) {
      if (await comparar(clave, cuenta.passwordHash)) {
        coincidencias.push({ tipo: cuenta.tipo, id: cuenta.id, email: cuenta.email });
        break;
      }
    }
  }
  return coincidencias;
}

async function principal() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL es obligatorio.');
  const prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
  try {
    const cuentas = await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
      const superAdmins = await tx.superAdmin.findMany({ select: { id: true, email: true, passwordHash: true } });
      const usuarios = await tx.usuario.findMany({ select: { id: true, email: true, passwordHash: true } });
      return [...superAdmins.map((c) => ({ ...c, tipo: 'SUPER_ADMIN' })), ...usuarios.map((c) => ({ ...c, tipo: 'USUARIO' }))];
    });
    const coincidencias = await detectarClavesDemo(cuentas, CLAVES_DEMO, (clave, hash) => bcrypt.compare(clave, hash));
    console.log(`Cuentas revisadas: ${cuentas.length}. Con clave demo conocida: ${coincidencias.length}.`);
    for (const c of coincidencias) console.log(`  ${c.tipo} ${c.email}`);
    process.exitCode = coincidencias.length ? 2 : 0;
  } finally {
    await prisma.$disconnect();
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  principal().catch((error) => { console.error('Auditoría no completada:', error?.message ?? 'error'); process.exitCode = 1; });
}
