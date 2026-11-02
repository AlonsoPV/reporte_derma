import { AsyncLocalStorage } from 'node:async_hooks';
import { createHmac } from 'node:crypto';
import { PrismaClient } from '@prisma/client';

export type RlsContext = {
  role: string;
  doctorId: string;
  userId: string;
  scope: string;
  inTx?: boolean;
};

const rlsStore = new AsyncLocalStorage<RlsContext>();

export function rlsContext(): RlsContext | undefined {
  return rlsStore.getStore();
}

function emptyContext(): RlsContext {
  return { role: '', doctorId: '', userId: '', scope: '' };
}

export function enterRlsContext(ctx: RlsContext) {
  rlsStore.enterWith(ctx);
}

export async function runWithRls<T>(ctx: RlsContext, fn: () => T | Promise<T>): Promise<T> {
  const previous = rlsStore.getStore();
  rlsStore.enterWith(ctx);
  try {
    return await fn();
  } finally {
    rlsStore.enterWith(previous ?? emptyContext());
  }
}

export function runAsAdmin<T>(fn: () => T | Promise<T>): Promise<T> {
  return runWithRls({ role: 'ADMIN', doctorId: '', userId: 'system', scope: 'app' }, fn);
}

export function runWithAuthScope<T>(fn: () => T | Promise<T>): Promise<T> {
  return runWithRls({ role: '', doctorId: '', userId: '', scope: 'auth' }, fn);
}

export function rlsContextFromUser(user?: { id: string; role: string; doctorId?: string | null } | null): RlsContext {
  if (!user) return { role: '', doctorId: '', userId: '', scope: '' };
  return {
    role: user.role,
    doctorId: user.doctorId ?? '',
    userId: user.id,
    scope: 'app',
  };
}

let rlsGate = Promise.resolve();

function rlsQueue<T>(job: () => Promise<T>) {
  const run = rlsGate.then(job, job);
  rlsGate = run.then(() => undefined, () => undefined);
  return run;
}

async function applyRlsConfig(
  executor: { $executeRaw: PrismaClient['$executeRaw'] },
  ctx: RlsContext,
  local = true,
) {
  if (local) {
    await executor.$executeRaw`
      SELECT
        set_config('app.role', ${ctx.role}, true),
        set_config('app.doctor_id', ${ctx.doctorId}, true),
        set_config('app.user_id', ${ctx.userId}, true),
        set_config('app.scope', ${ctx.scope}, true)
    `;
    return;
  }
  await executor.$executeRaw`
    SELECT
      set_config('app.role', ${ctx.role}, false),
      set_config('app.doctor_id', ${ctx.doctorId}, false),
      set_config('app.user_id', ${ctx.userId}, false),
      set_config('app.scope', ${ctx.scope}, false)
  `;
}

export function withRlsExtension(client: PrismaClient) {
  return client.$extends({
    query: {
      async $allOperations({ args, query, operation }) {
        if (String(operation).includes('Raw')) return query(args);
        const ctx = rlsStore.getStore() ?? emptyContext();
        if (ctx.inTx) return query(args);
        const [, result] = await client.$transaction([
          client.$executeRaw`
            SELECT
              set_config('app.role', ${ctx.role}, true),
              set_config('app.doctor_id', ${ctx.doctorId}, true),
              set_config('app.user_id', ${ctx.userId}, true),
              set_config('app.scope', ${ctx.scope}, true)
          `,
          query(args),
        ]);
        return result;
      },
    },
  });
}

export async function withRlsTransaction<T>(
  database: { $transaction: (fn: (tx: any) => Promise<T>) => Promise<T> },
  fn: (tx: any) => Promise<T>,
) {
  const ctx = rlsStore.getStore();
  const run = () => database.$transaction(async (tx) => {
    if (ctx && typeof tx.$executeRaw === 'function') {
      await applyRlsConfig(tx, ctx, true);
      ctx.inTx = true;
    }
    try {
      return await fn(tx);
    } finally {
      if (ctx) ctx.inTx = false;
    }
  });
  return ctx?.inTx ? run() : rlsQueue(run);
}

