import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = new URL('../', import.meta.url);
const read = path => readFileSync(new URL(path, root), 'utf8');
test('deploy/startup never invoke seeds or emergency account operations', () => {
  const scripts = JSON.parse(read('package.json')).scripts;
  for (const key of ['start:prod', 'migrate:deploy']) assert.doesNotMatch(scripts[key], /seed|recover-super|replace-super/);
  const seed = read('prisma/seed.ts');
  assert.match(seed, /superAdmin\.upsert\([\s\S]*?update: \{\}/);
  assert.match(seed, /usuario\.upsert\([\s\S]*?update: \{\}/);
  assert.doesNotMatch(seed, /superAdmin\.(deleteMany|updateMany)|passwordHash:\s*.*process\.env/);
});
test('published migrations contain no credential rewriting or embedded credential values', () => {
  const directory = new URL('prisma/migrations/', root);
  for (const name of readdirSync(directory).filter(n => /^\d{14}_/.test(n))) {
    const sql = readFileSync(join(fileURLToPath(directory), name, 'migration.sql'), 'utf8').replace(/--[^\n]*/g, '');
    assert.doesNotMatch(sql, /UPDATE\s+(?:"?super_admins"?|"?usuarios"?)\s+SET\s+"?password_hash/i, name);
    assert.doesNotMatch(sql, /\$2[aby]\$\d\d\$/, name);
  }
});
test('retired replacement fails without connecting; emergency recovery preserves identity and MFA', () => {
  assert.doesNotMatch(read('prisma/replace-super-admin.ts'), /new PrismaClient|\.deleteMany\(/);
  const emergency = read('prisma/recover-super-admin.ts');
  assert.doesNotMatch(emergency, /superAdmin\.(deleteMany|create)|mfaSecret:\s*null/);
  assert.match(emergency, /process\.env\.CI/);
  assert.match(emergency, /CONFIRM_SUPER_ADMIN_RECOVERY/);
  assert.match(emergency, /authEvent\.create/);
});
