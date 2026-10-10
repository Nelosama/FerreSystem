// CENTINELA — protección del seed. Ninguna base se siembra sin una marca de entorno registrada a mano.
//
// La marca vive en la propia base (tabla entorno_ferresystem, creada una vez con prisma/entorno/entorno-marcador.sql).
// El nombre o el host no bastan: un túnel, un alias o un proxy pueden apuntar un nombre "local" a producción.
// Requisitos, todos obligatorios:
//   1. NODE_ENV distinto de production.
//   2. La base tiene exactamente una marca, de tipo DESARROLLO o STAGING. PRODUCCION siempre se rechaza.
//   3. El identificador de la marca figura en prisma/entornos-seed.json (lista versionada, revisada por CODEOWNERS).
//   4. SEED_CONFIRMAR_IDENTIFICADOR contiene exactamente ese identificador (confirmación humana del dato, no del host).

export const TIPOS_SEMBRABLES = ['DESARROLLO', 'STAGING'];

/** Valida la marca leída de la base. `filas`: resultado de SELECT tipo, identificador. */
export function validarMarcador(filas, identificadoresPermitidos, confirmacion) {
  if (!Array.isArray(filas) || filas.length !== 1) {
    throw new Error('La base debe tener exactamente una marca de entorno (entorno_ferresystem). No se siembra.');
  }
  const [{ tipo, identificador }] = filas;
  if (!TIPOS_SEMBRABLES.includes(tipo)) {
    throw new Error(`La marca de entorno es ${tipo}: el seed solo siembra bases de DESARROLLO o STAGING.`);
  }
  if (!identificadoresPermitidos.includes(identificador)) {
    throw new Error('El identificador de la marca no está en prisma/entornos-seed.json. Regístrelo con revisión del responsable.');
  }
  if (confirmacion !== identificador) {
    throw new Error(`Confirme el identificador exacto de la base: SEED_CONFIRMAR_IDENTIFICADOR=${identificador}`);
  }
  return { tipo, identificador };
}

/** Comprobación completa contra la base indicada por DATABASE_URL. Solo lee la marca. */
export async function verificarEntornoSeed({ prisma, env, identificadoresPermitidos }) {
  if (env.NODE_ENV === 'production') throw new Error('El seed no se ejecuta con NODE_ENV=production.');
  if (!env.DATABASE_URL) throw new Error('DATABASE_URL es obligatorio.');
  let filas;
  try {
    filas = await prisma.$queryRawUnsafe('SELECT tipo, identificador::text AS identificador FROM entorno_ferresystem');
  } catch {
    throw new Error('No se pudo leer la marca de entorno: la base es inaccesible o no tiene marca. No se siembra.');
  }
  return validarMarcador(filas, identificadoresPermitidos, env.SEED_CONFIRMAR_IDENTIFICADOR);
}
