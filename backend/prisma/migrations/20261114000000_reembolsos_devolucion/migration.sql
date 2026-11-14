-- NEXUS — reembolsos con estado y condición del producto devuelto (decisión del dueño del 2026-11-12).
-- Solo aditiva: una columna nula, dos tipos y una tabla nuevos. No rellena ni modifica filas existentes: las devoluciones
-- anteriores no tienen reembolso registrado aquí y conservan su dato histórico en devoluciones.reembolso/metodo.

ALTER TABLE "detalles_devolucion" ADD COLUMN "condicion" TEXT;

CREATE TYPE "MetodoReembolso" AS ENUM ('EFECTIVO', 'TARJETA', 'TRANSFERENCIA');
CREATE TYPE "EstadoReembolso" AS ENUM ('PENDIENTE', 'COMPLETADO', 'SUSTITUIDO');

CREATE TABLE "reembolsos" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "devolucion_id" TEXT NOT NULL,
    "metodo" "MetodoReembolso" NOT NULL,
    "estado" "EstadoReembolso" NOT NULL DEFAULT 'PENDIENTE',
    "monto" DECIMAL(12,2) NOT NULL,
    "referencia" TEXT,
    "evidencia" TEXT,
    "nota" TEXT,
    "intentos_fallidos" INTEGER NOT NULL DEFAULT 0,
    "caja_id" TEXT,
    "reemplaza_a_id" TEXT,
    "registrado_por" TEXT NOT NULL,
    "registrado_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completado_por" TEXT,
    "completado_at" TIMESTAMPTZ,
    "actualizado_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reembolsos_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "reembolsos_monto_chk" CHECK ("monto" > 0),
    CONSTRAINT "reembolsos_intentos_chk" CHECK ("intentos_fallidos" >= 0),
    -- Completado siempre dice quién y cuándo; un reverso de tarjeta o una transferencia completados llevan referencia bancaria.
    CONSTRAINT "reembolsos_completado_chk" CHECK (
      ("estado" = 'COMPLETADO' AND "completado_por" IS NOT NULL AND "completado_at" IS NOT NULL
        AND ("metodo" = 'EFECTIVO' OR ("referencia" IS NOT NULL AND btrim("referencia") <> '')))
      OR ("estado" <> 'COMPLETADO' AND "completado_por" IS NULL AND "completado_at" IS NULL)
    )
);

CREATE UNIQUE INDEX "reembolsos_reemplaza_a_id_key" ON "reembolsos"("reemplaza_a_id");
CREATE INDEX "reembolsos_tenant_estado_idx" ON "reembolsos"("tenant_id", "estado", "registrado_at");
CREATE INDEX "reembolsos_devolucion_idx" ON "reembolsos"("devolucion_id");
-- Un solo reembolso vigente (no sustituido) por devolución.
CREATE UNIQUE INDEX "reembolsos_vigente_key" ON "reembolsos"("devolucion_id") WHERE "estado" <> 'SUSTITUIDO';

ALTER TABLE "reembolsos" ADD CONSTRAINT "reembolsos_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "reembolsos" ADD CONSTRAINT "reembolsos_devolucion_id_fkey" FOREIGN KEY ("devolucion_id") REFERENCES "devoluciones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- FK simples a usuarios(id) (ver 20261113000000: una FK compuesta rompe la reversión manual de #148). La empresa la exige el servicio.
ALTER TABLE "reembolsos" ADD CONSTRAINT "reembolsos_registrado_por_fkey" FOREIGN KEY ("registrado_por") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "reembolsos" ADD CONSTRAINT "reembolsos_completado_por_fkey" FOREIGN KEY ("completado_por") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "reembolsos" ADD CONSTRAINT "reembolsos_reemplaza_a_id_fkey" FOREIGN KEY ("reemplaza_a_id") REFERENCES "reembolsos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
