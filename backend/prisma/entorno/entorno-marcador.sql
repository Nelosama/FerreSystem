-- CENTINELA — marca de entorno para el seed. NO es una migración (no va en prisma/migrations/).
-- Ejecutar UNA vez, a mano, en la base de DESARROLLO o STAGING que vaya a sembrarse. Nunca en producción.
-- Después, copiar el identificador que devuelve el SELECT final en prisma/entornos-seed.json (revisión CODEOWNERS).
CREATE TABLE IF NOT EXISTS entorno_ferresystem (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  tipo TEXT NOT NULL CHECK (tipo IN ('DESARROLLO', 'STAGING', 'PRODUCCION')),
  identificador UUID NOT NULL UNIQUE,
  creado_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO entorno_ferresystem (id, tipo, identificador)
VALUES (1, 'DESARROLLO', gen_random_uuid())
ON CONFLICT (id) DO NOTHING;
SELECT tipo, identificador FROM entorno_ferresystem;
