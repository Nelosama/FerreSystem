-- Autenticación fase 3: limitación de intentos de inicio de sesión y sesiones revocables.
-- ADITIVA: crea dos tablas nuevas. No modifica filas, usuarios, ventas, cajas ni inventario.
-- Fechas en TIMESTAMPTZ para comparar contra now() del servidor sin depender de la zona de la sesión.
-- Reversión manual: DROP TABLE sesiones_auth; DROP TABLE intentos_login; (se pierden sesiones y contadores; los usuarios vuelven a iniciar sesión).

CREATE TABLE "intentos_login" (
    "clave" TEXT NOT NULL,
    "fallos" INTEGER NOT NULL DEFAULT 0,
    "ventana_inicio" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "bloqueado_hasta" TIMESTAMPTZ,
    "actualizado_at" TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT "intentos_login_pkey" PRIMARY KEY ("clave")
);

CREATE INDEX "intentos_login_actualizado_at_idx" ON "intentos_login"("actualizado_at");

CREATE TABLE "sesiones_auth" (
    "id" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "sujeto_id" TEXT NOT NULL,
    "tenant_id" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "expires_at" TIMESTAMPTZ NOT NULL,
    "revoked_at" TIMESTAMPTZ,
    "revocation_motivo" TEXT,

    CONSTRAINT "sesiones_auth_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "sesiones_auth_tipo_check" CHECK ("tipo" IN ('TENANT', 'SOPORTE', 'SUPER_ADMIN'))
);

CREATE INDEX "sesiones_auth_sujeto_id_idx" ON "sesiones_auth"("sujeto_id");
CREATE INDEX "sesiones_auth_expires_at_idx" ON "sesiones_auth"("expires_at");
