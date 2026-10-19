import { prisma } from '../server/db';

const base = 'http://127.0.0.1:5050';

type Session = { cookie: string; user: { id: string; role: string; name: string; doctorId: string | null } };

async function login(body: Record<string, string>): Promise<Session> {
  const res = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const setCookie = res.headers.get('set-cookie') || '';
  const cookie = setCookie.split(';')[0];
  const data = await res.json();
  if (!res.ok) throw new Error(`login ${res.status} ${JSON.stringify(data)}`);
  return { cookie, user: data.user };
}

async function call(session: Session | null, method: string, path: string, body?: unknown) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(session ? { cookie: session.cookie } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json: any = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = { raw: text.slice(0, 180) }; }
  return { status: res.status, json };
}

const failures: string[] = [];
function expect(name: string, ok: boolean, detail: string) {
  const line = `${ok ? 'OK ' : 'FAIL'} ${name} — ${detail}`;
  console.log(line);
  if (!ok) failures.push(line);
}

const admin = await login({ email: 'admin@clinicademo.local', password: 'Demo123!' });
const reception = await login({ email: 'recepcion@clinicademo.local', password: 'Demo123!' });
const ana = await login({ email: 'ana@clinicademo.local', password: 'Demo123!' });
const carlos = await login({ email: 'carlos@clinicademo.local', password: 'Demo123!' });

expect('admin role', admin.user.role === 'ADMIN', admin.user.role);
expect('reception role', reception.user.role === 'RECEPTION', reception.user.role);
expect('ana role', ana.user.role === 'DOCTOR' && Boolean(ana.user.doctorId), `${ana.user.role} ${ana.user.doctorId}`);
expect('carlos role', carlos.user.role === 'DOCTOR' && carlos.user.doctorId !== ana.user.doctorId, `${carlos.user.role} ${carlos.user.doctorId}`);

const anon = await call(null, 'GET', '/api/day');
expect('anon day', anon.status === 401, String(anon.status));

const adminDay = await call(admin, 'GET', '/api/day?date=2026-10-17');
const receptionDay = await call(reception, 'GET', '/api/day?date=2026-10-17');
const anaDay = await call(ana, 'GET', '/api/day?date=2026-10-17');
const anaSpoof = await call(ana, 'GET', `/api/day?date=2026-10-17&doctorId=${carlos.user.doctorId}`);
const carlosDay = await call(carlos, 'GET', '/api/day?date=2026-10-17');

const doctorIds = (rows: any[]) => [...new Set((rows || []).map((row) => row.doctorId).filter(Boolean))];
expect('admin day', adminDay.status === 200, String(adminDay.status));
expect('reception sees the day', receptionDay.status === 200, String(receptionDay.status));
expect('reception day matches admin scope', receptionDay.status === 200 && (receptionDay.json.attendances || []).length === (adminDay.json.attendances || []).length, `reception ${(receptionDay.json.attendances || []).length} admin ${(adminDay.json.attendances || []).length}`);
expect('ana day only herself', anaDay.status === 200 && doctorIds([...(anaDay.json.appointments || []), ...(anaDay.json.attendances || [])]).every((id) => id === ana.user.doctorId), doctorIds([...(anaDay.json.appointments || []), ...(anaDay.json.attendances || [])]).join(',') || 'empty');
expect('ana spoofed doctorId ignored', anaSpoof.status === 200 && doctorIds([...(anaSpoof.json.appointments || []), ...(anaSpoof.json.attendances || [])]).every((id) => id === ana.user.doctorId), doctorIds([...(anaSpoof.json.appointments || []), ...(anaSpoof.json.attendances || [])]).join(',') || 'empty');
expect('carlos day only himself', carlosDay.status === 200 && doctorIds([...(carlosDay.json.appointments || []), ...(carlosDay.json.attendances || [])]).every((id) => id === carlos.user.doctorId), doctorIds([...(carlosDay.json.appointments || []), ...(carlosDay.json.attendances || [])]).join(',') || 'empty');

const catalog = await call(admin, 'GET', '/api/appointments?from=2026-01-01&to=2026-12-31');
const allAppointments = catalog.json.appointments || [];
const anaAppointments = allAppointments.filter((row: any) => row.doctorId === ana.user.doctorId);
const carlosAppointments = allAppointments.filter((row: any) => row.doctorId === carlos.user.doctorId);
const foreign = carlosAppointments[0];
const own = anaAppointments[0];
expect('appointment catalog', catalog.status === 200 && Boolean(foreign) && Boolean(own), `status ${catalog.status} ana ${anaAppointments.length} carlos ${carlosAppointments.length}`);

