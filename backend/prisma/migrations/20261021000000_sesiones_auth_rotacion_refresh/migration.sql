-- NEXUS: cambio aditivo para la rotación de refresh tokens (H-04). Columnas nulas sin valor por defecto:
-- no reescribe filas, no altera datos existentes y el código anterior las ignora.
-- refresh_jti: identificador del refresh token vigente de la sesión.
-- refresh_jti_anterior: el inmediatamente anterior, aceptado solo durante la ventana de gracia tras rotar.
-- refresh_rotado_at: momento de la última rotación.
ALTER TABLE "sesiones_auth"
  ADD COLUMN "refresh_jti" TEXT,
  ADD COLUMN "refresh_jti_anterior" TEXT,
  ADD COLUMN "refresh_rotado_at" TIMESTAMPTZ;
