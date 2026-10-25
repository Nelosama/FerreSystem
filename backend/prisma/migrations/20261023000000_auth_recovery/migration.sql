-- NEXUS: preserves all existing identities, hashes and sessions. No seed or credential rewrite.
ALTER TABLE super_admins ADD COLUMN email_verified_at TIMESTAMPTZ,
  ADD COLUMN mfa_secret TEXT, ADD COLUMN mfa_last_step INTEGER;
ALTER TABLE usuarios ALTER COLUMN email DROP NOT NULL;
ALTER TABLE usuarios ADD COLUMN username TEXT, ADD COLUMN email_verified_at TIMESTAMPTZ,
  ADD COLUMN mfa_secret TEXT, ADD COLUMN mfa_last_step INTEGER;
CREATE UNIQUE INDEX usuarios_tenant_id_username_key ON usuarios(tenant_id, username);
ALTER TABLE usuarios ADD CONSTRAINT usuarios_login_identifier CHECK (email IS NOT NULL OR username IS NOT NULL);
ALTER TABLE sesiones_auth ADD COLUMN credential_binding TEXT,
  ADD COLUMN last_activity_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE usuarios ADD CONSTRAINT usuarios_username_format CHECK
  (username IS NULL OR (username = lower(username) AND username ~ '^[a-z0-9][a-z0-9._-]{2,63}$'));
CREATE TABLE auth_actions (
  hash TEXT PRIMARY KEY, sujeto_id TEXT NOT NULL, tipo TEXT NOT NULL,
  tenant_id TEXT, purpose TEXT NOT NULL, email TEXT, password_binding TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT auth_actions_scope CHECK ((tipo = 'SUPER_ADMIN' AND tenant_id IS NULL) OR (tipo = 'TENANT' AND tenant_id IS NOT NULL))
);
CREATE INDEX auth_actions_sujeto_id_idx ON auth_actions(sujeto_id);
CREATE INDEX auth_actions_expires_at_idx ON auth_actions(expires_at);
CREATE TABLE auth_recovery_codes (
  hash TEXT PRIMARY KEY, sujeto_id TEXT NOT NULL, tipo TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX auth_recovery_codes_sujeto_id_idx ON auth_recovery_codes(sujeto_id);
CREATE TABLE auth_events (
  id TEXT PRIMARY KEY, actor_id TEXT NOT NULL, sujeto_id TEXT NOT NULL,
  tenant_id TEXT, event TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX auth_events_tenant_id_created_at_idx ON auth_events(tenant_id, created_at);
