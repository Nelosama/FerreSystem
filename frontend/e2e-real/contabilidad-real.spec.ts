import { execFileSync } from 'node:child_process';
import { syntheticMfaFor } from './mfa.fixture';
import { expect, test, type APIRequestContext } from '@playwright/test';

// CONTABILIDAD Y CONTROL TRIBUTARIO contra backend y PostgreSQL reales (sin mocks): el administrador activa el módulo,
// registra los datos fiscales y crea un usuario CONTADOR; el contador consulta y descarga el libro del mes en Excel;
// se verifica que no puede operar ventas ni caja, que no ve a otra empresa y que las descargas no alteran la base.

const API = process.env.E2E_API_URL!;
const PASSWORD = process.env.E2E_PASSWORD!;
const PSQL = `${process.env.PG_BIN ?? '/usr/lib/postgresql/16/bin'}/psql`;
const DB = `postgresql://postgres@127.0.0.1:${process.env.E2E_PG_PORT ?? '55433'}/postgres`;
const sql = (consulta: string) => execFileSync(PSQL, ['-X', '-At', DB, '-c', consulta], { encoding: 'utf8' }).trim();
const TENANT = 'e2e-empresa-a';
const SUPER_ADMIN = 'superadmin.e2e@e2e.invalid';
const CONTADOR = 'contador.a.real@e2e.invalid';
const CLAVE_CONTADOR = 'Contador-E2E-2026-real';
const PERIODO = 'anio=2026&mes=10';

type Sesion = { token: string; id: string; rol: string };
const auth = (s: Sesion) => ({ Authorization: `Bearer ${s.token}` });

async function login(request: APIRequestContext, email: string, password: string): Promise<Sesion> {
  const res = await request.post(`${API}/auth/login`, { data: { email, password } });
  expect(res.status(), `login ${email}`).toBe(200);
  const b = await res.json();
  return { token: b.accessToken, id: b.user.id, rol: b.user.rol };
}

/** Descarga binaria: devuelve el archivo tal cual lo entrega la API. */
async function descargar(request: APIRequestContext, s: Sesion, ruta: string) {
  const res = await request.get(`${API}${ruta}`, { headers: auth(s) });
  expect(res.status(), ruta).toBe(200);
  return { cabeceras: res.headers(), cuerpo: await res.body() };
}

/** Lectura mínima del .xlsx: nombres de hoja y textos (sin dependencias). */
function leerXlsx(buf: Buffer) {
  const fin = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  let p = buf.readUInt32LE(fin + 16);
  const archivos: Record<string, string> = {};
  for (let i = 0; i < buf.readUInt16LE(fin + 10); i++) {
    const tam = buf.readUInt32LE(p + 20), nLen = buf.readUInt16LE(p + 28), eLen = buf.readUInt16LE(p + 30), cLen = buf.readUInt16LE(p + 32), offset = buf.readUInt32LE(p + 42);
    const nombre = buf.subarray(p + 46, p + 46 + nLen).toString('utf8');
    const local = offset + 30 + buf.readUInt16LE(offset + 26) + buf.readUInt16LE(offset + 28);
    archivos[nombre] = buf.subarray(local, local + tam).toString('utf8');
    p += 46 + nLen + eLen + cLen;
  }
  const hojas = [...archivos['xl/workbook.xml'].matchAll(/<sheet name="([^"]+)"/g)].map(m => m[1]);
  const textos = [...Object.values(archivos).join('').matchAll(/<t[^>]*>([^<]*)<\/t>/g)].map(m => m[1]);
  return { hojas, textos };
}

test.describe.configure({ mode: 'serial' });

let admin: Sesion;
let contador: Sesion;
let adminB: Sesion;
const conteo = `SELECT (SELECT count(*) FROM ventas) || '|' || (SELECT count(*) FROM fiscal_documentos) || '|' || (SELECT count(*) FROM contable_asientos) || '|' || (SELECT count(*) FROM cajas)`;

