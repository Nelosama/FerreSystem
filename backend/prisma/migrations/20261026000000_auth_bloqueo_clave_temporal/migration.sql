-- NEXUS: aditiva. Conserva identidades, hashes y sesiones; no escribe credenciales.
-- Fallos consecutivos por cuenta, bloqueo de empleados y cambio obligatorio tras una clave temporal.
ALTER TABLE usuarios ADD COLUMN login_fallos INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN bloqueado_at TIMESTAMPTZ,
  ADD COLUMN debe_cambiar_password BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE usuarios ADD CONSTRAINT usuarios_login_fallos_no_negativo CHECK (login_fallos >= 0);
ALTER TABLE super_admins ADD COLUMN login_fallos INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN debe_cambiar_password BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE super_admins ADD CONSTRAINT super_admins_login_fallos_no_negativo CHECK (login_fallos >= 0);
-- El login sin empresa busca el identificador en todos los negocios antes de comprobar la contraseña.
CREATE INDEX usuarios_username_idx ON usuarios(username);
CREATE INDEX usuarios_email_idx ON usuarios(email);
