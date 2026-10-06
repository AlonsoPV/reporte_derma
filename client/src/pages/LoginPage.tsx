import { useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { api } from '../lib/api';
import { cn } from '../lib/utils';

type LoginMode = 'doctor' | 'admin';

export function LoginPage() {
  const { user, login, loading } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<LoginMode>('doctor');
  const [doctors, setDoctors] = useState<Array<{ id: string; name: string }>>([]);
  const [doctorId, setDoctorId] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const fieldId = 'access-key';

  useEffect(() => {
    api.get<{ doctors: Array<{ id: string; name: string }> }>('/api/auth/doctors')
      .then((r) => setDoctors(r.doctors))
      .catch(() => setDoctors([]));
  }, []);

  if (!loading && user) {
    return <Navigate to={user.role === 'ADMIN' ? '/admin' : '/agenda'} replace />;
  }

  const goHome = (role: string) => {
    navigate(role === 'ADMIN' ? '/admin' : '/agenda');
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="card w-full max-w-md p-8">
        <div className="mb-6">
          <div className="font-display text-3xl font-semibold text-brand-800">DermaOps</div>
          <p className="mt-2 text-slate-600">
            {mode === 'admin'
              ? 'El administrador ve toda la operación: agenda, atenciones, reportes e importación.'
              : 'El médico entra con su cuenta y contraseña. Solo ve su propia información.'}
          </p>
        </div>

        <div className="mb-6 grid grid-cols-2 rounded-xl bg-slate-100 p-1">
          <button
            type="button"
            className={cn('rounded-lg px-3 py-2 text-sm font-semibold', mode === 'doctor' ? 'bg-white text-brand-800 shadow-sm' : 'text-slate-500')}
            onClick={() => { setMode('doctor'); setError(''); setPassword(''); }}
          >
            Médico
          </button>
          <button
            type="button"
            className={cn('rounded-lg px-3 py-2 text-sm font-semibold', mode === 'admin' ? 'bg-white text-brand-800 shadow-sm' : 'text-slate-500')}
            onClick={() => { setMode('admin'); setError(''); setPassword(''); }}
          >
            Administrador
          </button>
        </div>

        <form
          className="space-y-4"
          autoComplete="off"
          onSubmit={async (e) => {
            e.preventDefault();
            setError('');
            setSubmitting(true);
            try {
              const u = mode === 'doctor'
                ? await login({ doctorId, password })
                : await login({ email, password });
              setPassword('');
              goHome(u.role);
            } catch (err) {
              setError(err instanceof Error ? err.message : 'Error al iniciar sesión');
            } finally {
              setSubmitting(false);
            }
          }}
        >
          {mode === 'doctor' ? (
            <div>
              <label className="label">Médico</label>
              <select
                className="input"
                value={doctorId}
                onChange={(e) => setDoctorId(e.target.value)}
                required
                autoComplete="off"
                name="medico-activo"
              >
                <option value="">Selecciona tu nombre</option>
                {doctors.map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            </div>
          ) : (
            <div>
              <label className="label">Correo</label>
              <input
                className="input"
                type="text"
                inputMode="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus
                autoComplete="off"
                name="admin-email"
              />
            </div>
          )}

          <div>
            <label className="label" htmlFor={fieldId}>Contraseña</label>
            <input
              id={fieldId}
              className="input-secret"
              type="text"
              inputMode="text"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              name={`k-${Date.now()}`}
              data-lpignore="true"
              data-1p-ignore="true"
              data-bwignore="true"
              data-form-type="other"
            />
          </div>
          {error && <div className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>}
          <button className="btn-primary w-full py-3 text-base" disabled={submitting}>
            {submitting ? 'Ingresando…' : 'Ingresar'}
          </button>
        </form>
      </div>
    </div>
  );
}
