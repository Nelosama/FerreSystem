-- NEXUS: cambio aditivo. Nuevo rol de tenant CONTADOR (Contabilidad y Control Tributario).
-- Va en una migración propia: PostgreSQL no permite usar un valor de enum en la misma transacción que lo crea.
-- Ningún usuario existente cambia de rol.
ALTER TYPE "Rol" ADD VALUE IF NOT EXISTS 'CONTADOR';
