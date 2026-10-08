import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { DEFAULT_TENANT_MODULES } from '../src/common/tenant-modules';

class BootstrapError extends Error {}
const prefix = 'FERRE_BOOTSTRAP_';

function required(name: string, trim = true): string {
  const raw = process.env[prefix + name];
  const value = trim ? raw?.trim() : raw;
  if (!value) throw new BootstrapError(`Falta ${prefix}${name}. No se generan credenciales automáticamente.`);
  return value;
}

function email(name: string): string {
  const value = required(name).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) throw new BootstrapError(`${prefix}${name} no es un correo válido.`);
  return value;
}

function password(name: string): string {
  const value = required(name, false);
  if (value.length < 12 || Buffer.byteLength(value, 'utf8') > 72) {
    throw new BootstrapError(`${prefix}${name} requiere al menos 12 caracteres y como máximo 72 bytes UTF-8.`);
  }
  return value;
}

async function main() {
  // Validar todo antes de conectarse; nunca usar credenciales predeterminadas/de demostración.
  const config = {
    superEmail: email('SUPER_ADMIN_EMAIL'), superName: required('SUPER_ADMIN_NAME'),
    superPassword: password('SUPER_ADMIN_PASSWORD'), tenantId: required('TENANT_ID'),
    tenantName: required('TENANT_NAME'), adminEmail: email('ADMIN_EMAIL'),
    adminName: required('ADMIN_NAME'), adminPassword: password('ADMIN_PASSWORD'),
  };
  if (config.superEmail === config.adminEmail) throw new BootstrapError('Super Admin y Admin requieren correos distintos para evitar ambigüedad en login.');
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(config.tenantId)) {
    throw new BootstrapError('FERRE_BOOTSTRAP_TENANT_ID debe ser un UUID estable elegido para esta empresa.');
  }
  const url = process.env.DIRECT_URL || process.env.DATABASE_URL;
  if (!url) throw new BootstrapError('Configure DIRECT_URL o DATABASE_URL explícitamente en el proceso local.');
  try {
    const parsed = new URL(url);
    if (!['postgres:', 'postgresql:'].includes(parsed.protocol) || (parsed.searchParams.get('schema') || 'public') !== 'public') throw new Error();
  } catch { throw new BootstrapError('La conexión debe ser PostgreSQL y usar el esquema public.'); }

  const prisma = new PrismaClient({ datasources: { db: { url } }, log: [] });
  try {
    await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(827419, 12027)`;
      const existingSuper = await tx.superAdmin.findUnique({ where: { email: config.superEmail } });
      if (existingSuper) {
        if (!existingSuper.activo || !(await bcrypt.compare(config.superPassword, existingSuper.passwordHash))) {
          throw new BootstrapError('Super Admin existente inactivo o contraseña distinta: no se restablece ni reactiva con seed.');
        }
      } else {
        if (await tx.superAdmin.count()) throw new BootstrapError('Ya existe otro Super Admin. Revisar identidad antes de agregar uno con seed.');
        await tx.superAdmin.create({ data: {
          nombre: config.superName, email: config.superEmail,
          passwordHash: await bcrypt.hash(config.superPassword, 12), activo: true,
        } });
      }

      let tenant = await tx.tenant.findUnique({ where: { id: config.tenantId } });
      if (tenant) {
        if (tenant.estado !== 'ACTIVO' || tenant.nombreComercial !== config.tenantName) {
          throw new BootstrapError('La empresa existente no coincide o está suspendida; seed no cambia su identidad ni estado.');
        }
      } else {
        if (await tx.tenant.findFirst({ where: { nombreComercial: config.tenantName } })) {
          throw new BootstrapError('Existe una empresa del mismo nombre con otro ID; seed no la duplica.');
        }
        tenant = await tx.tenant.create({ data: { id: config.tenantId, nombreComercial: config.tenantName, estado: 'ACTIVO' } });
        await tx.tenantModule.createMany({ data: DEFAULT_TENANT_MODULES.map(moduleKey => ({ tenantId: tenant!.id, moduleKey, enabled: true })) });
      }

      const existingAdmin = await tx.usuario.findUnique({ where: { tenantId_email: { tenantId: tenant.id, email: config.adminEmail } } });
      if (existingAdmin) {
        if (!existingAdmin.activo || existingAdmin.rol !== 'ADMIN' || !(await bcrypt.compare(config.adminPassword, existingAdmin.passwordHash))) {
          throw new BootstrapError('Admin existente incompatible/inactivo o contraseña distinta: seed no modifica permisos ni credenciales.');
        }
      } else {
        if (await tx.usuario.count({ where: { tenantId: tenant.id, rol: 'ADMIN' } })) {
          throw new BootstrapError('Ya existe otro Admin de esta empresa; revisar identidad antes de agregar uno con seed.');
        }
        await tx.usuario.create({ data: {
          tenantId: tenant.id, nombre: config.adminName, email: config.adminEmail,
          passwordHash: await bcrypt.hash(config.adminPassword, 12), rol: 'ADMIN', activo: true,
        } });
      }
      // Sin clientes, productos, cotizaciones, ventas ni contadores ficticios.
      // Las secuencias se crean por los flujos transaccionales cuando se necesita el primer número.
    }, { maxWait: 10000, timeout: 30000 });
    console.log('Bootstrap verificado: Super Admin y Admin activos. Credenciales y datos operativos no se imprimen ni se restablecen.');
  } finally { await prisma.$disconnect(); }
}

main().catch((error: unknown) => {
  const code = typeof error === 'object' && error !== null && 'code' in error && /^P\d{4}$/.test(String(error.code)) ? ` (${String(error.code)})` : '';
  console.error(error instanceof BootstrapError ? error.message : `Bootstrap falló${code}; no se muestran consultas, credenciales ni cadenas de conexión.`);
  process.exitCode = 1;
});
