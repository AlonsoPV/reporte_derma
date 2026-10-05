const base = 'http://127.0.0.1:5050';
const login = await fetch(`${base}/api/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'admin@clinicademo.local', password: 'Demo123!' }),
});
console.log('login status', login.status);
console.log('set-cookie raw', login.headers.get('set-cookie'));
console.log('getSetCookie', login.headers.getSetCookie?.());
const data = await login.json();
console.log('user', data.user?.email);

const cookieHeader = (login.headers.getSetCookie?.() || [])
  .map((c) => c.split(';')[0])
  .join('; ');
console.log('cookieHeader', cookieHeader);

const me = await fetch(`${base}/api/auth/me`, { headers: { Cookie: cookieHeader } });
console.log('me', me.status, await me.json());

const exp = await fetch(`${base}/api/reports/export?from=2026-10-01&to=2026-10-05`, {
  headers: { Cookie: cookieHeader },
});
console.log('export', exp.status, exp.headers.get('content-type'));
if (exp.ok) {
  console.log('bytes', (await exp.arrayBuffer()).byteLength);
} else {
  console.log('body', await exp.text());
}
