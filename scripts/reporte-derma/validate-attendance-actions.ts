import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';
import { canMutateAttendance } from '../../shared/constants';

const base = 'http://127.0.0.1:5050';
const prisma = new PrismaClient();
const failures: string[] = [];

function todayISO() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Mexico_City',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function cookieFrom(res: Response) {
  return (res.headers.getSetCookie?.() || []).map((c) => c.split(';')[0]).join('; ');
}

async function login(body: Record<string, string>) {
  const res = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`login ${res.status}: ${data.error || JSON.stringify(data)}`);
  return { cookie: cookieFrom(res), user: data.user };
}

async function api(cookie: string, method: string, path: string, body?: unknown) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: {
      Cookie: cookie,
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  let data: any = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  return { status: res.status, data };
}

function check(name: string, ok: boolean, detail = '') {
  if (ok) console.log(`OK  ${name}`);
  else {
    const msg = `FAIL ${name}${detail ? ` — ${detail}` : ''}`;
    console.log(msg);
    failures.push(msg);
  }
}

const date = todayISO();
const [y, m, d] = date.split('-').map(Number);
const dateUtc = new Date(Date.UTC(y, m - 1, d));

assert.equal(canMutateAttendance('DOCTOR', false), true);
assert.equal(canMutateAttendance('DOCTOR', true), false);
assert.equal(canMutateAttendance('ADMIN', true), true);
assert.equal(canMutateAttendance('ADMIN', false), true);
assert.equal(canMutateAttendance('RECEPTION', false), false);
assert.equal(canMutateAttendance('SUPERVISOR', false), false);
assert.equal(canMutateAttendance('ACCOUNTING', true), false);
console.log('OK  canMutateAttendance rules');

const doctors = await prisma.doctor.findMany({ where: { name: { contains: 'Carlos' } } });
const carlos = doctors[0];
if (!carlos) throw new Error('No está Carlos');

await prisma.dailyClosure.deleteMany({ where: { doctorId: carlos.id, date: dateUtc } });
await prisma.attendance.deleteMany({
  where: { doctorId: carlos.id, attendanceDate: dateUtc, patientName: { startsWith: 'VAL-' } },
});
await prisma.appointment.deleteMany({
  where: { doctorId: carlos.id, appointmentDate: dateUtc, patientName: { startsWith: 'VAL-' } },
});

const admin = await login({ email: 'admin@clinicademo.local', password: 'Demo123!' });
const doctor = await login({ doctorId: carlos.id, password: 'Demo123!' });
const reception = await login({ email: 'recepcion@clinicademo.local', password: 'Demo123!' });

const walkIn = await api(doctor.cookie, 'POST', '/api/walk-in', {
  patientName: 'VAL-Walkin',
  actualTime: '10:00',
  attendanceDate: date,
  items: [{ treatment: 'Consulta', amount: 1400 }],
});
check('médico walk-in', walkIn.status === 200, JSON.stringify(walkIn.data?.error || walkIn.status));
const walkId = walkIn.data?.attendances?.[0]?.id as string;

const editOpen = await api(doctor.cookie, 'PATCH', `/api/attendances/${walkId}`, { amount: 1500 });
check('médico edita día abierto', editOpen.status === 200 && Number(editOpen.data?.attendance?.amount) === 1500, JSON.stringify(editOpen.data?.error || editOpen.status));

const recEdit = await api(reception.cookie, 'PATCH', `/api/attendances/${walkId}`, { amount: 1 });
check('recepción no edita', recEdit.status === 403, String(recEdit.status));

const close = await api(doctor.cookie, 'POST', '/api/closures/close', { date, doctorId: carlos.id });
check('cerrar día médico', close.status === 200, JSON.stringify(close.data?.error || close.status));

const editClosed = await api(doctor.cookie, 'PATCH', `/api/attendances/${walkId}`, { amount: 1600 });
check('médico NO edita día cerrado', editClosed.status === 409, `${editClosed.status} ${editClosed.data?.error || ''}`);

const delClosed = await api(doctor.cookie, 'DELETE', `/api/attendances/${walkId}`);
check('médico NO borra día cerrado', delClosed.status === 409, `${delClosed.status} ${delClosed.data?.error || ''}`);

const adminEdit = await api(admin.cookie, 'PATCH', `/api/attendances/${walkId}`, { amount: 1700, notes: 'admin ok' });
check('admin edita día cerrado', adminEdit.status === 200 && Number(adminEdit.data?.attendance?.amount) === 1700, JSON.stringify(adminEdit.data?.error || adminEdit.status));

const adminDel = await api(admin.cookie, 'DELETE', `/api/attendances/${walkId}`);
check('admin borra día cerrado', adminDel.status === 200 && adminDel.data?.ok === true, JSON.stringify(adminDel.data?.error || adminDel.status));

const closureId = close.data?.closure?.id as string;
const reopen = await api(admin.cookie, 'POST', '/api/closures/reopen', { closureId, reason: 'Validación de editar/borrar' });
check('admin reabre día', reopen.status === 200, JSON.stringify(reopen.data?.error || reopen.status));

const appt = await prisma.appointment.create({
  data: {
    externalAppointmentId: `VAL-RESTORE-${Date.now()}`,
    appointmentDate: dateUtc,
    startTime: '11:00',
    endTime: '11:30',
    duration: '30',
    patientName: 'VAL-Restore',
    phone: '5510000000',
    sourceStatus: 'Agendada',
    doctorId: carlos.id,
    operationalStatus: 'PENDING',
    dataSource: 'MANUAL',
    isDemo: true,
  },
});

const attend = await api(doctor.cookie, 'POST', '/api/attend', {
  appointmentId: appt.id,
  actualTime: '11:05',
  items: [
    { treatment: 'Consulta', amount: 1400 },
    { treatment: 'Cirugía', amount: 3500 },
  ],
});
check('dos procedimientos en una cita', attend.status === 200 && attend.data?.attendances?.length === 2, JSON.stringify(attend.data?.error || attend.status));
const firstId = attend.data?.attendances?.[0]?.id as string;
const secondId = attend.data?.attendances?.[1]?.id as string;

const delOne = await api(doctor.cookie, 'DELETE', `/api/attendances/${firstId}`);
const afterOne = await prisma.appointment.findUnique({ where: { id: appt.id } });
check('borrar un renglón deja la cita atendida', delOne.status === 200 && delOne.data?.restoredAppointment === false && afterOne?.operationalStatus === 'ATTENDED', JSON.stringify({ status: delOne.status, restored: delOne.data?.restoredAppointment, appt: afterOne?.operationalStatus }));

const delLast = await api(doctor.cookie, 'DELETE', `/api/attendances/${secondId}`);
const afterLast = await prisma.appointment.findUnique({ where: { id: appt.id } });
check('borrar el último renglón regresa la cita a pendiente', delLast.status === 200 && delLast.data?.restoredAppointment === true && afterLast?.operationalStatus === 'PENDING', JSON.stringify({ status: delLast.status, restored: delLast.data?.restoredAppointment, appt: afterLast?.operationalStatus }));

await prisma.appointment.delete({ where: { id: appt.id } }).catch(() => undefined);
await prisma.$disconnect();

if (failures.length) {
  console.error(`\n${failures.length} falla(s)`);
  process.exit(1);
}
console.log('\nAPI: todo correcto');
