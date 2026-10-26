-- NEXUS: migración solo aditiva. No borra ni reescribe datos, hashes, sesiones ni secretos existentes.
-- Contadores de intentos fallidos por cuenta (servidor, actualización atómica) y bloqueo persistente
-- de usuarios que no son Admin. Las columnas mfa_* se conservan sin uso (el MFA se retiró del flujo).
ALTER TABLE usuarios
  ADD COLUMN intentos_fallidos INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN ultimo_fallo_at TIMESTAMPTZ,
  ADD COLUMN bloqueado_at TIMESTAMPTZ;
ALTER TABLE super_admins
  ADD COLUMN intentos_fallidos INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN ultimo_fallo_at TIMESTAMPTZ;
-- Búsqueda de la cuenta por usuario, código o correo sin indicar empresa.
CREATE INDEX usuarios_email_idx ON usuarios(email);
CREATE INDEX usuarios_username_idx ON usuarios(username);
-- Contraseña temporal de recuperación: solo hash bcrypt, un uso, vigencia de 10 minutos.
CREATE TABLE auth_temp_passwords (
  id TEXT PRIMARY KEY,
  sujeto_id TEXT NOT NULL,
  tipo TEXT NOT NULL,
  tenant_id TEXT,
  password_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT auth_temp_passwords_scope CHECK ((tipo = 'SUPER_ADMIN' AND tenant_id IS NULL) OR (tipo = 'TENANT' AND tenant_id IS NOT NULL))
);
CREATE UNIQUE INDEX auth_temp_passwords_sujeto_tipo_key ON auth_temp_passwords(sujeto_id, tipo);
CREATE INDEX auth_temp_passwords_expires_at_idx ON auth_temp_passwords(expires_at);
