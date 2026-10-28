-- NEXUS: migración consolidada de #200 y #201. Solo aditiva: no borra ni reescribe filas, hashes, sesiones ni secretos MFA.
-- Contador persistente de intentos fallidos por cuenta y bloqueo permanente de cuentas operativas (no ADMIN) al sexto fallo.
-- La contraseña temporal de recuperación reutiliza auth_actions (solo su SHA-256, un uso, 10 minutos): no hay tabla nueva.
ALTER TABLE usuarios
  ADD COLUMN intentos_fallidos INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN ultimo_fallo_at TIMESTAMPTZ,
  ADD COLUMN bloqueado_at TIMESTAMPTZ;
ALTER TABLE usuarios ADD CONSTRAINT usuarios_intentos_fallidos_no_negativo CHECK (intentos_fallidos >= 0);
ALTER TABLE super_admins
  ADD COLUMN intentos_fallidos INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN ultimo_fallo_at TIMESTAMPTZ;
ALTER TABLE super_admins ADD CONSTRAINT super_admins_intentos_fallidos_no_negativo CHECK (intentos_fallidos >= 0);
-- El inicio de sesión sin empresa busca el identificador en todos los negocios antes de comprobar ninguna contraseña.
-- Índices NO únicos: las bases existentes pueden tener identificadores repetidos entre empresas (antes solo eran únicos
-- por empresa). Ver docs/AUTH_CONSOLIDACION_20261026.md §5 para detectarlos y corregirlos antes de un índice único.
CREATE INDEX usuarios_email_idx ON usuarios(email);
CREATE INDEX usuarios_username_idx ON usuarios(username);
