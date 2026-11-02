-- RLS is also applied at runtime in server/rls.ts so published DBs get the same policies.

CREATE OR REPLACE FUNCTION app_role() RETURNS text
LANGUAGE sql STABLE SET search_path = pg_catalog, public
AS $$ SELECT coalesce(nullif(current_setting('app.role', true), ''), '') $$;

CREATE OR REPLACE FUNCTION app_doctor_id() RETURNS text
LANGUAGE sql STABLE SET search_path = pg_catalog, public
AS $$ SELECT coalesce(nullif(current_setting('app.doctor_id', true), ''), '') $$;

CREATE OR REPLACE FUNCTION app_user_id() RETURNS text
LANGUAGE sql STABLE SET search_path = pg_catalog, public
AS $$ SELECT coalesce(nullif(current_setting('app.user_id', true), ''), '') $$;

CREATE OR REPLACE FUNCTION app_scope() RETURNS text
LANGUAGE sql STABLE SET search_path = pg_catalog, public
AS $$ SELECT coalesce(nullif(current_setting('app.scope', true), ''), '') $$;

CREATE OR REPLACE FUNCTION app_is_admin() RETURNS boolean
LANGUAGE sql STABLE SET search_path = pg_catalog, public
AS $$ SELECT app_role() = 'ADMIN' $$;

CREATE OR REPLACE FUNCTION app_is_clinic_wide() RETURNS boolean
LANGUAGE sql STABLE SET search_path = pg_catalog, public
AS $$ SELECT app_role() IN ('ADMIN', 'RECEPTION', 'SUPERVISOR', 'ACCOUNTING') $$;

CREATE OR REPLACE FUNCTION app_is_writer() RETURNS boolean
LANGUAGE sql STABLE SET search_path = pg_catalog, public
AS $$ SELECT app_role() IN ('ADMIN', 'DOCTOR') $$;

CREATE OR REPLACE FUNCTION app_can_see_doctor(doctor_id text) RETURNS boolean
LANGUAGE sql STABLE SET search_path = pg_catalog, public
AS $$
  SELECT app_is_clinic_wide()
      OR (app_role() = 'DOCTOR' AND doctor_id IS NOT NULL AND doctor_id = app_doctor_id() AND app_doctor_id() <> '')
$$;
