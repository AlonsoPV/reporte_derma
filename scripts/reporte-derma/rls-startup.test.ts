import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { PrismaClient } from '@prisma/client';
import { currentRoleFlags, ensureAppDatabaseRole, verifyRowLevelSecurity } from '../../server/rls';

test('production uses an existing restricted role without startup DDL', async () => {
  const previous = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  try {
    const scenarios = [
      { name: 'restricted LOGIN', rows: [{ rolname: 'dermaops_app', rolsuper: false, rolbypassrls: false, rolcanlogin: true }], error: null },
      { name: 'missing', rows: [], error: /Falta el rol dermaops_app/ },
      { name: 'BYPASSRLS', rows: [{ rolsuper: false, rolbypassrls: true, rolcanlogin: true }], error: /NOBYPASSRLS/ },
      { name: 'superuser', rows: [{ rolsuper: true, rolbypassrls: false, rolcanlogin: true }], error: /NOSUPERUSER/ },
      { name: 'NOLOGIN', rows: [{ rolsuper: false, rolbypassrls: false, rolcanlogin: false }], error: /LOGIN/ },
    ];
    for (const scenario of scenarios) {
      let reads = 0;
      const admin = {
        $queryRaw: async () => { reads++; return scenario.rows; },
        $executeRawUnsafe: async () => { assert.fail('Production must not provision roles at startup'); },
      } as unknown as PrismaClient;
      if (scenario.error) {
        await assert.rejects(ensureAppDatabaseRole(admin, 'unused-test-password'), scenario.error);
      } else {
        assert.deepEqual(await ensureAppDatabaseRole(admin, 'unused-test-password'), { available: true });
      }
      assert.equal(reads, 1, scenario.name);
    }
  } finally {
    if (previous === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previous;
  }
});

test('unknown current database role fails closed', async () => {
  const admin = { $queryRaw: async () => [] } as unknown as PrismaClient;
  await assert.rejects(currentRoleFlags(admin), /No se pudieron verificar/);
});

test('production requires forced RLS and policies on every protected table', async () => {
  const tables = ['users', 'doctors', 'doctor_name_mappings', 'appointments', 'attendances',
    'prescriptions', 'prescription_items', 'daily_closures', 'imports', 'audit_logs'];
  const rows = tables.map((relname) => ({
    relname, relrowsecurity: true, relforcerowsecurity: true, has_policy: true,
  }));
  const admin = { $queryRaw: async () => rows } as unknown as PrismaClient;
  await verifyRowLevelSecurity(admin);
  for (const flag of ['relrowsecurity', 'relforcerowsecurity', 'has_policy'] as const) {
    rows[0][flag] = false;
    await assert.rejects(verifyRowLevelSecurity(admin), /RLS no está preparada en la tabla users/);
    rows[0][flag] = true;
  }
  rows.pop();
  await assert.rejects(verifyRowLevelSecurity(admin), /audit_logs/);
});
