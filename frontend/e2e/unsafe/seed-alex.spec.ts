/**
 * seed-alex.spec.ts — Script de siembra de datos de demostración
 *
 * ⚠️  USO MANUAL ÚNICAMENTE — NUNCA ejecutar en CI ni contra producción.
 *
 * Requiere variables de entorno:
 *   SEED_TARGET_URL  — URL base del entorno de pruebas aislado (OBLIGATORIA)
 *   SEED_EMAIL       — Correo del administrador de prueba (OBLIGATORIA)
 *   SEED_PASSWORD    — Contraseña del administrador de prueba (OBLIGATORIA)
 *
 * Ver e2e/unsafe/README.md para instrucciones de uso.
 */

import { test, expect, Page } from '@playwright/test';

// ─── Guardia de seguridad ─────────────────────────────────────────────────────
// Bloquea cualquier intento de ejecutar este script sin configuración explícita
// o contra un dominio de producción conocido.

const PRODUCTION_DOMAINS = [
  'vercel.app',
  'onrender.com',
  'supabase.co',
  'ferresystem.com',
];

const BASE_URL = process.env.SEED_TARGET_URL ?? '';
const EMAIL    = process.env.SEED_EMAIL ?? '';
const PASSWORD = process.env.SEED_PASSWORD ?? '';

function assertSafeEnvironment() {
  if (!BASE_URL) {
    throw new Error(
      '[SEED BLOQUEADO] La variable SEED_TARGET_URL no está definida. ' +
      'Este script solo puede ejecutarse con una URL de entorno de pruebas aislado. ' +
      'Ver e2e/unsafe/README.md.',
    );
  }
  if (!EMAIL || !PASSWORD) {
    throw new Error(
      '[SEED BLOQUEADO] Las variables SEED_EMAIL y SEED_PASSWORD son obligatorias. ' +
      'No incluir credenciales en el código fuente.',
    );
  }
  const lower = BASE_URL.toLowerCase();
  for (const domain of PRODUCTION_DOMAINS) {
    if (lower.includes(domain)) {
      throw new Error(
        `[SEED BLOQUEADO] SEED_TARGET_URL apunta a un dominio de producción prohibido: "${domain}". ` +
        'Usa únicamente un servidor local o de staging aislado.',
      );
    }
  }
}

// La guardia se ejecuta antes de cualquier test.
assertSafeEnvironment();

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function login(page: Page) {
  await page.goto(`${BASE_URL}/login`);
  await page.getByLabel(/correo|email/i).fill(EMAIL);
  await page.getByLabel(/contraseña|password/i).fill(PASSWORD);
  await page.getByRole('button', { name: /iniciar|ingresar|login/i }).click();
  await page.waitForURL(/dashboard|inicio|home/i, { timeout: 15000 });
  console.log('✅ Login exitoso');
}

// ─── CATEGORÍAS ───────────────────────────────────────────────────────────────
test('1. Crear categorías', async ({ page }) => {
  await login(page);

  const categorias = ['Tornillería', 'Tubería y PVC', 'Material Eléctrico', 'Herramientas', 'Láminas y Metales'];

  for (const nombre of categorias) {
    await page.goto(`${BASE_URL}/categorias`);
    await page.getByRole('button', { name: /nueva|agregar|crear/i }).first().click();
    await page.getByLabel(/nombre/i).fill(nombre);
    await page.getByRole('button', { name: /guardar|crear|aceptar/i }).click();
    await page.waitForTimeout(800);
    console.log(`✅ Categoría creada: ${nombre}`);
  }
});

// ─── PRODUCTOS ────────────────────────────────────────────────────────────────
test('2. Crear productos', async ({ page }) => {
  await login(page);

  const productos = [
    { nombre: 'Tornillo Hexagonal 1/2"', categoria: 'Tornillería', costo: 2.50, precio: 4.00, stock: 500, unidad: 'UND', codigo: 'TORN-001' },
    { nombre: 'Tornillo Madera #8 x 2"', categoria: 'Tornillería', costo: 1.20, precio: 2.00, stock: 1000, unidad: 'UND', codigo: 'TORN-002' },
    { nombre: 'Tubo PVC 1/2" x 6m', categoria: 'Tubería y PVC', costo: 45.00, precio: 65.00, stock: 80, unidad: 'UND', codigo: 'TUB-001' },
    { nombre: 'Tubo PVC 3/4" x 6m', categoria: 'Tubería y PVC', costo: 55.00, precio: 80.00, stock: 60, unidad: 'UND', codigo: 'TUB-002' },
    { nombre: 'Codo PVC 1/2" 90°', categoria: 'Tubería y PVC', costo: 3.00, precio: 5.00, stock: 200, unidad: 'UND', codigo: 'TUB-003' },
    { nombre: 'Cable #12 THHN (metro)', categoria: 'Material Eléctrico', costo: 8.00, precio: 12.00, stock: 300, unidad: 'MTS', codigo: 'ELEC-001' },
    { nombre: 'Toma Corriente Doble', categoria: 'Material Eléctrico', costo: 25.00, precio: 40.00, stock: 50, unidad: 'UND', codigo: 'ELEC-002' },
    { nombre: 'Martillo 16oz', categoria: 'Herramientas', costo: 120.00, precio: 180.00, stock: 15, unidad: 'UND', codigo: 'HERR-001' },
    { nombre: 'Canaleta 4" x 3m', categoria: 'Láminas y Metales', costo: 180.00, precio: 260.00, stock: 40, unidad: 'UND', codigo: 'MET-001' },
    { nombre: 'Lámina Zinc #28 3x8', categoria: 'Láminas y Metales', costo: 320.00, precio: 450.00, stock: 25, unidad: 'UND', codigo: 'MET-002' },
  ];

  for (const p of productos) {
    await page.goto(`${BASE_URL}/productos`);
    await page.getByRole('button', { name: /nuevo|agregar|crear/i }).first().click();

    await page.getByLabel(/nombre/i).fill(p.nombre);
    await page.getByLabel(/código|codigo/i).fill(p.codigo);

    const catSelect = page.getByLabel(/categoría|categoria/i);
    if (await catSelect.isVisible()) {
      await catSelect.selectOption({ label: p.categoria });
    }

    const unidadField = page.getByLabel(/unidad/i);
    if (await unidadField.isVisible()) {
      await unidadField.fill(p.unidad);
    }

    await page.getByLabel(/costo/i).fill(String(p.costo));
    await page.getByLabel(/precio/i).first().fill(String(p.precio));

    const stockField = page.getByLabel(/stock|existencia|cantidad/i);
    if (await stockField.isVisible()) {
      await stockField.fill(String(p.stock));
    }

    await page.getByRole('button', { name: /guardar|crear|aceptar/i }).click();
    await page.waitForTimeout(800);
    console.log(`✅ Producto creado: ${p.nombre}`);
  }
});

