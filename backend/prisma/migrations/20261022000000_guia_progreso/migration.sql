-- NEXUS: aditiva, sin cambios en datos operativos. Cada usuario pertenece a un único negocio.
ALTER TABLE "usuarios" ADD COLUMN "guia_progreso" JSONB NOT NULL DEFAULT '{}';
ALTER TABLE "super_admins" ADD COLUMN "guia_progreso" JSONB NOT NULL DEFAULT '{}';
