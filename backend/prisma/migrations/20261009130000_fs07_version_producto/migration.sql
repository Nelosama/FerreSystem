-- FS-07: versión de producto para detectar ediciones concurrentes sin sobrescribir cambios ajenos.
-- Columna con valor por defecto: las filas existentes quedan en versión 1. No modifica existencias ni precios.

ALTER TABLE "productos" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
