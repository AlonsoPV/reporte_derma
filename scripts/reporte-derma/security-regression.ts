import { DEMO_PASSWORD } from '../../shared/schemas';
import { prisma, prismaAdmin } from '../../server/db';

const base = process.env.API_BASE || 'http://127.0.0.1:5050';

async function login(body: Record<string, string>) {
  const res = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'http://127.0.0.1:5173' },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  const cookie = (res.headers.get('set-cookie') || '').split(';')[0];
  return { status: res.status, cookie, json };
}

async function api(cookie: string, path: string, init: RequestInit = {}) {
  const res = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      Origin: 'http://127.0.0.1:5173',
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      cookie,
      ...(init.headers || {}),
    },
  });
  let json: any = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  return { status: res.status, json };
}

function assert(cond: unknown, message: string) {
  if (!cond) throw new Error(message);
}

async function main() {
  const doctorsRes = await fetch(`${base}/api/auth/doctors`);
  const doctorsJson = await doctorsRes.json();
  assert(doctorsRes.status === 200, 'auth/doctors failed');
  const anaId = doctorsJson.doctors.find((d: { name: string }) => d.name.includes('Ana'))?.id;
  const carlosId = doctorsJson.doctors.find((d: { name: string }) => d.name.includes('Carlos'))?.id;
  assert(anaId && carlosId, 'demo doctors missing — run seed');

  const ana = await login({ doctorId: anaId, password: DEMO_PASSWORD });
  const carlos = await login({ doctorId: carlosId, password: DEMO_PASSWORD });
  const admin = await login({ email: 'admin@clinicademo.local', password: DEMO_PASSWORD });
  const reception = await login({ email: 'recepcion@clinicademo.local', password: DEMO_PASSWORD });
  assert(ana.status === 200 && carlos.status === 200 && admin.status === 200 && reception.status === 200, `login failed ${JSON.stringify({ ana: ana.status, carlos: carlos.status, admin: admin.status, reception: reception.status, anaErr: ana.json, adminErr: admin.json })}`);

  const anaList = await api(ana.cookie, '/api/appointments');
  const adminList = await api(admin.cookie, '/api/appointments');
  const anaDoctorIds = [...new Set((anaList.json.appointments || []).map((a: { doctorId: string }) => a.doctorId))];
  assert(anaDoctorIds.every((id) => id === ana.json.user.doctorId), 'doctor list leak');
  assert((anaList.json.appointments || []).length < (adminList.json.appointments || []).length, 'doctor not isolated vs admin');

  const foreign = (adminList.json.appointments || []).find(
    (row: { doctorId: string }) => row.doctorId === carlos.json.user.doctorId,
  );
  assert(foreign, 'need carlos appointment for IDOR check');
  const idor = await api(ana.cookie, `/api/appointments/${foreign.id}`);
  assert(idor.status === 404 || idor.status === 403, `IDOR status ${idor.status}`);

  const spoof = await api(ana.cookie, `/api/day?doctorId=${carlos.json.user.doctorId}`);
  const spoofIds = [...new Set([
    ...(spoof.json.appointments || []).map((a: { doctorId: string }) => a.doctorId),
    ...(spoof.json.attendances || []).map((a: { doctorId: string }) => a.doctorId),
  ])];
  assert(spoofIds.every((id) => id === ana.json.user.doctorId), 'spoof doctorId ignored');

  const recWrite = await api(reception.cookie, '/api/walk-in', {
    method: 'POST',
    body: JSON.stringify({
      patientName: 'X',
      actualTime: '10:00',
      items: [{ treatment: 'Consulta', amount: 100 }],
    }),
  });
  assert(recWrite.status === 403, 'reception write should be denied');

  const anaAdmin = await api(ana.cookie, '/api/admin/users');
  assert(anaAdmin.status === 403, 'doctor reached admin');

  const users = await api(admin.cookie, '/api/admin/users');
  assert(!(users.json.users || []).some((u: { passwordHash?: string }) => u.passwordHash), 'hash leak');

  async function countWith(cfg: {
    role: string;
    doctorId: string;
    userId: string;
    scope: string;
    authEmail: string;
    authDoctorId: string;
    table: 'appointment' | 'user';
  }) {
    return prismaAdmin.$transaction(async (tx) => {
      await tx.$executeRaw`
        SELECT
          set_config('app.role', ${cfg.role}, true),
          set_config('app.doctor_id', ${cfg.doctorId}, true),
          set_config('app.user_id', ${cfg.userId}, true),
          set_config('app.scope', ${cfg.scope}, true),
          set_config('app.auth_email', ${cfg.authEmail}, true),
          set_config('app.auth_doctor_id', ${cfg.authDoctorId}, true)
      `;
      return cfg.table === 'user' ? tx.user.count() : tx.appointment.count();
    });
  }

  const empty = await countWith({
    role: '',
    doctorId: '',
    userId: '',
    scope: '',
    authEmail: '',
    authDoctorId: '',
    table: 'appointment',
  });
  const asAna = await countWith({
    role: 'DOCTOR',
    doctorId: ana.json.user.doctorId,
    userId: ana.json.user.id,
    scope: 'app',
    authEmail: '',
    authDoctorId: '',
    table: 'appointment',
  });
  const authAllUsers = await countWith({
    role: '',
    doctorId: '',
    userId: '',
    scope: 'auth',
    authEmail: '',
    authDoctorId: '',
    table: 'user',
  });
  const authOne = await countWith({
    role: '',
    doctorId: '',
    userId: '',
    scope: 'auth',
    authEmail: 'admin@clinicademo.local',
    authDoctorId: '',
    table: 'user',
  });
  assert(empty === 0, 'empty RLS context leaked');
  assert(asAna > 0 && asAna < (adminList.json.appointments || []).length, 'RLS doctor count');
  assert(authAllUsers === 0, 'auth scope without identity must not list users');
  assert(authOne === 1, 'auth scope email must resolve one user');

  const sessionRls = await prismaAdmin.$queryRawUnsafe(
    `SELECT relrowsecurity, relforcerowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname='session'`,
  );
  console.log('OK security regression', {
    ana: (anaList.json.appointments || []).length,
    admin: (adminList.json.appointments || []).length,
    empty,
    asAna,
    authAllUsers,
    authOne,
    sessionRls,
  });
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect().catch(() => undefined);
    await prismaAdmin.$disconnect().catch(() => undefined);
  });