function sqlLiteral(value: string) {
  return `'${value.replace(/'/g, "''")}'`;
}

export function appRolePassword() {
  const explicit = process.env.RLS_DB_PASSWORD?.trim();
  if (explicit) return explicit;
  const secret = process.env.SESSION_SECRET || 'dev-secret-change-me';
  return createHmac('sha256', secret).update('dermaops-app-role').digest('hex').slice(0, 32);
}

export function appDatabaseUrl(adminUrl: string, password: string) {
  const parsed = new URL(adminUrl);
  parsed.username = 'dermaops_app';
  parsed.password = password;
  return parsed.toString();
}

const RLS_FUNCTIONS = [
  `CREATE OR REPLACE FUNCTION app_role() RETURNS text
LANGUAGE sql STABLE SET search_path = pg_catalog, public
AS $$ SELECT coalesce(nullif(current_setting('app.role', true), ''), '') $$`,
  `CREATE OR REPLACE FUNCTION app_doctor_id() RETURNS text
LANGUAGE sql STABLE SET search_path = pg_catalog, public
AS $$ SELECT coalesce(nullif(current_setting('app.doctor_id', true), ''), '') $$`,
  `CREATE OR REPLACE FUNCTION app_user_id() RETURNS text
LANGUAGE sql STABLE SET search_path = pg_catalog, public
AS $$ SELECT coalesce(nullif(current_setting('app.user_id', true), ''), '') $$`,
  `CREATE OR REPLACE FUNCTION app_scope() RETURNS text
LANGUAGE sql STABLE SET search_path = pg_catalog, public
AS $$ SELECT coalesce(nullif(current_setting('app.scope', true), ''), '') $$`,
  `CREATE OR REPLACE FUNCTION app_is_admin() RETURNS boolean
LANGUAGE sql STABLE SET search_path = pg_catalog, public
AS $$ SELECT app_role() = 'ADMIN' $$`,
  `CREATE OR REPLACE FUNCTION app_is_clinic_wide() RETURNS boolean
LANGUAGE sql STABLE SET search_path = pg_catalog, public
AS $$ SELECT app_role() IN ('ADMIN', 'RECEPTION', 'SUPERVISOR', 'ACCOUNTING') $$`,
  `CREATE OR REPLACE FUNCTION app_is_writer() RETURNS boolean
LANGUAGE sql STABLE SET search_path = pg_catalog, public
AS $$ SELECT app_role() IN ('ADMIN', 'DOCTOR') $$`,
  `CREATE OR REPLACE FUNCTION app_can_see_doctor(doctor_id text) RETURNS boolean
LANGUAGE sql STABLE SET search_path = pg_catalog, public
AS $$
  SELECT app_is_clinic_wide()
      OR (app_role() = 'DOCTOR' AND doctor_id IS NOT NULL AND doctor_id = app_doctor_id() AND app_doctor_id() <> '')
$$`,
];

const POLICY_TABLES = [
  'users',
  'doctors',
  'doctor_name_mappings',
  'appointments',
  'attendances',
  'prescriptions',
  'prescription_items',
  'daily_closures',
  'imports',
  'audit_logs',
] as const;

