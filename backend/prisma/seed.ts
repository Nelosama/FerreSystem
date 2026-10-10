import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

// CENTINELA: el seed nunca aporta credenciales por defecto ni escribe sobre una base que no sea de desarrollo.
function exigirSecreto(nombre: string): string {
  const valor = process.env[nombre];
  if (!valor || valor.length < 12) throw new Error(`${nombre} es obligatorio (mínimo 12 caracteres). No hay claves por defecto.`);
  return valor;
}

function exigirBaseDeDesarrollo(): void {
  if (process.env.NODE_ENV === 'production') throw new Error('El seed no se ejecuta con NODE_ENV=production.');
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL es obligatorio.');
  const host = new URL(process.env.DATABASE_URL).hostname;
  const local = ['localhost', '127.0.0.1', '::1'].includes(host);
  if (!local && process.env.SEED_CONFIRMAR_HOST !== host) {
    throw new Error(`La base ${host} no es local. Para sembrarla, defina SEED_CONFIRMAR_HOST=${host}; no debe usarse contra producción.`);
  }
}

async function main() {
  exigirBaseDeDesarrollo();
  console.log('🌱 Iniciando seed para FerreSystem...');

  // 1. Super Admin (dueño del SaaS - Nelo)
  const superAdminPassword = await bcrypt.hash(exigirSecreto('SUPER_ADMIN_PASSWORD'), 10);
  const superAdmin = await prisma.superAdmin.upsert({
    where: { email: 'admin@ferresystem.hn' },
    // Un Super Admin existente conserva su clave: el seed no la sobrescribe.
    update: {},
    create: {
      nombre: 'Nelo — SaaS Owner',
      email: 'admin@ferresystem.hn',
      passwordHash: superAdminPassword,
      activo: true,
    },
  });
  console.log('✅ SuperAdmin creado/verificado:', superAdmin.email);

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
  } else {
    tenant = await prisma.tenant.update({
      where: { id: tenant.id },
      data: {
        direccion: 'Barrio El Centro, 3ra Ave, 4ta Calle, San Pedro Sula',
        telefono: '+504 2550-1234',
        email: 'ventas@lamundial.hn',
        colorPrimario: '#EA580C',
        estado: 'ACTIVO',
      },
    });
  }
  console.log('✅ Tenant creado/verificado:', tenant.nombreComercial);

  // 2b. Módulos por defecto para el Tenant
  const defaultModules = [
    'pos',
    'cotizaciones',
    'pedidos_especiales',
    'apartados',
    'inventario',
    'ordenes_compra',
    'transferencias_sucursal',
    'garantias',
    'listas_precio',
    'usuarios',
    'comisiones_venta',
    'arqueo_caja',
    'reportes',
    'configuracion',
    'levantamiento',
  ];

  for (const moduleKey of defaultModules) {
    await prisma.tenantModule.upsert({
      where: {
        tenantId_moduleKey: {
          tenantId: tenant.id,
          moduleKey,
        },
      },
      update: { enabled: true },
      create: {
        tenantId: tenant.id,
        moduleKey,
        enabled: true,
      },
    });
  }
  console.log('✅ Módulos del Tenant verificados/habilitados');

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
  const tenantAdminPassword = await bcrypt.hash(exigirSecreto('TENANT_ADMIN_PASSWORD'), 10);
  const adminTenant = await prisma.usuario.upsert({
    where: {
      tenantId_email: {
        tenantId: tenant.id,
        email: 'cajero@lamundial.hn',
      },
    },
    update: {
      passwordHash: tenantAdminPassword,
      activo: true,
    },
    create: {
      tenantId: tenant.id,
      nombre: 'Carlos Ramos (Cajero Principal)',
      email: 'cajero@lamundial.hn',
      passwordHash: tenantAdminPassword,
      rol: 'ADMIN',
      activo: true,
    },
  });
  console.log('✅ Usuario de ferretería creado/verificado:', adminTenant.email);

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
      update: {
        codigoBarras: prod.codigoBarras,
        nombre: prod.nombre,
        categoriaId: prod.categoriaId,
        precioVenta: prod.precioVenta,
        precioCosto: prod.precioCosto,
        unidadMedida: prod.unidadMedida as any,
      },
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
  console.log('✅ Productos del catálogo creados/verificados');

  // 7. Clientes de prueba (con RTN hondureño - Idempotente)
  let cliente1 = await prisma.cliente.findFirst({
    where: { tenantId: tenant.id, rtn: '05019001234567' },
  });

  if (!cliente1) {
    cliente1 = await prisma.cliente.create({
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
  } else {
    cliente1 = await prisma.cliente.update({
      where: { id: cliente1.id },
      data: {
        nombre: 'Constructora del Norte S. de R.L.',
        telefono: '+504 9876-5432',
        email: 'compras@constructoranorte.hn',
        direccion: 'Residencial Los Álamos, SPS',
        tipo: 'CONTRATISTA',
      },
    });
  }

  let cliente2 = await prisma.cliente.findFirst({
    where: { tenantId: tenant.id, rtn: '05021980001234' },
  });

  if (!cliente2) {
    cliente2 = await prisma.cliente.create({
      data: {
        tenantId: tenant.id,
        nombre: 'Ferretería El Progreso (Subdistribuidor)',
        rtn: '05021980001234',
        telefono: '+504 9911-2233',
        tipo: 'MAYORISTA',
      },
    });
  } else {
    cliente2 = await prisma.cliente.update({
      where: { id: cliente2.id },
      data: {
        nombre: 'Ferretería El Progreso (Subdistribuidor)',
        telefono: '+504 9911-2233',
        tipo: 'MAYORISTA',
      },
    });
  }
  console.log('✅ Clientes de prueba creados/verificados');

  // 8. Cotización de ejemplo (Totalmente Idempotente con upsert en tenantId_numeroCotizacion)
  const prodVarilla = await prisma.producto.findFirst({ where: { tenantId: tenant.id, codigo: 'CON-002' } });
  const prodCemento = await prisma.producto.findFirst({ where: { tenantId: tenant.id, codigo: 'CON-001' } });

  if (prodVarilla && prodCemento && cliente1) {
    const subtotal = 10 * Number(prodCemento.precioVenta) + 20 * Number(prodVarilla.precioVenta);
    const isv = subtotal * 0.15;
    const total = subtotal + isv;

    await prisma.cotizacion.upsert({
      where: {
        tenantId_numeroCotizacion: {
          tenantId: tenant.id,
          numeroCotizacion: 1,
        },
      },
      update: {
        clienteId: cliente1.id,
        clienteNombre: cliente1.nombre,
        clienteRtn: cliente1.rtn,
        clienteTelefono: cliente1.telefono,
        clienteEmail: cliente1.email,
        clienteDireccion: cliente1.direccion,
        usuarioId: adminTenant.id,
        subtotal,
        isv,
        descuento: 0,
        total,
        estado: 'ENVIADA',
        notas: 'Entrega en plantel de construcción incluida',
      },
      create: {
        tenantId: tenant.id,
        numeroCotizacion: 1,
        clienteId: cliente1.id,
        clienteNombre: cliente1.nombre,
        clienteRtn: cliente1.rtn,
        clienteTelefono: cliente1.telefono,
        clienteEmail: cliente1.email,
        clienteDireccion: cliente1.direccion,
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
    console.log('✅ Cotización de prueba verificada/creada');
  }

  console.log('\n🎉 Seed completado exitosamente.');
  console.log('--------------------------------------------------');
  console.log('🔑 Super Admin: admin@ferresystem.hn (clave tomada de SUPER_ADMIN_PASSWORD)');
  console.log('🔑 Tenant demo: cajero@lamundial.hn (clave tomada de TENANT_ADMIN_PASSWORD)');
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
