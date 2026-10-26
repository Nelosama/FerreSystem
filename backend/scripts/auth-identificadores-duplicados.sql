-- NEXUS: SOLO LECTURA. Detecta identificadores de inicio de sesión que no resuelven una sola cuenta con el login sin empresa.
-- No modifica nada (BEGIN READ ONLY). Ejecutar con un rol de solo lectura antes de desplegar la consolidación de #200/#201:
--   psql "$URL_SOLO_LECTURA" -v ON_ERROR_STOP=1 -f backend/scripts/auth-identificadores-duplicados.sql
-- La salida contiene identificadores y nombres de empresa: tratarla como dato personal, no publicarla en PR ni chats.
-- Corrección y reversión: docs/AUTH_CONSOLIDACION_20261026.md §5.
BEGIN READ ONLY;

-- 1. Usuario/código repetido entre empresas (el login responde 401 genérico a todas esas cuentas).
SELECT 'USERNAME_REPETIDO' AS hallazgo, lower(trim(u.username)) AS identificador,
       count(*) AS cuentas, count(DISTINCT u.tenant_id) AS empresas,
       string_agg(t.nombre_comercial || ' / ' || u.rol::text || CASE WHEN u.activo THEN '' ELSE ' (inactivo)' END, '; ' ORDER BY t.nombre_comercial) AS detalle
FROM usuarios u JOIN tenants t ON t.id = u.tenant_id
WHERE u.username IS NOT NULL
GROUP BY lower(trim(u.username)) HAVING count(*) > 1
ORDER BY cuentas DESC, identificador;

-- 2. Correo repetido entre empresas.
SELECT 'EMAIL_REPETIDO' AS hallazgo, lower(trim(u.email)) AS identificador,
       count(*) AS cuentas, count(DISTINCT u.tenant_id) AS empresas,
       string_agg(t.nombre_comercial || ' / ' || u.rol::text || CASE WHEN u.activo THEN '' ELSE ' (inactivo)' END, '; ' ORDER BY t.nombre_comercial) AS detalle
FROM usuarios u JOIN tenants t ON t.id = u.tenant_id
WHERE u.email IS NOT NULL
GROUP BY lower(trim(u.email)) HAVING count(*) > 1
ORDER BY cuentas DESC, identificador;

-- 3. Correo de un usuario de negocio igual al de un Super Admin (el Super Admin tiene precedencia: ese usuario no puede entrar).
SELECT 'EMAIL_DE_SUPER_ADMIN' AS hallazgo, lower(trim(u.email)) AS identificador, t.nombre_comercial AS empresa, u.rol::text AS rol
FROM usuarios u JOIN tenants t ON t.id = u.tenant_id
JOIN super_admins s ON lower(trim(s.email)) = lower(trim(u.email))
ORDER BY identificador;

-- 4. Identificadores guardados sin normalizar (mayúsculas o espacios): el login normaliza, así que también colisionan.
SELECT 'SIN_NORMALIZAR' AS hallazgo, t.nombre_comercial AS empresa, u.id AS usuario_id,
       (u.email IS NOT NULL AND u.email <> lower(trim(u.email))) AS email_sin_normalizar,
       (u.username IS NOT NULL AND u.username <> lower(trim(u.username))) AS username_sin_normalizar
FROM usuarios u JOIN tenants t ON t.id = u.tenant_id
WHERE (u.email IS NOT NULL AND u.email <> lower(trim(u.email))) OR (u.username IS NOT NULL AND u.username <> lower(trim(u.username)));

-- 5. Resumen: si las tres primeras consultas devuelven cero filas, un índice único global sería aplicable (ver §5 del documento).
SELECT
  (SELECT count(*) FROM (SELECT 1 FROM usuarios WHERE username IS NOT NULL GROUP BY lower(trim(username)) HAVING count(*) > 1) x) AS usernames_repetidos,
  (SELECT count(*) FROM (SELECT 1 FROM usuarios WHERE email IS NOT NULL GROUP BY lower(trim(email)) HAVING count(*) > 1) x) AS emails_repetidos,
  (SELECT count(*) FROM usuarios u JOIN super_admins s ON lower(trim(s.email)) = lower(trim(u.email))) AS emails_de_super_admin,
  (SELECT count(*) FROM usuarios WHERE bloqueado_at IS NOT NULL) AS cuentas_bloqueadas;

ROLLBACK;