if (foreign && own) {
  const peek = await call(ana, 'GET', `/api/appointments/${foreign.id}`);
  expect('ana cannot open Carlos appointment', peek.status === 403, `${peek.status} ${peek.json?.error || ''}`);
  const attend = await call(ana, 'POST', '/api/attend', { appointmentId: foreign.id, actualTime: '10:00', items: [{ treatment: 'Consulta', amount: 100 }] });
  expect('ana cannot attend Carlos patient', attend.status === 403, `${attend.status} ${attend.json?.error || ''}`);
  const classify = await call(ana, 'POST', '/api/classify', { appointmentId: foreign.id, operationalStatus: 'NO_SHOW', reason: 'NO_SE_PRESENTO' });
  expect('ana cannot mark Carlos no-show', classify.status === 403, `${classify.status} ${classify.json?.error || ''}`);
  const carlosList = await call(carlos, 'GET', '/api/attendances?from=2026-01-01&to=2026-12-31');
  const carlosAttendance = (carlosList.json.attendances || [])[0];
  if (carlosAttendance) {
    const stolen = await call(ana, 'PUT', `/api/attendances/${carlosAttendance.id}`, { amount: 0 });
    expect('ana cannot edit Carlos attendance', stolen.status === 403, `${stolen.status} ${stolen.json?.error || ''}`);
    const stolenDelete = await call(ana, 'DELETE', `/api/attendances/${carlosAttendance.id}`);
    expect('ana cannot delete Carlos attendance', stolenDelete.status === 403, `${stolenDelete.status} ${stolenDelete.json?.error || ''}`);
  } else {
    expect('carlos attendance sample', false, 'none');
  }
}

const receptionAttend = await call(reception, 'POST', '/api/attend', { appointmentId: 'x', actualTime: '10:00', items: [{ treatment: 'Consulta', amount: 100 }] });
expect('reception cannot attend', receptionAttend.status === 403 && /solo consulta/i.test(receptionAttend.json?.error || ''), `${receptionAttend.status} ${receptionAttend.json?.error || ''}`);
const receptionWalk = await call(reception, 'POST', '/api/walk-in', { patientName: 'No', actualTime: '10:00', doctorId: ana.user.doctorId, items: [{ treatment: 'Consulta', amount: 100 }] });
expect('reception cannot walk-in', receptionWalk.status === 403, `${receptionWalk.status} ${receptionWalk.json?.error || ''}`);
const receptionEdit = await call(reception, 'PUT', '/api/attendances/x', { patientName: 'No', amount: 10, treatment: 'Consulta' });
expect('reception cannot edit', receptionEdit.status === 403, `${receptionEdit.status} ${receptionEdit.json?.error || ''}`);
const receptionDelete = await call(reception, 'DELETE', '/api/attendances/x');
expect('reception cannot delete', receptionDelete.status === 403, `${receptionDelete.status} ${receptionDelete.json?.error || ''}`);
const receptionClose = await call(reception, 'POST', '/api/closures/close', { date: '2026-10-17', doctorId: ana.user.doctorId });
expect('reception cannot close day', receptionClose.status === 403, `${receptionClose.status} ${receptionClose.json?.error || ''}`);
const receptionReopen = await call(reception, 'POST', '/api/closures/reopen', { closureId: 'x', reason: 'prueba' });
expect('reception cannot reopen', receptionReopen.status === 403, `${receptionReopen.status} ${receptionReopen.json?.error || ''}`);
const receptionImport = await call(reception, 'GET', '/api/imports');
expect('reception cannot import', receptionImport.status === 403, String(receptionImport.status));
const receptionAdmin = await call(reception, 'GET', '/api/admin/users');
expect('reception cannot administer users', receptionAdmin.status === 403, String(receptionAdmin.status));
const receptionDash = await call(reception, 'GET', '/api/reports/dashboard-admin');
expect('reception can open the dashboard', receptionDash.status === 200, String(receptionDash.status));

