CREATE TABLE "solicitudes_devolucion" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "tenant_id" TEXT NOT NULL,
  "venta_id" TEXT NOT NULL,
  "solicitante_id" TEXT NOT NULL,
  "solicitud_hash" TEXT NOT NULL,
  "comando" JSONB NOT NULL,
  "monto_estimado" DECIMAL(12,2) NOT NULL,
  "estado" TEXT NOT NULL DEFAULT 'PENDIENTE',
  "administrador_id" TEXT,
  "motivo_decision" TEXT,
  "decidida_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "solicitudes_devolucion_estado_check" CHECK (estado IN ('PENDIENTE','AUTORIZADA','RECHAZADA','EJECUTADA')),
  CONSTRAINT "solicitudes_devolucion_decision_check" CHECK (
    (estado = 'PENDIENTE' AND administrador_id IS NULL AND decidida_at IS NULL) OR
    (estado <> 'PENDIENTE' AND administrador_id IS NOT NULL AND decidida_at IS NOT NULL)
  )
);
CREATE INDEX "solicitudes_devolucion_tenant_id_estado_created_at_idx" ON "solicitudes_devolucion" ("tenant_id", "estado", "created_at");
CREATE INDEX "solicitudes_devolucion_tenant_id_solicitante_id_idx" ON "solicitudes_devolucion" ("tenant_id", "solicitante_id");
