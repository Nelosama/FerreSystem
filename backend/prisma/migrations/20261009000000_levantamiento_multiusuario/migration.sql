-- Migration: Levantamiento multiusuario
-- Adds: contadorId, conflicto to levantamiento_items
-- Creates: levantamiento_sesiones table

-- 1. Add contadorId and conflicto to levantamiento_items
ALTER TABLE "levantamiento_items"
  ADD COLUMN IF NOT EXISTS "contador_id" TEXT,
  ADD COLUMN IF NOT EXISTS "conflicto" BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS "levantamiento_items_levantamiento_id_conflicto_idx"
  ON "levantamiento_items"("levantamiento_id", "conflicto");

-- 2. Create levantamiento_sesiones (heartbeat table for active users)
CREATE TABLE IF NOT EXISTS "levantamiento_sesiones" (
  "id"               TEXT NOT NULL,
  "tenant_id"        TEXT NOT NULL,
  "levantamiento_id" TEXT NOT NULL,
  "usuario_id"       TEXT NOT NULL,
  "nombre_usuario"   TEXT NOT NULL,
  "ultimo_heartbeat" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_at"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "levantamiento_sesiones_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "levantamiento_sesiones_levantamiento_id_usuario_id_key"
    UNIQUE ("levantamiento_id", "usuario_id"),
  CONSTRAINT "levantamiento_sesiones_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "levantamiento_sesiones_levantamiento_id_idx"
  ON "levantamiento_sesiones"("levantamiento_id");

CREATE INDEX IF NOT EXISTS "levantamiento_sesiones_tenant_id_idx"
  ON "levantamiento_sesiones"("tenant_id");
