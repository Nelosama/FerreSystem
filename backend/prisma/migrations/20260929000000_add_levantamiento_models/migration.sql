-- CreateEnum
CREATE TYPE "EstadoLevantamiento" AS ENUM ('BORRADOR', 'EN_PROGRESO', 'REVISION', 'FINALIZADO');

-- CreateTable
CREATE TABLE "levantamientos" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "estado" "EstadoLevantamiento" NOT NULL DEFAULT 'BORRADOR',
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "levantamientos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "levantamiento_items" (
    "id" TEXT NOT NULL,
    "levantamiento_id" TEXT NOT NULL,
    "descripcion" TEXT NOT NULL,
    "cantidad" DECIMAL(12,2) NOT NULL,
    "unidad" TEXT NOT NULL DEFAULT 'unidad',
    "codigo" TEXT,
    "marca" TEXT,
    "categoria" TEXT,
    "notas" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "levantamiento_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "levantamientos_tenant_id_idx" ON "levantamientos"("tenant_id");

-- CreateIndex
CREATE INDEX "levantamientos_tenant_id_estado_idx" ON "levantamientos"("tenant_id", "estado");

-- CreateIndex
CREATE INDEX "levantamientos_tenant_id_created_at_idx" ON "levantamientos"("tenant_id", "created_at");

-- CreateIndex
CREATE INDEX "levantamiento_items_levantamiento_id_idx" ON "levantamiento_items"("levantamiento_id");

-- AddForeignKey
ALTER TABLE "levantamientos" ADD CONSTRAINT "levantamientos_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "levantamiento_items" ADD CONSTRAINT "levantamiento_items_levantamiento_id_fkey" FOREIGN KEY ("levantamiento_id") REFERENCES "levantamientos"("id") ON DELETE CASCADE ON UPDATE CASCADE;
