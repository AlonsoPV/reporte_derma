import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

export function LoginPage() {
  const { user, login, loading } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (!loading && user) {
    return <Navigate to={user.role === 'ADMIN' ? '/admin' : '/hoy'} replace />;
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="card w-full max-w-md p-8">
        <div className="mb-8">
          <div className="font-display text-3xl font-semibold text-brand-800">DermaOps</div>
          <p className="mt-2 text-slate-600">Control diario de citas, atenciones e ingresos.</p>
        </div>
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setError('');
            setSubmitting(true);
            try {
              const u = await login(email, password);
              navigate(u.role === 'ADMIN' ? '/admin' : '/hoy');
            } catch (err) {
              setError(err instanceof Error ? err.message : 'Error al iniciar sesión');
            } finally {
              setSubmitting(false);
            }
          }}
        >
          <div>
            <label className="label">Correo</label>
            <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
          </div>
          <div>
            <label className="label">Contraseña</label>
            <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </div>
          {error && <div className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>}
          <button className="btn-primary w-full py-3 text-base" disabled={submitting}>
            {submitting ? 'Ingresando…' : 'Ingresar'}
          </button>
        </form>
        <p className="mt-6 text-xs text-slate-500">Demo: admin@clinicademo.local / Demo123!</p>
      </div>
    </div>
  );
}