function policyStatements() {
  const statements: string[] = [];
  for (const table of POLICY_TABLES) {
    statements.push(`ALTER TABLE "${table}" ENABLE ROW LEVEL SECURITY`);
    statements.push(`ALTER TABLE "${table}" FORCE ROW LEVEL SECURITY`);
  }
  statements.push(
    'DROP POLICY IF EXISTS users_select ON "users"',
    `CREATE POLICY users_select ON "users" FOR SELECT USING (app_is_admin() OR id = app_user_id() OR app_scope() = 'auth')`,
    'DROP POLICY IF EXISTS users_write ON "users"',
    'CREATE POLICY users_write ON "users" FOR ALL USING (app_is_admin()) WITH CHECK (app_is_admin())',
    'DROP POLICY IF EXISTS doctors_select ON "doctors"',
    `CREATE POLICY doctors_select ON "doctors" FOR SELECT USING (app_is_clinic_wide() OR id = app_doctor_id() OR app_scope() = 'auth')`,
    'DROP POLICY IF EXISTS doctors_write ON "doctors"',
    'CREATE POLICY doctors_write ON "doctors" FOR ALL USING (app_is_admin()) WITH CHECK (app_is_admin())',
    'DROP POLICY IF EXISTS mappings_all ON "doctor_name_mappings"',
    'CREATE POLICY mappings_all ON "doctor_name_mappings" FOR ALL USING (app_is_admin()) WITH CHECK (app_is_admin())',
    'DROP POLICY IF EXISTS appointments_select ON "appointments"',
    'CREATE POLICY appointments_select ON "appointments" FOR SELECT USING (app_can_see_doctor("doctorId"))',
    'DROP POLICY IF EXISTS appointments_write ON "appointments"',
    'CREATE POLICY appointments_write ON "appointments" FOR ALL USING (app_is_writer() AND app_can_see_doctor("doctorId")) WITH CHECK (app_is_writer() AND app_can_see_doctor("doctorId"))',
    'DROP POLICY IF EXISTS attendances_select ON "attendances"',
    'CREATE POLICY attendances_select ON "attendances" FOR SELECT USING (app_can_see_doctor("doctorId"))',
    'DROP POLICY IF EXISTS attendances_write ON "attendances"',
    'CREATE POLICY attendances_write ON "attendances" FOR ALL USING (app_is_writer() AND app_can_see_doctor("doctorId")) WITH CHECK (app_is_writer() AND app_can_see_doctor("doctorId"))',
    'DROP POLICY IF EXISTS prescriptions_select ON "prescriptions"',
    'CREATE POLICY prescriptions_select ON "prescriptions" FOR SELECT USING (app_can_see_doctor("doctorId"))',
    'DROP POLICY IF EXISTS prescriptions_write ON "prescriptions"',
    'CREATE POLICY prescriptions_write ON "prescriptions" FOR ALL USING (app_is_writer() AND app_can_see_doctor("doctorId")) WITH CHECK (app_is_writer() AND app_can_see_doctor("doctorId"))',
    'DROP POLICY IF EXISTS prescription_items_select ON "prescription_items"',
    `CREATE POLICY prescription_items_select ON "prescription_items" FOR SELECT USING (app_is_admin() OR EXISTS (SELECT 1 FROM "prescriptions" p WHERE p.id = "prescriptionId" AND app_can_see_doctor(p."doctorId")))`,
    'DROP POLICY IF EXISTS prescription_items_write ON "prescription_items"',
    `CREATE POLICY prescription_items_write ON "prescription_items" FOR ALL USING (app_is_writer() AND EXISTS (SELECT 1 FROM "prescriptions" p WHERE p.id = "prescriptionId" AND app_can_see_doctor(p."doctorId"))) WITH CHECK (app_is_writer() AND EXISTS (SELECT 1 FROM "prescriptions" p WHERE p.id = "prescriptionId" AND app_can_see_doctor(p."doctorId")))`,
    'DROP POLICY IF EXISTS closures_select ON "daily_closures"',
    'CREATE POLICY closures_select ON "daily_closures" FOR SELECT USING (app_can_see_doctor("doctorId"))',
    'DROP POLICY IF EXISTS closures_write ON "daily_closures"',
    'CREATE POLICY closures_write ON "daily_closures" FOR ALL USING (app_is_writer() AND app_can_see_doctor("doctorId")) WITH CHECK (app_is_writer() AND app_can_see_doctor("doctorId"))',
    'DROP POLICY IF EXISTS imports_all ON "imports"',
    'CREATE POLICY imports_all ON "imports" FOR ALL USING (app_is_admin()) WITH CHECK (app_is_admin())',
    'DROP POLICY IF EXISTS audit_select ON "audit_logs"',
    `CREATE POLICY audit_select ON "audit_logs" FOR SELECT USING (app_is_admin() OR app_scope() = 'auth' OR (app_user_id() <> '' AND "userId" = app_user_id()))`,
    'DROP POLICY IF EXISTS audit_insert ON "audit_logs"',
    `CREATE POLICY audit_insert ON "audit_logs" FOR INSERT WITH CHECK (app_is_admin() OR app_scope() = 'auth' OR (app_user_id() <> '' AND ("userId" IS NULL OR "userId" = app_user_id())))`,
  );
  return statements;
}

