import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';

it('la migración preserva empresas existentes y persiste configuración en SQL por empresa', async () => {
  const db = new PGlite();
  try {
    await db.exec("CREATE TABLE tenants (id TEXT PRIMARY KEY, modo_navegacion TEXT NOT NULL DEFAULT 'SIDEBAR'); INSERT INTO tenants(id) VALUES ('A'), ('B');");
    await db.exec(readFileSync('prisma/migrations/20261006000100_tenant_configuration/migration.sql', 'utf8'));
    const configuration = { templateVersion: 'v2', moneda: { simbolo: 'L.', codigo: 'HNL' }, impuesto: { nombre: 'ISV', tasa: 0 } };
    await db.query("UPDATE tenants SET configuracion = $1::jsonb, modo_navegacion = 'TOPNAV' WHERE id = $2", [JSON.stringify(configuration), 'A']);
    const { rows } = await db.query<any>('SELECT * FROM tenants ORDER BY id');
    expect(rows[0]).toMatchObject({ id: 'A', configuracion: configuration, modo_navegacion: 'TOPNAV' });
    expect(rows[1]).toMatchObject({ id: 'B', configuracion: {}, modo_navegacion: 'SIDEBAR' });
  } finally { await db.close(); }
}, 30000);


it('la cadena ordenada instala el esquema actual y tenant_configuration es aditiva', async () => {
  const db = new PGlite();
  try {
    const names = readdirSync('prisma/migrations').filter(name => /^\d{14}_/.test(name)).sort();
    expect(names.at(-1)).toBe('20261006000100_tenant_configuration');
    for (const name of names.slice(0, -1)) {
      await db.exec(readFileSync(`prisma/migrations/${name}/migration.sql`, 'utf8'));
    }
    // Registros sintéticos en una base efímera creada por esta prueba, nunca una base existente.
    await db.exec("INSERT INTO tenants(id, nombre_comercial, modo_navegacion, updated_at) VALUES ('legacy', 'Anterior', 'TOPNAV', NOW());");
    const oldProjection = "SELECT id, nombre_comercial, modo_navegacion FROM tenants WHERE id = 'legacy'";
    const before = await db.query(oldProjection);
    await db.exec(readFileSync(`prisma/migrations/${names.at(-1)}/migration.sql`, 'utf8'));
    expect((await db.query(oldProjection)).rows).toEqual(before.rows);
    expect((await db.query("SELECT configuracion FROM tenants WHERE id = 'legacy'")).rows).toEqual([{ configuracion: {} }]);
    await db.exec("INSERT INTO tenants(id, nombre_comercial, updated_at) VALUES ('new', 'Nueva', NOW());");
    expect((await db.query("SELECT configuracion FROM tenants WHERE id = 'new'")).rows).toEqual([{ configuracion: {} }]);
  } finally { await db.close(); }
}, 30000);