// ─── PROVEEDOR ────────────────────────────────────────────────────────────────
test('3. Crear proveedores', async ({ page }) => {
  await login(page);

  const proveedores = [
    { nombre: 'Ferretería Central S.A.', contacto: 'Carlos Mejía', telefono: '99887766', email: 'ventas@ferrecentral.hn' },
    { nombre: 'Distribuidora Norte', contacto: 'María López', telefono: '88776655', email: 'pedidos@distnorte.hn' },
  ];

  for (const prov of proveedores) {
    await page.goto(`${BASE_URL}/proveedores`);
    await page.getByRole('button', { name: /nuevo|agregar|crear/i }).first().click();

    await page.getByLabel(/nombre/i).fill(prov.nombre);

    const contactoField = page.getByLabel(/contacto/i);
    if (await contactoField.isVisible()) await contactoField.fill(prov.contacto);

    const telField = page.getByLabel(/teléfono|telefono/i);
    if (await telField.isVisible()) await telField.fill(prov.telefono);

    const emailField = page.getByLabel(/email|correo/i);
    if (await emailField.isVisible()) await emailField.fill(prov.email);

    await page.getByRole('button', { name: /guardar|crear|aceptar/i }).click();
    await page.waitForTimeout(800);
    console.log(`✅ Proveedor creado: ${prov.nombre}`);
  }
});

// ─── CLIENTES ─────────────────────────────────────────────────────────────────
test('4. Crear clientes', async ({ page }) => {
  await login(page);

  const clientes = [
    { nombre: 'Juan Carlos Reyes', telefono: '99001122', email: 'jreyes@gmail.com', credito: true, limite: 5000 },
    { nombre: 'Constructora Pérez', telefono: '88223344', email: 'info@constructoraperez.hn', credito: true, limite: 20000 },
    { nombre: 'María González', telefono: '77334455', email: '', credito: false, limite: 0 },
  ];

  for (const c of clientes) {
    await page.goto(`${BASE_URL}/clientes`);
    await page.getByRole('button', { name: /nuevo|agregar|crear/i }).first().click();

    await page.getByLabel(/nombre/i).fill(c.nombre);

    const telField = page.getByLabel(/teléfono|telefono/i);
    if (await telField.isVisible()) await telField.fill(c.telefono);

    if (c.email) {
      const emailField = page.getByLabel(/email|correo/i);
      if (await emailField.isVisible()) await emailField.fill(c.email);
    }

    await page.getByRole('button', { name: /guardar|crear|aceptar/i }).click();
    await page.waitForTimeout(1000);

    if (c.credito) {
      await page.getByText(c.nombre).first().click();
      const creditoBtn = page.getByRole('button', { name: /crédito|credito|habilitar/i });
      if (await creditoBtn.isVisible()) {
        await creditoBtn.click();
        const limiteField = page.getByLabel(/límite|limite/i);
        if (await limiteField.isVisible()) await limiteField.fill(String(c.limite));
        await page.getByRole('button', { name: /guardar|aceptar/i }).click();
        await page.waitForTimeout(800);
      }
    }

    console.log(`✅ Cliente creado: ${c.nombre}`);
  }
});

// ─── VENTAS POS ───────────────────────────────────────────────────────────────
test('5. Realizar ventas de prueba', async ({ page }) => {
  await login(page);

  await page.goto(`${BASE_URL}/pos`);
  await page.waitForTimeout(1000);

  const buscar = page.getByPlaceholder(/buscar|código|producto/i);
  if (await buscar.isVisible()) {
    await buscar.fill('Tornillo');
    await page.waitForTimeout(500);
    await page.getByText(/Tornillo Hexagonal/i).first().click();
    await page.waitForTimeout(300);
    await buscar.fill('Tubo PVC');
    await page.waitForTimeout(500);
    await page.getByText(/Tubo PVC 1\/2/i).first().click();
    await page.waitForTimeout(300);
  }

  const pagoBtn = page.getByRole('button', { name: /cobrar|pagar|procesar/i });
  if (await pagoBtn.isVisible()) {
    await pagoBtn.click();
    await page.waitForTimeout(500);
    const efectivoBtn = page.getByRole('button', { name: /efectivo/i });
    if (await efectivoBtn.isVisible()) await efectivoBtn.click();
    const confirmarBtn = page.getByRole('button', { name: /confirmar|finalizar|completar/i });
    if (await confirmarBtn.isVisible()) await confirmarBtn.click();
    await page.waitForTimeout(1000);
    console.log('✅ Venta 1 (contado) completada');
  }
});
