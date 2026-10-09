import test from 'node:test';
import assert from 'node:assert/strict';
import type { PrismaClient } from '@prisma/client';
import { cleanupDemoData } from '../../server/services/demo-cleanup';

type Row = Record<string, any>;
function matches(row: Row, where: Row = {}): boolean {
  return Object.entries(where).every(([key, value]) => {
    if (key === 'OR') return value.some((clause: Row) => matches(row, clause));
    if (key === 'AND') return value.every((clause: Row) => matches(row, clause));
    if (key === 'NOT') return !matches(row, value);
    if (value instanceof Date) return row[key]?.getTime() === value.getTime();
    if (value && typeof value === 'object') {
      const actual = value.path ? value.path.reduce((obj: any, part: string) => obj?.[part], row[key]) : row[key];
      if ('in' in value) return value.in.includes(actual);
      if ('notIn' in value) return !value.notIn.includes(actual);
      if ('equals' in value) return actual === value.equals;
      if ('gte' in value) return actual !== undefined && actual >= value.gte;
    }
    return row[key] === value;
  });
}

function fixture() {
  const date = new Date('2026-10-08T00:00:00Z');
  const state: Record<string, Row[]> = {
    user: [
      { id: 'admin', email: 'admin@clinicademo.local', role: 'ADMIN', status: 'ACTIVE', doctorId: null },
      { id: 'ana', email: 'ana@clinicademo.local', role: 'DOCTOR', status: 'ACTIVE', doctorId: 'a' },
      { id: 'carlos', email: 'carlos@clinicademo.local', role: 'DOCTOR', status: 'ACTIVE', doctorId: 'c' },
      { id: 'reception', email: 'recepcion@clinicademo.local', role: 'RECEPTION', status: 'ACTIVE', doctorId: null },
    ],
    doctor: [{ id: 'a' }, { id: 'c' }],
    appointment: [
      { id: 'da', doctorId: 'a', appointmentDate: date, isDemo: true, dataSource: 'DEMO' },
      { id: 'dc', doctorId: 'c', appointmentDate: date, isDemo: true, dataSource: 'DEMO' },
    ],
    attendance: [
      { id: 'aa', doctorId: 'a', attendanceDate: date, createdById: 'ana', appointmentId: 'da', isDemo: true, dataSource: 'DEMO' },
      { id: 'ac', doctorId: 'c', attendanceDate: date, createdById: 'carlos', appointmentId: 'dc', isDemo: true, dataSource: 'MANUAL' },
      { id: 'real', doctorId: 'c', attendanceDate: date, createdById: 'carlos', isDemo: false, dataSource: 'MANUAL' },
    ],
    dailyClosure: [
      { id: 'demo-close', doctorId: 'a', date, closedById: 'ana', treatmentsSnapshot: { Consulta: 1 } },
      { id: 'mixed-close', doctorId: 'c', date, closedById: 'carlos', treatmentsSnapshot: { dummy: 1 } },
    ],
    importBatch: [],
    session: ['admin', 'ana', 'carlos', 'reception'].map((id) => ({ sid: id, sess: { user: { id } } })),
    doctorNameMapping: [{ id: 'ma', doctorId: 'a' }, { id: 'mc', doctorId: 'c' }],
    auditLog: [{ id: 'existing-audit', userId: 'admin', action: 'EXISTING' }],
  };
  let failAudit = false;
  const database = {
    $transaction: async (callback: (tx: any) => Promise<unknown>) => {
      const pending = structuredClone(state);
      const tx: Row = { $queryRaw: async () => [{ locked: true }] };
      for (const model of Object.keys(pending)) {
        const rows = () => pending[model].map((row) => model === 'appointment'
          ? { ...row, attendance: pending.attendance.find((a) => a.appointmentId === row.id) || null } : row);
        tx[model] = {
          findUnique: async ({ where }: Row) => rows().find((row) => matches(row, where)) || null,
          findMany: async ({ where }: Row = {}) => rows().filter((row) => matches(row, where)),
          count: async ({ where }: Row) => rows().filter((row) => matches(row, where)).length,
          deleteMany: async ({ where }: Row) => {
            const old = pending[model].length;
            pending[model] = pending[model].filter((row) => !matches(row, where));
            return { count: old - pending[model].length };
          },
          create: async ({ data }: Row) => {
            if (model === 'auditLog' && failAudit) throw new Error('audit failure');
            pending[model].push(data);
            return data;
          },
        };
      }
      const result = await callback(tx);
      Object.assign(state, pending);
      return result;
    },
  } as unknown as PrismaClient;
  return { state, run: (apply = false) => cleanupDemoData('admin', apply, database), failAudit: () => { failAudit = true; } };
}

