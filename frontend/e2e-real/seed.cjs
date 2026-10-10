// Siembra de datos de prueba para E2E con backend real. Solo escribe en la base indicada por
// DATABASE_URL, que el script run.sh crea como clúster temporal aislado. Nunca apunta a producción.
const path = require('node:path');
const backend = path.resolve(__dirname, '../../backend');
const { PrismaClient } = require(path.join(backend, 'node_modules/@prisma/client'));
const bcrypt = require(path.join(backend, 'node_modules/bcrypt'));

const prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });

const TENANT_A = 'e2e-empresa-a';
const TENANT_B = 'e2e-empresa-b';

(async () => {
  const password = process.env.E2E_PASSWORD;
  if (!password || password.length < 8) throw new Error('E2E_PASSWORD es obligatorio (mínimo 8 caracteres)');
  const passwordHash = await bcrypt.hash(password, 10);

  for (const [id, nombre] of [[TENANT_A, 'Ferretería Central E2E'], [TENANT_B, 'Ferretería Norte E2E']]) {
    await prisma.tenant.create({ data: { id, nombreComercial: nombre, estado: 'ACTIVO' } });
  }

  const usuarios = {};
  const crear = async (tenantId, key, nombre, email, rol, permisos = []) => {
    usuarios[key] = await prisma.usuario.create({
      data: { tenantId, nombre, email, passwordHash, rol, permisosConfigurados: true, permisos },
    });
  };
  await crear(TENANT_A, 'adminA', 'Administrador E2E', 'admin.a@e2e.invalid', 'ADMIN');
  await crear(TENANT_A, 'cajeroA', 'Cajero E2E', 'cajero.a@e2e.invalid', 'CAJERO', ['pos.vender']);
  await crear(TENANT_A, 'bodegueroA', 'Bodeguero E2E', 'bodeguero.a@e2e.invalid', 'BODEGUERO');
  await crear(TENANT_B, 'adminB', 'Administrador Norte E2E', 'admin.b@e2e.invalid', 'ADMIN');

  const productos = {};
  const producto = async (tenantId, key, codigo, nombre, precio) => {
    productos[key] = await prisma.producto.create({
      data: { tenantId, codigo, nombre, precioVenta: precio, precioCosto: precio * 0.6, stockActual: 10, stockMinimo: 1 },
    });
  };
  await producto(TENANT_A, 'taladroA', 'TAL-E2E-1', 'Taladro percutor 1/2" E2E', 2500);
  await producto(TENANT_A, 'inversorA', 'INV-E2E-2', 'Inversor soldadora 200A E2E', 8900);
  await producto(TENANT_A, 'entregaA', 'ENT-E2E-1', 'Cemento gris bodega E2E', 200);
  await producto(TENANT_B, 'taladroB', 'TAL-E2E-1', 'Taladro norte E2E', 2400);

  // Facturas con fecha de negocio fija (2026-10-01 en Tegucigalpa): 18:00 UTC = 12:00 locales.
  const venta = async (tenantId, usuarioId, numero, fechaUtc, lineas) => prisma.venta.create({
    data: {
      tenantId, numeroVenta: numero, usuarioId, subtotal: 100, isv: 15, total: 115,
      createdAt: new Date(fechaUtc), clienteNombre: 'Constructora del Norte E2E',
      detalles: { create: lineas.map((p) => ({ productoId: p.id, cantidad: 1, precioUnitario: 100, subtotal: 100 })) },
    },
  });
  await venta(TENANT_A, usuarios.adminA.id, 1043, '2026-10-01T18:00:00.000Z', [productos.taladroA]);
  await venta(TENANT_A, usuarios.adminA.id, 1044, '2026-10-01T18:00:00.000Z', [productos.taladroA, productos.inversorA]);
  await venta(TENANT_B, usuarios.adminB.id, 1043, '2026-10-01T18:00:00.000Z', [productos.taladroB]);
  // Clientes para el POS: uno con crédito habilitado y otro sin crédito.
  await prisma.cliente.create({ data: { tenantId: TENANT_A, nombre: 'Constructora del Norte E2E', rtn: '08019999123456', telefono: '9876-5432', creditoHabilitado: true, limiteCredito: 5000, saldoPendiente: 0 } });
  await prisma.cliente.create({ data: { tenantId: TENANT_A, nombre: 'Taller San José E2E', telefono: '3311-2244', creditoHabilitado: false, saldoPendiente: 0 } });
  // Factura sin garantía para la prueba de escritura del cajero (debe fallar sin cambios).
  await venta(TENANT_A, usuarios.adminA.id, 1045, '2026-10-01T18:00:00.000Z', [productos.taladroA]);

  console.log(JSON.stringify({ tenantA: TENANT_A, tenantB: TENANT_B, usuarios: Object.fromEntries(Object.entries(usuarios).map(([k, u]) => [k, { id: u.id, rol: u.rol, email: u.email }])) }));
  await prisma.$disconnect();
})().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
