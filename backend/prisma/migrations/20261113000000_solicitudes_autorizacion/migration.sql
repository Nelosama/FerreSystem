-- NEXUS — solicitudes de autorización (decisión del dueño del 2026-11-12: todo descuento de una cotización lo autoriza un ADMIN).
-- Solo aditiva: dos tipos y una tabla nuevos. No modifica ni rellena tablas existentes.
-- `solicitudes_devolucion` no se toca en esta etapa.

CREATE TYPE "TipoSolicitudAutorizacion" AS ENUM ('DESCUENTO_COTIZACION');
CREATE TYPE "EstadoSolicitudAutorizacion" AS ENUM ('PENDIENTE', 'APROBADA', 'RECHAZADA', 'CANCELADA', 'INVALIDADA');

CREATE TABLE "solicitudes_autorizacion" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "tipo" "TipoSolicitudAutorizacion" NOT NULL,
    "estado" "EstadoSolicitudAutorizacion" NOT NULL DEFAULT 'PENDIENTE',
    "entidad_id" TEXT NOT NULL,
    "operacion_hash" TEXT NOT NULL,
    "resumen" JSONB NOT NULL DEFAULT '{}',
    "solicitante_id" TEXT NOT NULL,
    "solicitada_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decisor_id" TEXT,
    "decidida_at" TIMESTAMPTZ,
    "motivo_decision" TEXT,

    CONSTRAINT "solicitudes_autorizacion_pkey" PRIMARY KEY ("id"),
    -- Una solicitud pendiente no tiene decisión; una resuelta siempre dice quién y cuándo.
    CONSTRAINT "solicitudes_autorizacion_decision_chk" CHECK (
      ("estado" = 'PENDIENTE' AND "decisor_id" IS NULL AND "decidida_at" IS NULL)
      OR ("estado" <> 'PENDIENTE' AND "decisor_id" IS NOT NULL AND "decidida_at" IS NOT NULL)
    )
);

CREATE INDEX "solicitudes_autorizacion_tenant_estado_idx" ON "solicitudes_autorizacion"("tenant_id", "estado", "solicitada_at");
CREATE INDEX "solicitudes_autorizacion_entidad_idx" ON "solicitudes_autorizacion"("tenant_id", "tipo", "entidad_id");
-- Una sola solicitud pendiente por entidad: dos solicitudes simultáneas no pueden coexistir.
CREATE UNIQUE INDEX "solicitudes_autorizacion_pendiente_key" ON "solicitudes_autorizacion"("tenant_id", "tipo", "entidad_id") WHERE "estado" = 'PENDIENTE';

ALTER TABLE "solicitudes_autorizacion" ADD CONSTRAINT "solicitudes_autorizacion_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- FK simples a usuarios(id). No se usa una FK compuesta (tenant_id, id) porque dependería de usuarios_tenant_id_id_key,
-- que la reversión manual de #148 elimina. Que solicitante y decisor sean de la misma empresa lo exige el servicio
-- (lee al usuario con filtro de empresa dentro de la misma transacción).
ALTER TABLE "solicitudes_autorizacion" ADD CONSTRAINT "solicitudes_autorizacion_solicitante_fkey" FOREIGN KEY ("solicitante_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "solicitudes_autorizacion" ADD CONSTRAINT "solicitudes_autorizacion_decisor_fkey" FOREIGN KEY ("decisor_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