test('preview has no side effects and protects mixed closures, real-linked accounts, last admin', async () => {
  const { state, run } = fixture();
  const before = structuredClone(state);
  const preview = await run();
  assert.deepEqual(preview.counts, { appointments: 2, attendances: 2, closures: 1, users: 2, doctors: 1 });
  assert.equal(preview.preserved.protectedAdmin, true);
  assert.equal(preview.preserved.mixedClosures, 1);
  assert.deepEqual(state, before);
});

test('delete only demo clinical data, remove unused demo accounts, mappings and sessions; preserve real data and audit', async () => {
  const { state, run } = fixture();
  const real = structuredClone(state.attendance.find((a) => a.id === 'real'));
  const result = await run(true);
  assert.equal(result.applied, true);
  assert.deepEqual(state.attendance, [real]);
  assert.deepEqual(state.user.map((u) => u.id), ['admin', 'carlos']);
  assert.deepEqual(state.doctor.map((d) => d.id), ['c']);
  assert.deepEqual(state.dailyClosure.map((c) => c.id), ['mixed-close']);
  assert.deepEqual(state.session.map((s) => s.sid), ['admin', 'carlos']);
  assert.deepEqual(state.doctorNameMapping.map((m) => m.id), ['mc']);
  assert.equal(state.auditLog[0].action, 'EXISTING');
  assert.equal(state.auditLog[1].action, 'DELETE_DEMO_DATA');
  const repeated = await run(true);
  assert.deepEqual(repeated.counts, { appointments: 0, attendances: 0, closures: 0, users: 0, doctors: 0 });
});

test('unmarked attendance linked to a demo appointment protects that appointment and doctor', async () => {
  const { state, run } = fixture();
  Object.assign(state.attendance[0], { isDemo: false, dataSource: 'MANUAL' });
  const result = await run(true);
  assert.equal(result.preserved.demoAppointments, 1);
  assert.equal(state.appointment[0].id, 'da');
  assert.equal(state.user.some((u) => u.id === 'ana'), true);
  assert.equal(state.doctor.some((d) => d.id === 'a'), true);
});

test('another real active administrator permits removal of the demo actor and its session', async () => {
  const { state, run } = fixture();
  state.user.push({ id: 'real-admin', email: 'owner@example.invalid', role: 'ADMIN', status: 'ACTIVE', doctorId: null });
  const result = await run(true);
  assert.equal(result.actorDeleted, true);
  assert.equal(state.user.some((u) => u.id === 'admin'), false);
  assert.equal(state.user.some((u) => u.id === 'real-admin'), true);
  assert.equal(state.session.some((s) => s.sid === 'admin'), false);
  assert.equal(state.auditLog.at(-1)?.userId, null);
});

test('audit failure rolls back all deletions', async () => {
  const { state, run, failAudit } = fixture();
  const before = structuredClone(state);
  failAudit();
  await assert.rejects(run(true), /audit failure/);
  assert.deepEqual(state, before);
});

test('inactive administrator cannot delete records', async () => {
  const { state, run } = fixture();
  state.user[0].status = 'INACTIVE';
  const before = structuredClone(state);
  await assert.rejects(run(true), /administrador activo/);
  assert.deepEqual(state, before);
});

test('non-demo appointment alone and import authorship protect otherwise unused demo accounts', async () => {
  const { state, run } = fixture();
  state.appointment.push({ id: 'real-appt', doctorId: 'a', appointmentDate: new Date('2026-10-09T00:00:00Z'), isDemo: false, dataSource: 'IMPORT' });
  state.importBatch.push({ id: 'import', uploadedById: 'reception' });
  await run(true);
  assert.equal(state.user.some((u) => u.id === 'ana'), true);
  assert.equal(state.user.some((u) => u.id === 'reception'), true);
  assert.equal(state.doctor.some((d) => d.id === 'a'), true);
  assert.equal(state.appointment.some((a) => a.id === 'real-appt'), true);
});
