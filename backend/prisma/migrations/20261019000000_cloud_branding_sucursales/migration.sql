-- NEXUS: cambio aditivo. Sin reasignar datos existentes ni alterar reglas comerciales.
CREATE TABLE "logotipo_objetos" (
  "clave" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "datos" BYTEA NOT NULL,
  CONSTRAINT "logotipo_objetos_pkey" PRIMARY KEY ("clave"),
  CONSTRAINT "logotipo_objetos_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "logotipo_objetos_bytes_check" CHECK (octet_length("datos") BETWEEN 1 AND 2097152),
  CONSTRAINT "logotipo_objetos_tenant_key_check" CHECK ("clave" LIKE 'tenants/' || "tenant_id" || '/logo/%')
);
CREATE INDEX "logotipo_objetos_tenant_id_idx" ON "logotipo_objetos"("tenant_id");
CREATE TABLE "sucursales" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "nombre" TEXT NOT NULL,
  "direccion" TEXT NOT NULL DEFAULT '',
  "telefono" TEXT NOT NULL DEFAULT '',
  "activa" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "sucursales_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "sucursales_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "sucursales_nombre_check" CHECK (length(trim("nombre")) BETWEEN 1 AND 100)
);
CREATE UNIQUE INDEX "sucursales_tenant_id_nombre_key" ON "sucursales"("tenant_id", "nombre");

-- Los clientes Supabase anon/authenticated no acceden por PostgREST. Solo el backend propietario
-- (o rol BYPASSRLS) tras autorización HTTP accede a estas tablas privadas.
ALTER TABLE "logotipo_objetos" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "sucursales" ENABLE ROW LEVEL SECURITY;