const anaDash = await call(ana, 'GET', '/api/reports/dashboard-admin');
expect('doctor cannot open admin dashboard', anaDash.status === 403, String(anaDash.status));
const anaAdmin = await call(ana, 'GET', '/api/admin/users');
expect('doctor cannot administer users', anaAdmin.status === 403, String(anaAdmin.status));
const anaImport = await call(ana, 'GET', '/api/imports');
expect('doctor cannot import', anaImport.status === 403, String(anaImport.status));
const anaReopen = await call(ana, 'POST', '/api/closures/reopen', { closureId: 'x', reason: 'prueba' });
expect('doctor cannot reopen', anaReopen.status === 403, `${anaReopen.status} ${anaReopen.json?.error || ''}`);
const anaDoctors = await call(ana, 'GET', '/api/doctors');
expect('doctor cannot list every doctor', anaDoctors.status === 403, String(anaDoctors.status));

const anaAtt = await call(ana, 'GET', '/api/attendances?from=2026-10-01&to=2026-10-31');
const anaAttDoctors = doctorIds(anaAtt.json.attendances || []);
expect('ana attendances stay hers', anaAtt.status === 200 && anaAttDoctors.every((id) => id === ana.user.doctorId), anaAttDoctors.join(',') || 'empty');

const preview = await call(ana, 'GET', `/api/closures/preview?date=2026-10-17&doctorId=${carlos.user.doctorId}`);
expect('ana preview ignores another doctor', preview.status === 200 ? preview.json?.doctor?.id === ana.user.doctorId : preview.status === 400, `${preview.status} ${preview.json?.doctor?.id || preview.json?.error || ''}`);

if (own) {
  const ownPeek = await call(ana, 'GET', `/api/appointments/${own.id}`);
  expect('ana can open her appointment', ownPeek.status === 200, String(ownPeek.status));
}

await prisma.user.deleteMany({ where: { email: 'supervisor.validador@clinicademo.local' } });
const created = await call(admin, 'POST', '/api/admin/users', {
  name: 'Validador Supervisor',
  email: 'supervisor.validador@clinicademo.local',
  password: 'Demo123!',
  role: 'SUPERVISOR',
});
expect('admin can create supervisor', created.status === 200 && created.json?.user?.role === 'SUPERVISOR', `${created.status} ${created.json?.error || created.json?.user?.role || ''}`);
if (created.json?.user?.id) {
  try {
    const supervisor = await login({ email: 'supervisor.validador@clinicademo.local', password: 'Demo123!' });
    expect('supervisor role', supervisor.user.role === 'SUPERVISOR', supervisor.user.role);
    const supDay = await call(supervisor, 'GET', '/api/day?date=2026-10-17');
    expect('supervisor sees the whole day', supDay.status === 200, String(supDay.status));
    const supDash = await call(supervisor, 'GET', '/api/reports/dashboard-admin');
    expect('supervisor can open the dashboard', supDash.status === 200, String(supDash.status));
    const supWrite = await call(supervisor, 'POST', '/api/walk-in', { patientName: 'No', actualTime: '10:00', doctorId: ana.user.doctorId, items: [{ treatment: 'Consulta', amount: 100 }] });
    expect('supervisor cannot write', supWrite.status === 403 && /solo consulta/i.test(supWrite.json?.error || ''), `${supWrite.status} ${supWrite.json?.error || ''}`);
    const supAdmin = await call(supervisor, 'GET', '/api/admin/users');
    expect('supervisor cannot administer users', supAdmin.status === 403, String(supAdmin.status));
    const supReopen = await call(supervisor, 'POST', '/api/closures/reopen', { closureId: 'x', reason: 'prueba' });
    expect('supervisor cannot reopen', supReopen.status === 403, `${supReopen.status} ${supReopen.json?.error || ''}`);
  } finally {
    await prisma.user.deleteMany({ where: { email: 'supervisor.validador@clinicademo.local' } });
  }
}

const adminUsers = await call(admin, 'GET', '/api/admin/users');
expect('admin can administer users', adminUsers.status === 200, String(adminUsers.status));
const adminDash = await call(admin, 'GET', '/api/reports/dashboard-admin');
expect('admin can open the dashboard', adminDash.status === 200, String(adminDash.status));

await prisma.$disconnect();
if (failures.length) {
  console.log(`\n${failures.length} failed`);
  process.exit(1);
}
console.log('\nall permission checks passed');
