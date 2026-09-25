import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Iniciando seed para FerreSystem...');

  // 1. Super Admin (dueño del SaaS - Nelo)
  const superAdminPassword = await bcrypt.hash('SuperAdmin2026!', 10);
  const superAdmin = await prisma.superAdmin.upsert({
    where: { email: 'admin@ferresystem.hn' },
    update: {},
    create: {
      nombre: 'Nelo — SaaS Owner',
      email: 'admin@ferresystem.hn',
      passwordHash: superAdminPassword,
      activo: true,
    },
  });
  console.log('✅ SuperAdmin creado:', superAdmin.email);

  // 2. Tenant de prueba: "La Mundial - Sucursal Centro" (del prototipo)
  let tenant = await prisma.tenant.findFirst({
    where: { nombreComercial: 'LA MUNDIAL - SUCURSAL CENTRO' },
  });

  if (!tenant) {
    tenant = await prisma.tenant.create({
      data: {
        nombreComercial: 'LA MUNDIAL - SUCURSAL CENTRO',
        direccion: 'Barrio El Centro, 3ra Ave, 4ta Calle, San Pedro Sula',
        telefono: '+504 2550-1234',
        email: 'ventas@lamundial.hn',
        colorPrimario: '#EA580C', // Naranja óxido
        estado: 'ACTIVO',
      },
    });
  }
  console.log('✅ Tenant creado:', tenant.nombreComercial);

  // 3. Secuencias transaccionales para el tenant
  await prisma.secuenciaTenant.upsert({
    where: {
      tenantId_tipo: {
        tenantId: tenant.id,
        tipo: 'VENTA',
      },
    },
    update: {},
    create: {
      tenantId: tenant.id,
      tipo: 'VENTA',
      ultimoNumero: 1042,
    },
  });

  await prisma.secuenciaTenant.upsert({
    where: {
      tenantId_tipo: {
        tenantId: tenant.id,
        tipo: 'COTIZACION',
      },
    },
    update: {},
    create: {
      tenantId: tenant.id,
      tipo: 'COTIZACION',
      ultimoNumero: 8,
    },
  });

  // 4. Usuario Admin del Tenant
  const tenantAdminPassword = await bcrypt.hash('Ferre2026!', 10);
  const adminTenant = await prisma.usuario.upsert({
    where: {
      tenantId_email: {
        tenantId: tenant.id,
        email: 'cajero@lamundial.hn',
      },
    },
    update: {},
    create: {
      tenantId: tenant.id,
      nombre: 'Carlos Ramos (Cajero Principal)',
      email: 'cajero@lamundial.hn',
      passwordHash: tenantAdminPassword,
      rol: 'ADMIN',
      activo: true,
    },
  });
  console.log('✅ Usuario de ferretería creado:', adminTenant.email);

  // 5. Categorías
  const catHerramientas = await prisma.categoria.upsert({
    where: { tenantId_nombre: { tenantId: tenant.id, nombre: 'Herramientas Manuales' } },
    update: {},
    create: { tenantId: tenant.id, nombre: 'Herramientas Manuales', descripcion: 'Martillos, destornilladores, llaves' },
  });

  const catConstruccion = await prisma.categoria.upsert({
    where: { tenantId_nombre: { tenantId: tenant.id, nombre: 'Materiales de Construcción' } },
    update: {},
    create: { tenantId: tenant.id, nombre: 'Materiales de Construcción', descripcion: 'Cemento, varilla, arena' },
  });

  const catPlomeria = await prisma.categoria.upsert({
    where: { tenantId_nombre: { tenantId: tenant.id, nombre: 'Plomería y Tuberías' } },
    update: {},
    create: { tenantId: tenant.id, nombre: 'Plomería y Tuberías', descripcion: 'Tubos PVC, accesorios, llaves' },
  });

  const catElectricidad = await prisma.categoria.upsert({
    where: { tenantId_nombre: { tenantId: tenant.id, nombre: 'Electricidad e Iluminación' } },
    update: {},
    create: { tenantId: tenant.id, nombre: 'Electricidad e Iluminación', descripcion: 'Cables, tomacorrientes, focos LED' },
  });

  // 6. Productos (incluyendo algunos con stock bajo para generar alertas)
  const productosData = [
    {
      codigo: 'HER-001',
      codigoBarras: '7421001001',
      nombre: 'Martillo de Uña Curva 16oz Stanley',
      categoriaId: catHerramientas.id,
      precioVenta: 245.00,
      precioCosto: 160.00,
      stockActual: 24,
      stockMinimo: 8,
      unidadMedida: 'UNIDAD',
    },
    {
      codigo: 'CON-001',
      codigoBarras: '7421002001',
      nombre: 'Cemento Bijao Gris Uso General 42.5kg',
      categoriaId: catConstruccion.id,
      precioVenta: 220.00,
      precioCosto: 185.00,
      stockActual: 180,
      stockMinimo: 50,
      unidadMedida: 'UNIDAD',
    },
    {
      codigo: 'CON-002',
      codigoBarras: '7421002002',
      nombre: 'Varilla Corrugada 3/8" Grado 40 (6m)',
      categoriaId: catConstruccion.id,
      precioVenta: 165.00,
      precioCosto: 130.00,
      stockActual: 5, // ⚠️ STOCK BAJO
      stockMinimo: 40,
      unidadMedida: 'UNIDAD',
    },
    {
      codigo: 'PLO-001',
      codigoBarras: '7421003001',
      nombre: 'Tubo PVC Sanitario 4" x 6m Durman',
      categoriaId: catPlomeria.id,
      precioVenta: 380.00,
      precioCosto: 275.00,
      stockActual: 3, // ⚠️ STOCK BAJO
      stockMinimo: 15,
      unidadMedida: 'UNIDAD',
    },
    {
      codigo: 'ELE-001',
      codigoBarras: '7421004001',
      nombre: 'Cable THHN Calibre 12 AWG Rollo 100m',
      categoriaId: catElectricidad.id,
      precioVenta: 1450.00,
      precioCosto: 1100.00,
      stockActual: 2, // ⚠️ STOCK BAJO
      stockMinimo: 10,
      unidadMedida: 'UNIDAD',
    },
    {
      codigo: 'HER-002',
      codigoBarras: '7421001002',
      nombre: 'Cinta Métrica 8m / 26ft Truper Grip',
      categoriaId: catHerramientas.id,
      precioVenta: 185.00,
      precioCosto: 115.00,
      stockActual: 15,
      stockMinimo: 6,
      unidadMedida: 'UNIDAD',
    },
  ];

  for (const prod of productosData) {
    await prisma.producto.upsert({
      where: {
        tenantId_codigo: {
          tenantId: tenant.id,
          codigo: prod.codigo,
        },
      },
      update: {},
      create: {
        tenantId: tenant.id,
        codigo: prod.codigo,
        codigoBarras: prod.codigoBarras,
        nombre: prod.nombre,
        categoriaId: prod.categoriaId,
        precioVenta: prod.precioVenta,
        precioCosto: prod.precioCosto,
        stockActual: prod.stockActual,
        stockMinimo: prod.stockMinimo,
        unidadMedida: prod.unidadMedida as any,
      },
    });
  }
  console.log('✅ Productos del catálogo creados con éxito');

  // 7. Clientes de prueba (con RTN hondureño)
  const cliente1 = await prisma.cliente.create({
    data: {
      tenantId: tenant.id,
      nombre: 'Constructora del Norte S. de R.L.',
      rtn: '05019001234567',
      telefono: '+504 9876-5432',
      email: 'compras@constructoranorte.hn',
      direccion: 'Residencial Los Álamos, SPS',
      tipo: 'CONTRATISTA',
    },
  });

  await prisma.cliente.create({
    data: {
      tenantId: tenant.id,
      nombre: 'Ferretería El Progreso (Subdistribuidor)',
      rtn: '05021980001234',
      telefono: '+504 9911-2233',
      tipo: 'MAYORISTA',
    },
  });

  // 8. Cotización de ejemplo
  const prodVarilla = await prisma.producto.findFirst({ where: { tenantId: tenant.id, codigo: 'CON-002' } });
  const prodCemento = await prisma.producto.findFirst({ where: { tenantId: tenant.id, codigo: 'CON-001' } });

  if (prodVarilla && prodCemento) {
    const subtotal = 10 * Number(prodCemento.precioVenta) + 20 * Number(prodVarilla.precioVenta);
    const isv = subtotal * 0.15;
    const total = subtotal + isv;

    await prisma.cotizacion.create({
      data: {
        tenantId: tenant.id,
        numeroCotizacion: 1,
        clienteId: cliente1.id,
        usuarioId: adminTenant.id,
        subtotal,
        isv,
        descuento: 0,
        total,
        estado: 'ENVIADA',
        fechaValidez: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000), // Vence en 2 días
        notas: 'Entrega en plantel de construcción incluida',
        detalles: {
          create: [
            { productoId: prodCemento.id, cantidad: 10, precioUnitario: prodCemento.precioVenta, subtotal: 10 * Number(prodCemento.precioVenta) },
            { productoId: prodVarilla.id, cantidad: 20, precioUnitario: prodVarilla.precioVenta, subtotal: 20 * Number(prodVarilla.precioVenta) },
          ],
        },
      },
    });
    console.log('✅ Cotización de prueba creada');
  }

  console.log('\n🎉 Seed completado exitosamente.');
  console.log('--------------------------------------------------');
  console.log('🔑 Credenciales Super Admin:');
  console.log('   Email: admin@ferresystem.hn');
  console.log('   Clave: SuperAdmin2026!');
  console.log('🔑 Credenciales Tenant (La Mundial):');
  console.log('   Email: cajero@lamundial.hn');
  console.log('   Clave: Ferre2026!');
  console.log('--------------------------------------------------');
}

main()
  .catch((e) => {
    console.error('❌ Error en seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
