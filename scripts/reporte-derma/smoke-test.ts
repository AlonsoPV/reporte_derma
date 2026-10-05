import fs from 'fs';
import path from 'path';

const base = process.env.API_URL || 'http://127.0.0.1:5050';

async function login(email: string) {
  const res = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'Demo123!' }),
  });
  const setCookie = res.headers.getSetCookie?.() || [];
  const cookie = setCookie.map((c) => c.split(';')[0]).join('; ');
  const data = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(data));
  return { cookie, user: data.user };
}

async function main() {
  const admin = await login('admin@clinicademo.local');
  console.log('admin ok', admin.user.email);

  const filePath = path.join('prisma', 'sample', 'sample_huli.xlsx');
  const buf = fs.readFileSync(filePath);
  const form = new FormData();
  form.append('file', new Blob([buf]), 'sample_huli.xlsx');

  const previewRes = await fetch(`${base}/api/imports/preview`, {
    method: 'POST',
    headers: { Cookie: admin.cookie },
    body: form,
  });
  const preview = await previewRes.json();
  console.log('preview', preview.summary || preview);
  if (!preview.importId) throw new Error('no import id');

  const confirmRes = await fetch(`${base}/api/imports/confirm/${preview.importId}`, {
    method: 'POST',
    headers: { Cookie: admin.cookie },
  });
  const confirm = await confirmRes.json();
  console.log('confirm', {
    created: confirm.import?.createdCount,
    updated: confirm.import?.updatedCount,
  });

  // reimport
  const form2 = new FormData();
  form2.append('file', new Blob([buf]), 'sample_huli.xlsx');
  const preview2Res = await fetch(`${base}/api/imports/preview`, {
    method: 'POST',
    headers: { Cookie: admin.cookie },
    body: form2,
  });
  const preview2 = await preview2Res.json();
  console.log('reimport preview', preview2.summary);

  const berenice = await login('berenice@clinicademo.local');
  const dayRes = await fetch(`${base}/api/day`, { headers: { Cookie: berenice.cookie } });
  const day = await dayRes.json();
  const ids = day.appointments.map((a: { externalAppointmentId: string }) => a.externalAppointmentId);
  console.log('berenice ids', ids);
  console.log('has IMP-001', ids.includes('HULI-IMP-001'));
  console.log('has IMP-002', ids.includes('HULI-IMP-002'));

  // close day blocked with pending
  try {
    const closeRes = await fetch(`${base}/api/closures/close`, {
      method: 'POST',
      headers: { Cookie: berenice.cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ date: day.date }),
    });
    const close = await closeRes.json();
    console.log('close attempt', close.error || close.closure?.id, 'pending', close.pending?.length);
  } catch (e) {
    console.error(e);
  }

  // audit
  const auditRes = await fetch(`${base}/api/admin/audit?limit=5`, { headers: { Cookie: admin.cookie } });
  const audit = await auditRes.json();
  console.log(
    'audit actions',
    audit.logs?.map((l: { action: string }) => l.action)
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