export async function currentRoleFlags(admin: PrismaClient) {
  const rows = await admin.$queryRaw<Array<{ rolsuper: boolean; rolbypassrls: boolean; rolname: string }>>`
    SELECT rolsuper, rolbypassrls, rolname FROM pg_roles WHERE rolname = current_user
  `;
  return rows[0] ?? { rolsuper: false, rolbypassrls: false, rolname: 'unknown' };
}

export async function ensureAppDatabaseRole(admin: PrismaClient, password: string) {
  const flags = await currentRoleFlags(admin);
  if (!flags.rolsuper) return { created: false, superuser: false };
  await admin.$executeRawUnsafe(`
    DO $do$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'dermaops_app') THEN
        CREATE ROLE dermaops_app LOGIN PASSWORD ${sqlLiteral(password)} NOSUPERUSER INHERIT NOCREATEDB NOCREATEROLE NOBYPASSRLS;
      ELSE
        ALTER ROLE dermaops_app WITH LOGIN PASSWORD ${sqlLiteral(password)} NOSUPERUSER NOBYPASSRLS;
      END IF;
    END
    $do$;
  `);
  await admin.$executeRawUnsafe(`
    DO $do$
    BEGIN
      EXECUTE format('GRANT CONNECT ON DATABASE %I TO dermaops_app', current_database());
    END
    $do$;
  `);
  await admin.$executeRawUnsafe('GRANT USAGE ON SCHEMA public TO dermaops_app');
  await admin.$executeRawUnsafe('GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO dermaops_app');
  await admin.$executeRawUnsafe('GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO dermaops_app');
  await admin.$executeRawUnsafe('ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO dermaops_app');
  await admin.$executeRawUnsafe(`
    DO $do$
    BEGIN
      IF to_regclass('public.session') IS NOT NULL THEN
        EXECUTE 'REVOKE ALL ON TABLE "session" FROM dermaops_app';
      END IF;
    END
    $do$;
  `);
  return { created: true, superuser: true };
}

export async function ensureRowLevelSecurity(admin: PrismaClient) {
  for (const sql of RLS_FUNCTIONS) {
    await admin.$executeRawUnsafe(sql);
  }
  for (const sql of policyStatements()) {
    await admin.$executeRawUnsafe(sql);
  }
  await admin.$executeRawUnsafe('GRANT EXECUTE ON FUNCTION app_role() TO PUBLIC');
  await admin.$executeRawUnsafe('GRANT EXECUTE ON FUNCTION app_doctor_id() TO PUBLIC');
  await admin.$executeRawUnsafe('GRANT EXECUTE ON FUNCTION app_user_id() TO PUBLIC');
  await admin.$executeRawUnsafe('GRANT EXECUTE ON FUNCTION app_scope() TO PUBLIC');
  await admin.$executeRawUnsafe('GRANT EXECUTE ON FUNCTION app_is_admin() TO PUBLIC');
  await admin.$executeRawUnsafe('GRANT EXECUTE ON FUNCTION app_is_clinic_wide() TO PUBLIC');
  await admin.$executeRawUnsafe('GRANT EXECUTE ON FUNCTION app_is_writer() TO PUBLIC');
  await admin.$executeRawUnsafe('GRANT EXECUTE ON FUNCTION app_can_see_doctor(text) TO PUBLIC');
}
