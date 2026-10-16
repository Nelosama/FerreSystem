// Siembra: 1 negocio, 5000 productos (80 % aprobados), 2100 ventas en 7 días, 40 cotizaciones.
const { PrismaClient } = require(require('path').resolve(__dirname, '../../../backend/node_modules/@prisma/client'));
(async () => {
  const p = new PrismaClient({ datasources: { db: { url: process.argv[2] } } });
  const t = await p.tenant.create({ data: { nombreComercial: 'Bench' } });
  const u = await p.usuario.create({ data: { tenantId: t.id, nombre: 'Admin', email: 'a@b.invalid', passwordHash: 'x', rol: 'ADMIN' } });
  const cat = await p.categoria.create({ data: { tenantId: t.id, nombre: 'General' } });
  const prods = Array.from({ length: 5000 }, (_, i) => ({ tenantId: t.id, codigo: `C-${i}`, nombre: `Producto ${String(i).padStart(5, '0')}`, codigoBarras: String(7400000000000 + i),
    categoriaId: cat.id, precioVenta: 10 + (i % 90), precioCosto: 5, stockActual: i % 17, stockMinimo: 3, precioAprobado: i % 5 !== 0, precioAprobadoPor: i % 5 !== 0 ? u.id : null, activo: i % 50 !== 0 }));
  await p.producto.createMany({ data: prods });
  const ahora = Date.now();
  const ventas = Array.from({ length: 2100 }, (_, i) => ({ tenantId: t.id, numeroVenta: i + 1, usuarioId: u.id, subtotal: 100, isv: 15, total: 115 + (i % 7) * 0.01,
    createdAt: new Date(ahora - (i % 7) * 86400000 - (i % 600) * 60000) }));
  await p.venta.createMany({ data: ventas });
  console.log(t.id);
  await p.$disconnect();
})().catch(e => { console.error(e); process.exit(1); });
