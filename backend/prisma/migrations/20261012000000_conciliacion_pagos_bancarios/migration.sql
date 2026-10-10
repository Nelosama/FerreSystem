-- Control de pagos con tarjeta y transferencia (aditiva: solo crea tablas nuevas).
-- No modifica ventas, pagos_cuenta, cajas, movimientos_caja ni cierres históricos.
--
-- aprobaciones_bancarias: referencia/autorización que el cajero registra tras la aprobación del POS físico.
--   Unicidad por empresa, terminal y referencia: una misma autorización no cobra dos veces.
-- conciliaciones_bancarias: total que muestra el cierre del POS bancario por terminal y día,
--   comparado con las aprobaciones registradas. Una por terminal y día.

CREATE TABLE "aprobaciones_bancarias" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "metodo" TEXT NOT NULL,
    "terminal" TEXT NOT NULL DEFAULT '',
    "referencia" TEXT NOT NULL,
    "monto" DECIMAL(12,2) NOT NULL,
    "origen" TEXT NOT NULL,
    "origen_id" TEXT NOT NULL,
    "usuario_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "aprobaciones_bancarias_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "aprobaciones_bancarias_metodo_check" CHECK ("metodo" IN ('TARJETA', 'TRANSFERENCIA')),
    CONSTRAINT "aprobaciones_bancarias_origen_check" CHECK ("origen" IN ('VENTA', 'ABONO')),
    CONSTRAINT "aprobaciones_bancarias_terminal_check" CHECK (
        ("metodo" = 'TARJETA' AND char_length("terminal") BETWEEN 1 AND 40)
        OR ("metodo" = 'TRANSFERENCIA' AND "terminal" = '')),
    CONSTRAINT "aprobaciones_bancarias_referencia_check" CHECK (char_length("referencia") BETWEEN 3 AND 40),
    CONSTRAINT "aprobaciones_bancarias_monto_check" CHECK ("monto" > 0),
    CONSTRAINT "aprobaciones_bancarias_tenant_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "aprobaciones_bancarias_usuario_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "aprobaciones_bancarias_tenant_metodo_terminal_referencia_key"
    ON "aprobaciones_bancarias"("tenant_id", "metodo", "terminal", "referencia");
CREATE INDEX "aprobaciones_bancarias_tenant_terminal_created_idx"
    ON "aprobaciones_bancarias"("tenant_id", "terminal", "created_at");
CREATE INDEX "aprobaciones_bancarias_origen_idx" ON "aprobaciones_bancarias"("tenant_id", "origen", "origen_id");

CREATE TABLE "conciliaciones_bancarias" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "terminal" TEXT NOT NULL,
    "fecha" DATE NOT NULL,
    "total_banco" DECIMAL(12,2) NOT NULL,
    "cantidad_banco" INTEGER NOT NULL,
    "total_sistema" DECIMAL(12,2) NOT NULL,
    "cantidad_sistema" INTEGER NOT NULL,
    "diferencia" DECIMAL(12,2) NOT NULL,
    "motivo" TEXT,
    "solicitud_id" TEXT NOT NULL,
    "usuario_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conciliaciones_bancarias_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "conciliaciones_bancarias_terminal_check" CHECK (char_length("terminal") BETWEEN 1 AND 40),
    CONSTRAINT "conciliaciones_bancarias_banco_check" CHECK ("total_banco" >= 0 AND "cantidad_banco" >= 0),
    CONSTRAINT "conciliaciones_bancarias_sistema_check" CHECK ("total_sistema" >= 0 AND "cantidad_sistema" >= 0),
    CONSTRAINT "conciliaciones_bancarias_diferencia_check" CHECK ("diferencia" = "total_banco" - "total_sistema"),
    CONSTRAINT "conciliaciones_bancarias_motivo_check" CHECK ("diferencia" = 0 OR char_length(btrim(COALESCE("motivo", ''))) >= 10),
    CONSTRAINT "conciliaciones_bancarias_tenant_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "conciliaciones_bancarias_usuario_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- Una conciliación por terminal y día; una solicitud no se registra dos veces.
CREATE UNIQUE INDEX "conciliaciones_bancarias_tenant_terminal_fecha_key" ON "conciliaciones_bancarias"("tenant_id", "terminal", "fecha");
CREATE UNIQUE INDEX "conciliaciones_bancarias_tenant_solicitud_key" ON "conciliaciones_bancarias"("tenant_id", "solicitud_id");
CREATE INDEX "conciliaciones_bancarias_tenant_fecha_idx" ON "conciliaciones_bancarias"("tenant_id", "fecha");
