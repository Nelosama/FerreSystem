/**
 * seed-safety.spec.ts — Pruebas de guardia de seguridad para scripts de siembra
 *
 * Verifica que la función assertSafeEnvironment() de e2e/unsafe/seed-alex.spec.ts
 * bloquea correctamente configuraciones inseguras.
 *
 * Estos tests SÍ corren en CI (están en e2e/, no en e2e/unsafe/).
 * No se conectan a ninguna URL ni base de datos real.
 */

import { test, expect } from '@playwright/test';

// ─── Reimplementación local de la guardia para testearla de forma aislada ────
// (Misma lógica que unsafe/seed-alex.spec.ts — si cambia allá, actualizar aquí)

const PRODUCTION_DOMAINS = [
  'vercel.app',
  'onrender.com',
  'supabase.co',
  'ferresystem.com',
];

function assertSafeEnvironment(env: {
  SEED_TARGET_URL?: string;
  SEED_EMAIL?: string;
  SEED_PASSWORD?: string;
}) {
  const BASE_URL = env.SEED_TARGET_URL ?? '';
  const EMAIL    = env.SEED_EMAIL ?? '';
  const PASSWORD = env.SEED_PASSWORD ?? '';

  if (!BASE_URL) {
    throw new Error('[SEED BLOQUEADO] La variable SEED_TARGET_URL no está definida.');
  }
  if (!EMAIL || !PASSWORD) {
    throw new Error('[SEED BLOQUEADO] Las variables SEED_EMAIL y SEED_PASSWORD son obligatorias.');
  }
  const lower = BASE_URL.toLowerCase();
  for (const domain of PRODUCTION_DOMAINS) {
    if (lower.includes(domain)) {
      throw new Error(
        `[SEED BLOQUEADO] SEED_TARGET_URL apunta a un dominio de producción prohibido: "${domain}".`,
      );
    }
  }
}

// ─── Tests de bloqueo ─────────────────────────────────────────────────────────

test('bloquea cuando SEED_TARGET_URL no está definida', () => {
  expect(() =>
    assertSafeEnvironment({ SEED_EMAIL: 'a@test.local', SEED_PASSWORD: 'pass' }),
  ).toThrow('SEED_TARGET_URL no está definida');
});

test('bloquea cuando SEED_EMAIL no está definida', () => {
  expect(() =>
    assertSafeEnvironment({ SEED_TARGET_URL: 'http://localhost:4173', SEED_PASSWORD: 'pass' }),
  ).toThrow('SEED_EMAIL y SEED_PASSWORD son obligatorias');
});

test('bloquea cuando SEED_PASSWORD no está definida', () => {
  expect(() =>
    assertSafeEnvironment({ SEED_TARGET_URL: 'http://localhost:4173', SEED_EMAIL: 'a@test.local' }),
  ).toThrow('SEED_EMAIL y SEED_PASSWORD son obligatorias');
});

test('bloquea URL de producción Vercel (ferre-system.vercel.app)', () => {
  expect(() =>
    assertSafeEnvironment({
      SEED_TARGET_URL: 'https://ferre-system.vercel.app',
      SEED_EMAIL: 'alex@gmail.com',
      SEED_PASSWORD: '12345678',
    }),
  ).toThrow('vercel.app');
});

test('bloquea cualquier subdominio de vercel.app', () => {
  expect(() =>
    assertSafeEnvironment({
      SEED_TARGET_URL: 'https://ferre-system-git-main-nelspace.vercel.app',
      SEED_EMAIL: 'test@test.local',
      SEED_PASSWORD: 'pass',
    }),
  ).toThrow('vercel.app');
});

test('bloquea URL de producción Render', () => {
  expect(() =>
    assertSafeEnvironment({
      SEED_TARGET_URL: 'https://ferresystem-api.onrender.com',
      SEED_EMAIL: 'test@test.local',
      SEED_PASSWORD: 'pass',
    }),
  ).toThrow('onrender.com');
});

test('bloquea URL de Supabase', () => {
  expect(() =>
    assertSafeEnvironment({
      SEED_TARGET_URL: 'https://abcdef.supabase.co',
      SEED_EMAIL: 'test@test.local',
      SEED_PASSWORD: 'pass',
    }),
  ).toThrow('supabase.co');
});

test('bloquea dominio propio de producción ferresystem.com', () => {
  expect(() =>
    assertSafeEnvironment({
      SEED_TARGET_URL: 'https://ferresystem.com',
      SEED_EMAIL: 'test@test.local',
      SEED_PASSWORD: 'pass',
    }),
  ).toThrow('ferresystem.com');
});

test('permite entorno local localhost', () => {
  expect(() =>
    assertSafeEnvironment({
      SEED_TARGET_URL: 'http://localhost:4173',
      SEED_EMAIL: 'admin@test.local',
      SEED_PASSWORD: 'contraseña-local-segura',
    }),
  ).not.toThrow();
});

test('permite entorno de staging en dominio controlado', () => {
  expect(() =>
    assertSafeEnvironment({
      SEED_TARGET_URL: 'http://192.168.1.100:4173',
      SEED_EMAIL: 'admin@test.local',
      SEED_PASSWORD: 'contraseña-local-segura',
    }),
  ).not.toThrow();
});
