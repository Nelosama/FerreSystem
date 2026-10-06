import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';

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
