-- Complete RLS helpers + policies (runtime ensureRowLevelSecurity mirrors this).
-- Rollback: DROP POLICY on each policy name below; ALTER TABLE ... DISABLE ROW LEVEL SECURITY;
-- session: ENABLE without FORCE so the session store owner keeps access.

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

CREATE OR REPLACE FUNCTION app_auth_email() RETURNS text
LANGUAGE sql STABLE SET search_path = pg_catalog, public
AS $$ SELECT coalesce(nullif(current_setting('app.auth_email', true), ''), '') $$;

CREATE OR REPLACE FUNCTION app_auth_doctor_id() RETURNS text
LANGUAGE sql STABLE SET search_path = pg_catalog, public
AS $$ SELECT coalesce(nullif(current_setting('app.auth_doctor_id', true), ''), '') $$;

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

ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "users" FORCE ROW LEVEL SECURITY;
ALTER TABLE "doctors" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "doctors" FORCE ROW LEVEL SECURITY;
ALTER TABLE "doctor_name_mappings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "doctor_name_mappings" FORCE ROW LEVEL SECURITY;
ALTER TABLE "appointments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "appointments" FORCE ROW LEVEL SECURITY;
ALTER TABLE "attendances" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "attendances" FORCE ROW LEVEL SECURITY;
ALTER TABLE "prescriptions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "prescriptions" FORCE ROW LEVEL SECURITY;
ALTER TABLE "prescription_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "prescription_items" FORCE ROW LEVEL SECURITY;
ALTER TABLE "daily_closures" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "daily_closures" FORCE ROW LEVEL SECURITY;
ALTER TABLE "imports" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "imports" FORCE ROW LEVEL SECURITY;
ALTER TABLE "audit_logs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "audit_logs" FORCE ROW LEVEL SECURITY;
ALTER TABLE "session" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS users_select ON "users";
CREATE POLICY users_select ON "users" FOR SELECT USING (
  app_is_admin()
  OR id = app_user_id()
  OR (
    app_scope() = 'auth'
    AND (
      (app_auth_email() <> '' AND lower(email) = app_auth_email())
      OR (app_auth_doctor_id() <> '' AND "doctorId" IS NOT NULL AND "doctorId" = app_auth_doctor_id())
    )
  )
);
DROP POLICY IF EXISTS users_write ON "users";
CREATE POLICY users_write ON "users" FOR ALL USING (app_is_admin()) WITH CHECK (app_is_admin());

DROP POLICY IF EXISTS doctors_select ON "doctors";
CREATE POLICY doctors_select ON "doctors" FOR SELECT USING (app_is_clinic_wide() OR id = app_doctor_id() OR app_scope() = 'auth');
DROP POLICY IF EXISTS doctors_write ON "doctors";
CREATE POLICY doctors_write ON "doctors" FOR ALL USING (app_is_admin()) WITH CHECK (app_is_admin());

DROP POLICY IF EXISTS mappings_all ON "doctor_name_mappings";
CREATE POLICY mappings_all ON "doctor_name_mappings" FOR ALL USING (app_is_admin()) WITH CHECK (app_is_admin());

DROP POLICY IF EXISTS appointments_select ON "appointments";
CREATE POLICY appointments_select ON "appointments" FOR SELECT USING (app_can_see_doctor("doctorId"));
DROP POLICY IF EXISTS appointments_write ON "appointments";
CREATE POLICY appointments_write ON "appointments" FOR ALL USING (app_is_writer() AND app_can_see_doctor("doctorId")) WITH CHECK (app_is_writer() AND app_can_see_doctor("doctorId"));

DROP POLICY IF EXISTS attendances_select ON "attendances";
CREATE POLICY attendances_select ON "attendances" FOR SELECT USING (app_can_see_doctor("doctorId"));
DROP POLICY IF EXISTS attendances_write ON "attendances";
CREATE POLICY attendances_write ON "attendances" FOR ALL USING (app_is_writer() AND app_can_see_doctor("doctorId")) WITH CHECK (app_is_writer() AND app_can_see_doctor("doctorId"));

DROP POLICY IF EXISTS prescriptions_select ON "prescriptions";
CREATE POLICY prescriptions_select ON "prescriptions" FOR SELECT USING (app_can_see_doctor("doctorId"));
DROP POLICY IF EXISTS prescriptions_write ON "prescriptions";
CREATE POLICY prescriptions_write ON "prescriptions" FOR ALL USING (app_is_writer() AND app_can_see_doctor("doctorId")) WITH CHECK (app_is_writer() AND app_can_see_doctor("doctorId"));

DROP POLICY IF EXISTS prescription_items_select ON "prescription_items";
CREATE POLICY prescription_items_select ON "prescription_items" FOR SELECT USING (
  app_is_admin() OR EXISTS (
    SELECT 1 FROM "prescriptions" p WHERE p.id = "prescriptionId" AND app_can_see_doctor(p."doctorId")
  )
);
DROP POLICY IF EXISTS prescription_items_write ON "prescription_items";
CREATE POLICY prescription_items_write ON "prescription_items" FOR ALL USING (
  app_is_writer() AND EXISTS (
    SELECT 1 FROM "prescriptions" p WHERE p.id = "prescriptionId" AND app_can_see_doctor(p."doctorId")
  )
) WITH CHECK (
  app_is_writer() AND EXISTS (
    SELECT 1 FROM "prescriptions" p WHERE p.id = "prescriptionId" AND app_can_see_doctor(p."doctorId")
  )
);

DROP POLICY IF EXISTS closures_select ON "daily_closures";
CREATE POLICY closures_select ON "daily_closures" FOR SELECT USING (app_can_see_doctor("doctorId"));
DROP POLICY IF EXISTS closures_write ON "daily_closures";
CREATE POLICY closures_write ON "daily_closures" FOR ALL USING (app_is_writer() AND app_can_see_doctor("doctorId")) WITH CHECK (app_is_writer() AND app_can_see_doctor("doctorId"));

DROP POLICY IF EXISTS imports_all ON "imports";
CREATE POLICY imports_all ON "imports" FOR ALL USING (app_is_admin()) WITH CHECK (app_is_admin());

DROP POLICY IF EXISTS audit_select ON "audit_logs";
CREATE POLICY audit_select ON "audit_logs" FOR SELECT USING (
  app_is_admin() OR app_scope() = 'auth' OR (app_user_id() <> '' AND "userId" = app_user_id())
);
DROP POLICY IF EXISTS audit_insert ON "audit_logs";
CREATE POLICY audit_insert ON "audit_logs" FOR INSERT WITH CHECK (
  app_is_admin() OR app_scope() = 'auth' OR (app_user_id() <> '' AND ("userId" IS NULL OR "userId" = app_user_id()))
);

DO $do$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'dermaops_app') THEN
    EXECUTE 'REVOKE ALL ON TABLE "session" FROM dermaops_app';
  END IF;
END
$do$;
