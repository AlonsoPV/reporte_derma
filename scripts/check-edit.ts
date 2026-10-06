const base = 'http://127.0.0.1:5050';

async function main() {
  const login = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@clinicademo.local', password: 'Demo123!' }),
  });
  const cookie = (login.headers.getSetCookie?.() || []).map((c) => c.split(';')[0]).join('; ');
  const list = await (await fetch(`${base}/api/attendances?from=2020-01-01&to=2030-01-01`, { headers: { Cookie: cookie } })).json();
  const id = list.attendances[0]?.id;
  if (!id) throw new Error('no attendance');
  const r = await fetch(`${base}/api/attendances/${id}`, {
    method: 'PATCH',
    headers: { Cookie: cookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({ treatment: 'Consulta editada', amount: 999 }),
  });
  const data = await r.json();
  console.log(r.status, data.attendance?.treatment, data.attendance?.amount ?? data.error);
}

main().catch(console.error);
