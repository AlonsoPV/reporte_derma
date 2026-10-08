import assert from 'node:assert/strict';
import test from 'node:test';
import type { PrismaClient } from '@prisma/client';
import { DEMO_DATE, seedDemoDay } from '../../server/services/demo-day';

// In-memory transaction adapter: these tests never connect to or mutate a clinic database.
type Row = Record<string, any>;
function fixture() {
  const state = {
    users: [
      { id: 'admin', role: 'ADMIN', status: 'ACTIVE' },
      ...['ana', 'berenice', 'carlos'].map((name) => ({
        id: name, email: `${name}@clinicademo.local`, role: 'DOCTOR', status: 'ACTIVE',
        doctor: { id: name, name, active: true },
      })),
    ] as Row[],
    appointments: [] as Row[],
    attendances: [] as Row[],
    closures: [] as Row[],
    audits: [] as Row[],
  };
  const equal = (actual: unknown, expected: unknown) =>
    actual instanceof Date && expected instanceof Date ? actual.getTime() === expected.getTime() : actual === expected;
  const matches = (row: Row, where: Row) => Object.entries(where).every(([key, value]) => equal(row[key], value));
  const transaction = async (callback: (tx: any) => Promise<unknown>) => {
    const pending = structuredClone(state);
    const tx = {
      $queryRaw: async () => [{ locked: true }],
      user: {
        findUnique: async ({ where }: Row) => pending.users.find((u) => matches(u, where)) || null,
        findMany: async () => pending.users.filter((u) => u.role === 'DOCTOR' && u.status === 'ACTIVE'),
      },
      dailyClosure: {
        findUnique: async ({ where }: Row) => pending.closures.find((c) => matches(c, where.doctorId_date)) || null,
      },
      appointment: {
        findUnique: async ({ where }: Row) => pending.appointments.find((a) => matches(a, where)) || null,
        create: async ({ data }: Row) => {
          const row = { id: `appt-${pending.appointments.length}`, ...data };
          pending.appointments.push(row);
          return row;
        },
      },
      attendance: {
        findUnique: async ({ where }: Row) => pending.attendances.find((a) => matches(a, where)) || null,
        findFirst: async ({ where }: Row) => pending.attendances.find((a) => matches(a, where)) || null,
        create: async ({ data }: Row) => {
          const row = { id: `att-${pending.attendances.length}`, ...data };
          pending.attendances.push(row);
          return row;
        },
      },
      auditLog: { create: async ({ data }: Row) => pending.audits.push(data) },
    };
    const result = await callback(tx);
    Object.assign(state, pending);
    return result;
  };
  const database = { $transaction: transaction } as unknown as PrismaClient;
  return { state, seed: (actorId: string) => seedDemoDay(actorId, database) };
}

test('creates exactly 9 demo appointments and 6 demo attendances; preserves unrelated data', async (t) => {
  const { state, seed } = fixture();
  const unrelated = { id: 'real', externalAppointmentId: 'REAL', isDemo: false };
  state.appointments.push(unrelated);
  const result = await seed('admin');
  assert.equal(result.appointmentsCreated, 9);
  assert.equal(result.attendancesCreated, 6);
  assert.deepEqual(state.appointments[0], unrelated);
  for (const doctor of ['ana', 'berenice', 'carlos']) {
    const appointments = state.appointments.filter((a) => a.doctorId === doctor);
    const attendances = state.attendances.filter((a) => a.doctorId === doctor);
    assert.deepEqual(appointments.map((a) => a.operationalStatus), ['PENDING', 'ATTENDED', 'CANCELLED']);
    assert.deepEqual(attendances.map((a) => a.origin), ['SCHEDULED', 'WALK_IN']);
    for (const record of [...appointments, ...attendances]) {
      assert.equal(record.isDemo, true);
      assert.equal(record.dataSource, 'DEMO');
      assert.equal((record.appointmentDate || record.attendanceDate).toISOString().slice(0, 10), DEMO_DATE);
      assert.equal(record.phone, undefined);
      assert.equal(record.email, undefined);
    }
  }
  assert.equal(state.audits[0].userId, 'admin');
});

test('repeated load creates zero duplicates, even when a walk-in time was edited', async (t) => {
  const { state, seed } = fixture();
  await seed('admin');
  state.attendances.find((a) => a.origin === 'WALK_IN')!.actualTime = '17:00';
  const result = await seed('admin');
  assert.equal(result.appointmentsCreated, 0);
  assert.equal(result.attendancesCreated, 0);
  assert.equal(state.appointments.length, 9);
  assert.equal(state.attendances.length, 6);
  assert.equal(state.attendances.find((a) => a.origin === 'WALK_IN')!.actualTime, '17:00');
});

test('a conflict in the last profile rolls back earlier inserts and preserves the real record', async (t) => {
  const { state, seed } = fixture();
  state.appointments.push({ id: 'real', externalAppointmentId: 'DEMO-20261008-CAR-01', isDemo: false });
  const before = structuredClone(state);
  await assert.rejects(seed('admin'), /pertenece a otro registro/);
  assert.deepEqual(state, before);
});

test('missing demo profile aborts without writes', async (t) => {
  const { state, seed } = fixture();
  state.users = state.users.filter((u) => u.id !== 'carlos');
  await assert.rejects(seed('admin'), /perfil médico demo activo/);
  assert.equal(state.appointments.length, 0);
});

test('closed day aborts without writes', async (t) => {
  const { state, seed } = fixture();
  state.closures.push({ doctorId: 'carlos', date: new Date('2026-10-08T00:00:00Z'), status: 'CLOSED' });
  await assert.rejects(seed('admin'), /está cerrado/);
  assert.equal(state.appointments.length, 0);
});

test('inactive or non-admin actor is rejected', async (t) => {
  const { state, seed } = fixture();
  await assert.rejects(seed('ana'), /administrador activo/);
  state.users.find((u) => u.id === 'admin')!.status = 'INACTIVE';
  await assert.rejects(seed('admin'), /administrador activo/);
  assert.equal(state.appointments.length, 0);
});

test('non-demo attendance collision is preserved and load fails atomically', async (t) => {
  const { state, seed } = fixture();
  await seed('admin');
  state.attendances[0].isDemo = false;
  const before = structuredClone(state);
  await assert.rejects(seed('admin'), /pertenece a otro registro/);
  assert.deepEqual(state, before);
});
