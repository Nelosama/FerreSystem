-- Solo se ejecuta al crear un clúster vacío. La app no utiliza el superusuario PostgreSQL.
DO $$
BEGIN
  EXECUTE format('CREATE ROLE ferresystem LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD %L',
    btrim(pg_read_file('/run/ferre-secrets/runtime_password')));
END $$;
ALTER DATABASE ferresystem OWNER TO ferresystem;
