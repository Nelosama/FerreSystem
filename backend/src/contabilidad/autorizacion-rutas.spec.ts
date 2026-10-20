import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { RequestMethod } from '@nestjs/common';
import { ROLES_KEY } from '../common/decorators/roles.decorator';
import { REQUIRED_MODULE_KEY } from '../common/decorators/required-module.decorator';
import { ContabilidadController } from './contabilidad.controller';

// Auditoría estática de TODAS las rutas: el rol CONTADOR solo escribe en Contabilidad.
// Si un controlador nuevo añade una ruta de escritura sin @Roles, esta prueba falla.
function controladores(dir: string): string[] {
  return readdirSync(dir).flatMap(nombre => {
    const ruta = join(dir, nombre);
    if (statSync(ruta).isDirectory()) return controladores(ruta);
    return nombre.endsWith('.controller.ts') ? [ruta] : [];
  });
}

interface Ruta { controlador: string; metodo: string; ruta: string; roles: string[] | null; modulo: unknown }
async function rutas(): Promise<Ruta[]> {
  const resultado: Ruta[] = [];
  for (const archivo of controladores(join(__dirname, '..'))) {
    const modulo = await import(archivo);
    for (const clase of Object.values(modulo) as any[]) {
      if (typeof clase !== 'function' || Reflect.getMetadata(PATH_METADATA, clase) === undefined) continue;
      for (const nombre of Object.getOwnPropertyNames(clase.prototype)) {
        const handler = clase.prototype[nombre];
        const metodo = Reflect.getMetadata(METHOD_METADATA, handler);
        if (metodo === undefined || nombre === 'constructor') continue;
        resultado.push({
          controlador: clase.name, metodo: RequestMethod[metodo], ruta: `${Reflect.getMetadata(PATH_METADATA, clase)}/${Reflect.getMetadata(PATH_METADATA, handler)}`,
          roles: Reflect.getMetadata(ROLES_KEY, handler) ?? Reflect.getMetadata(ROLES_KEY, clase) ?? null,
          modulo: Reflect.getMetadata(REQUIRED_MODULE_KEY, handler) ?? Reflect.getMetadata(REQUIRED_MODULE_KEY, clase),
        });
      }
    }
  }
  return resultado;
}

describe('Autorización del rol CONTADOR en todas las rutas', () => {
  let todas: Ruta[] = [];
  // Importar todos los controladores tarda bajo carga paralela: se hace una vez.
  beforeAll(async () => { todas = await rutas(); }, 60000);

  it('ninguna ruta de escritura fuera de Contabilidad admite CONTADOR', () => {
    expect(todas.length).toBeGreaterThan(100);
    const escritura = todas.filter(r => r.controlador !== ContabilidadController.name && r.metodo !== 'GET');
    const abiertas = escritura.filter(r => r.roles?.includes('CONTADOR'));
    expect(abiertas).toEqual([]);
    // Rutas de escritura de empresa sin @Roles: solo autenticación/sesión y las de Super Admin (protegidas por SuperAdminGuard).
    const sinRoles = escritura.filter(r => r.roles === null).map(r => `${r.controlador} ${r.metodo} ${r.ruta}`);
    expect(sinRoles.every(r => /^(AuthController|SuperAdminController) /.test(r))).toBe(true);
  });

  it('ventas, cobros, inventario y caja no están al alcance del CONTADOR ni para leer con roles explícitos', () => {
    const operativas = todas.filter(r => /^(ventas|operaciones|productos|entregas|contingencia|levantamientos|clientes|cotizaciones|proveedores|garantias)\//.test(r.ruta));
    expect(operativas.length).toBeGreaterThan(50);
    expect(operativas.filter(r => r.roles?.includes('CONTADOR'))).toEqual([]);
  });

  it('Contabilidad: módulo opcional, ADMIN y CONTADOR, y reapertura solo ADMIN', () => {
    const propias = todas.filter(r => r.controlador === ContabilidadController.name);
    expect(propias.length).toBeGreaterThan(25);
    for (const r of propias) expect(r.modulo).toBe('contabilidad');
    const reabrir = propias.find(r => r.ruta.endsWith('reabrir'))!;
    expect(reabrir.roles).toEqual(['ADMIN']);
    for (const r of propias.filter(x => x !== reabrir)) expect(r.roles).toEqual(['ADMIN', 'CONTADOR']);
  });
});