test('1. el administrador activa el módulo, registra datos fiscales y crea un usuario CONTADOR', async ({ request }) => {
  admin = await login(request, 'admin.a@e2e.invalid', PASSWORD);
  adminB = await login(request, 'admin.b@e2e.invalid', PASSWORD);
  // Activación del módulo por la empresa (en el entorno temporal, igual que lo haría el Super Admin en «Servicios»).
  sql(`INSERT INTO tenant_modules (id,tenant_id,module_key,enabled,updated_at) VALUES (gen_random_uuid()::text,'${TENANT}','contabilidad',true,NOW()) ON CONFLICT (tenant_id,module_key) DO UPDATE SET enabled=true`);
  const cfg = await request.put(`${API}/contabilidad/configuracion`, { headers: auth(admin), data: { rtn: '0801-0000-000001', razonSocial: 'Ferretería Central E2E S. de R.L.', agenteRetencion: false, motivo: 'Alta del piloto' } });
  expect(cfg.status()).toBe(200);
  const nuevo = await request.post(`${API}/usuarios`, { headers: auth(admin), data: { nombre: 'Contador E2E', email: CONTADOR, rol: 'CONTADOR' } });
  expect(nuevo.status()).toBe(201);
  expect((await nuevo.json()).permisos).toEqual(['contabilidad.ver']);
  // El alta no acepta contraseña: el titular la establece con el enlace privado que emite el Super Admin.
  const plataforma = await request.post(`${API}/auth/login`, { data: { email: SUPER_ADMIN, password: PASSWORD, mfaCode: await syntheticMfaFor(SUPER_ADMIN) } });
  expect(plataforma.status()).toBe(200);
  const emitido = await request.post(`${API}/auth/security/admin-reset`, { headers: { Authorization: `Bearer ${(await plataforma.json()).accessToken}` }, data: { usuarioId: (await nuevo.json()).id, tenantId: TENANT, currentPassword: PASSWORD, mfaCode: await syntheticMfaFor(SUPER_ADMIN) } });
  expect(emitido.status()).toBe(201);
  const fijada = await request.post(`${API}/auth/security/reset`, { data: { token: (await emitido.json()).token, password: CLAVE_CONTADOR } });
  expect(fijada.status()).toBe(200);
});

test('2. el contador inicia sesión, consulta los libros y descarga el libro del mes en Excel', async ({ request }) => {
  contador = await login(request, CONTADOR, CLAVE_CONTADOR);
  expect(contador.rol).toBe('CONTADOR');
  const libro = await request.get(`${API}/contabilidad/libros/ventas?${PERIODO}`, { headers: auth(contador) });
  expect(libro.status()).toBe(200);
  const archivo = await descargar(request, contador, `/contabilidad/exportar/mensual?${PERIODO}&formato=xlsx`);
  expect(archivo.cabeceras['content-type']).toContain('spreadsheetml');
  expect(archivo.cabeceras['content-disposition']).toContain('libro-contable-2026-10.xlsx');
  const xlsx = leerXlsx(archivo.cuerpo);
  expect(xlsx.hojas).toEqual(['Resumen general', 'Ventas', 'Compras', 'ISV', 'Retenciones', 'Documentos emitidos', 'Documentos recibidos', 'Conciliación', 'Hallazgos', 'Libro diario', 'Balanza de comprobación']);
  expect(xlsx.textos).toContain('RTN: 08010000000001');
  expect(xlsx.textos).toContain('Empresa: Ferretería Central E2E');
});

test('3. el contador no puede vender, abrir caja, cobrar ni administrar usuarios', async ({ request }) => {
  const antes = sql(conteo);
  expect((await request.post(`${API}/ventas`, { headers: auth(contador), data: { solicitudId: '00000000-0000-4000-8000-000000000001', items: [] } })).status()).toBe(403);
  expect((await request.post(`${API}/operaciones/caja/abrir`, { headers: auth(contador), data: { montoApertura: 0 } })).status()).toBe(403);
  expect((await request.post(`${API}/operaciones/cuentas/00000000-0000-4000-8000-000000000002/pagos`, { headers: auth(contador), data: {} })).status()).toBe(403);
  expect((await request.post(`${API}/usuarios`, { headers: auth(contador), data: { nombre: 'Otro', email: 'otro@e2e.invalid', rol: 'CONTADOR' } })).status()).toBe(403);
  expect(sql(conteo)).toBe(antes);
});

test('4. la empresa B no ve datos de la empresa A ni en el libro ni en el Excel', async ({ request }) => {
  const libroB = await request.get(`${API}/contabilidad/libros/ventas?${PERIODO}`, { headers: auth(adminB) });
  expect(libroB.status()).toBe(403); // la empresa B no tiene el módulo contratado
  const xlsxA = leerXlsx((await descargar(request, admin, `/contabilidad/exportar/mensual?${PERIODO}&formato=xlsx`)).cuerpo);
  expect(xlsxA.textos.some(t => t.includes('Ferretería Central E2E'))).toBe(true);
  // Ruta del ADMIN de la empresa B: sin el módulo, no hay exportación de su información fiscal.
  expect((await request.get(`${API}/contabilidad/exportar/mensual?${PERIODO}&formato=xlsx`, { headers: auth(adminB) })).status()).toBe(403);
});

test('5. descargar no altera la información contable', async ({ request }) => {
  const antes = sql(conteo);
  for (const r of ['ventas', 'compras', 'isv', 'retenciones', 'conciliacion', 'diario', 'balanza', 'ajustes', 'periodos']) {
    await descargar(request, contador, `/contabilidad/exportar/${r}?${PERIODO}&formato=xlsx`);
  }
  expect(sql(conteo)).toBe(antes);
});
