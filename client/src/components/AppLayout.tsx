import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { cn } from '../lib/utils';

const doctorLinks = [
  { to: '/hoy', label: 'Hoy' },
  { to: '/atendidos', label: 'Atendidos' },
  { to: '/reportes', label: 'Reportes' },
];

const adminLinks = [
  { to: '/admin', label: 'Dashboard' },
  { to: '/agenda', label: 'Agenda' },
  { to: '/atendidos', label: 'Atendidos' },
  { to: '/reportes', label: 'Reportes' },
  { to: '/importar', label: 'Importar' },
  { to: '/administracion', label: 'Administración' },
];

export function AppLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const links = user?.role === 'ADMIN' ? adminLinks : doctorLinks;

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 border-b border-white/70 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3">
          <div className="flex items-center gap-6">
            <Link to={user?.role === 'ADMIN' ? '/admin' : '/hoy'} className="font-display text-xl font-semibold text-brand-800">
              DermaOps
            </Link>
            <nav className="hidden items-center gap-1 md:flex">
              {links.map((l) => (
                <NavLink
                  key={l.to}
                  to={l.to}
                  className={({ isActive }) =>
                    cn(
                      'rounded-xl px-3 py-2 text-sm font-medium transition',
                      isActive ? 'bg-brand-50 text-brand-800' : 'text-slate-600 hover:bg-slate-50'
                    )
                  }
                >
                  {l.label}
                </NavLink>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <div className="text-sm font-semibold">{user?.name}</div>
              <div className="text-xs text-slate-500">{user?.role === 'ADMIN' ? 'Administrador' : 'Doctor'}</div>
            </div>
            <button
              className="btn-secondary"
              onClick={async () => {
                await logout();
                navigate('/login');
              }}
            >
              Salir
            </button>
          </div>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-4 pb-3 md:hidden">
          {links.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              className={({ isActive }) =>
                cn(
                  'whitespace-nowrap rounded-xl px-3 py-2 text-sm font-medium',
                  isActive ? 'bg-brand-50 text-brand-800' : 'text-slate-600'
                )
              }
            >
              {l.label}
            </NavLink>
          ))}
        </nav>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
