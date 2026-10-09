import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { cn } from '../lib/utils';
import { homePathForRole, isReadOnlyRole } from '@shared/constants';

const doctorLinks = [
  { to: '/hoy', label: 'Hoy' },
  { to: '/atendidos', label: 'Atendidos' },
  { to: '/reportes', label: 'Reportes' },
];

const receptionLinks = [
  { to: '/admin', label: 'Dashboard' },
  { to: '/agenda', label: 'Agenda' },
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

function roleCaption(role?: string) {
  if (role === 'ADMIN') return 'Administrador · toda la operación';
  if (isReadOnlyRole(role)) return 'Recepción · consulta, sin editar';
  return 'Médico · solo tu información';
}

export function AppLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const links = user?.role === 'ADMIN' ? adminLinks : isReadOnlyRole(user?.role) ? receptionLinks : doctorLinks;

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 border-b border-white/70 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3">
          <div className="flex items-center gap-6">
            <Link to={homePathForRole(user?.role)} className="font-display text-xl font-semibold text-brand-800">
              DermaOps
            </Link>
            <nav className="hidden items-center gap-1 xl:flex">
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
            <div className="hidden text-right sm:block">
              <div className="text-sm font-semibold">{user?.name}</div>
              <div className="max-w-[14rem] truncate text-xs text-slate-500">
                {roleCaption(user?.role)}
              </div>
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
        <nav className="flex gap-1 overflow-x-auto px-4 pb-3 xl:hidden">
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
      <main className="mx-auto max-w-7xl px-4 py-4 sm:py-6">
        {isReadOnlyRole(user?.role) && (
          <div className="mb-6 rounded-2xl border border-brand-200 bg-brand-50 px-4 py-3 text-sm text-brand-900">
            Cuenta de recepción: puedes ver toda la operación. No se permiten cambios.
          </div>
        )}
        <Outlet />
      </main>
    </div>
  );
}
