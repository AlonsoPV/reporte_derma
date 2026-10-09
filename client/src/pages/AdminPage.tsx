import { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import { DemoCleanup } from '../components/DemoCleanup';
import { Badge } from '../components/Badge';
import { money } from '../components/KpiGrid';
import { ROLE_LABELS, type Role } from '@shared/constants';

type Tab = 'users' | 'doctors' | 'imports' | 'closures' | 'audit';

const ROLE_OPTIONS: Role[] = ['ADMIN', 'DOCTOR', 'RECEPTION', 'SUPERVISOR', 'ACCOUNTING'];

export function AdminPage() {
  const [tab, setTab] = useState<Tab>('users');
  const [users, setUsers] = useState<any[]>([]);
  const [doctors, setDoctors] = useState<any[]>([]);
  const [mappings, setMappings] = useState<any[]>([]);
  const [imports, setImports] = useState<any[]>([]);
  const [closures, setClosures] = useState<any[]>([]);
  const [logs, setLogs] = useState<any[]>([]);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [showCreate, setShowCreate] = useState(false);

  const [newUser, setNewUser] = useState({ name: '', email: '', password: '', role: 'DOCTOR', doctorId: '' });
  const [editingUser, setEditingUser] = useState<any | null>(null);
  const [editUserForm, setEditUserForm] = useState({ name: '', email: '', password: '', role: 'DOCTOR', doctorId: '', status: 'ACTIVE' });
  const [newDoctor, setNewDoctor] = useState('');
  const [newMapping, setNewMapping] = useState({ excelName: '', doctorId: '' });
  const [editingDoctor, setEditingDoctor] = useState<any | null>(null);
  const [editDoctorName, setEditDoctorName] = useState('');

  const load = async () => {
    if (tab === 'users' || tab === 'doctors') {
      const [u, d, m] = await Promise.all([
        api.get<{ users: any[] }>('/api/admin/users'),
        api.get<{ doctors: any[] }>('/api/admin/doctors'),
        api.get<{ mappings: any[] }>('/api/admin/mappings'),
      ]);
      setUsers(u.users);
      setDoctors(d.doctors);
      setMappings(m.mappings);
    }
    if (tab === 'imports') {
      const i = await api.get<{ imports: any[] }>('/api/imports');
      setImports(i.imports);
    }
    if (tab === 'closures') {
      const c = await api.get<{ closures: any[] }>('/api/closures');
      setClosures(c.closures);
    }
    if (tab === 'audit') {
      const a = await api.get<{ logs: any[] }>('/api/admin/audit');
      setLogs(a.logs);
    }
  };

  useEffect(() => {
    load().catch(console.error);
    const refresh = () => { load().catch(console.error); };
    window.addEventListener('demo-cleanup-complete', refresh);
    return () => window.removeEventListener('demo-cleanup-complete', refresh);
  }, [tab]);

  const tabs: Array<{ id: Tab; label: string; count?: number }> = [
    { id: 'users', label: 'Usuarios', count: users.length },
    { id: 'doctors', label: 'Médicos', count: doctors.length },
    { id: 'imports', label: 'Importaciones', count: imports.length || undefined },
    { id: 'closures', label: 'Cierres', count: closures.length || undefined },
    { id: 'audit', label: 'Auditoría' },
  ];

  const roleLabel = (role: string) => ROLE_LABELS[role as Role] || role;

  const visibleUsers = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return users;
    return users.filter((u) =>
      [u.name, u.email, roleLabel(u.role), u.status]
        .some((value) => String(value || '').toLowerCase().includes(q))
    );
  }, [users, query]);

  const visibleDoctors = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return doctors;
    return doctors.filter((d) => String(d.name || '').toLowerCase().includes(q));
  }, [doctors, query]);

  const visibleMappings = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return mappings;
    return mappings.filter((m) =>
      [m.excelName, m.doctor?.name].some((value) => String(value || '').toLowerCase().includes(q))
    );
  }, [mappings, query]);

  const createUserForm = (
    <div className="card space-y-2.5 p-4 md:sticky md:top-[5.5rem]">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-semibold">Crear usuario</h2>
        <button type="button" className="btn-ghost px-2 py-1 text-xs md:hidden" onClick={() => setShowCreate(false)}>
          Cerrar
        </button>
      </div>
      <div>
        <label className="label">Nombre</label>
        <input className="input py-2" value={newUser.name} onChange={(e) => setNewUser({ ...newUser, name: e.target.value })} />
      </div>
      <div>
        <label className="label">Correo</label>
        <input className="input py-2" value={newUser.email} onChange={(e) => setNewUser({ ...newUser, email: e.target.value })} />
      </div>
      <div>
        <label className="label">Contraseña</label>
        <input className="input py-2" type="password" value={newUser.password} onChange={(e) => setNewUser({ ...newUser, password: e.target.value })} />
      </div>
      <div>
        <label className="label">Rol</label>
        <select className="input py-2" value={newUser.role} onChange={(e) => setNewUser({ ...newUser, role: e.target.value, doctorId: e.target.value === 'DOCTOR' ? newUser.doctorId : '' })}>
          {ROLE_OPTIONS.map((role) => (
            <option key={role} value={role}>{ROLE_LABELS[role]}</option>
          ))}
        </select>
      </div>
      {newUser.role === 'DOCTOR' && (
        <div>
          <label className="label">Médico relacionado</label>
          <select className="input py-2" value={newUser.doctorId} onChange={(e) => setNewUser({ ...newUser, doctorId: e.target.value })}>
            <option value="">Sin médico</option>
            {doctors.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </div>
      )}
      <button
        className="btn-primary w-full"
        onClick={async () => {
          setError('');
          try {
            await api.post('/api/admin/users', { ...newUser, doctorId: newUser.doctorId || null });
            setMessage('Usuario creado');
            setNewUser({ name: '', email: '', password: '', role: 'DOCTOR', doctorId: '' });
            setShowCreate(false);
            await load();
          } catch (e) {
            setError(e instanceof Error ? e.message : 'No se pudo crear');
          }
        }}
      >
        Crear
      </button>
    </div>
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold">Administración</h1>
          <p className="text-sm text-slate-600">Usuarios, médicos, mapeos, importaciones, cierres y auditoría</p>
        </div>
      </div>

      <div className="flex gap-1 overflow-x-auto rounded-xl bg-slate-100 p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            className={
              tab === t.id
                ? 'shrink-0 whitespace-nowrap rounded-lg bg-white px-3 py-2 text-sm font-semibold text-brand-800 shadow-sm md:flex-1'
                : 'shrink-0 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-semibold text-slate-500 md:flex-1'
            }
            onClick={() => {
              setTab(t.id);
              setMessage('');
              setError('');
              setQuery('');
              setShowCreate(false);
            }}
          >
            {t.label}
            {typeof t.count === 'number' ? <span className="ml-1 text-slate-400">{t.count}</span> : null}
          </button>
        ))}
      </div>

      {message && <div className="rounded-xl bg-emerald-50 px-4 py-2.5 text-sm text-emerald-800">{message}</div>}
      {error && <div className="rounded-xl bg-rose-50 px-4 py-2.5 text-sm text-rose-700">{error}</div>}

      <DemoCleanup />

      {tab === 'users' && (
        <div className={`grid items-start gap-3 ${showCreate ? 'md:grid-cols-[minmax(0,18rem)_1fr]' : ''}`}>
          {showCreate && <div className="md:order-none order-first">{createUserForm}</div>}

          <div className="card overflow-hidden">
            <div className="flex flex-col gap-2 border-b border-slate-100 p-3 sm:flex-row sm:items-center">
              <input
                className="input py-2 sm:min-w-0 sm:flex-1"
                placeholder="Buscar usuario, correo o rol"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              <button
                type="button"
                className="btn-primary shrink-0 px-3 py-2"
                onClick={() => setShowCreate((open) => !open)}
              >
                {showCreate ? 'Ocultar alta' : 'Nuevo usuario'}
              </button>
            </div>
            <div className="max-h-[62vh] overflow-auto">
              {visibleUsers.map((u) => (
                <div key={u.id} className="flex flex-col gap-2 border-b border-slate-100 px-3 py-2.5 sm:flex-row sm:items-center">
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{u.name}</div>
                    <div className="truncate text-xs text-slate-500">{u.email}{u.doctor?.name ? ` · ${u.doctor.name}` : ''}</div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge status={u.role} label={roleLabel(u.role)} />
                    <Badge status={u.status} label={u.status === 'ACTIVE' ? 'Activo' : 'Inactivo'} />
                    <div className="flex shrink-0 gap-1">
                      <button
                        className="btn-secondary px-2 py-1.5 text-xs"
                        onClick={() => {
                          setEditingUser(u);
                          setEditUserForm({
                            name: u.name,
                            email: u.email,
                            password: '',
                            role: u.role,
                            doctorId: u.doctorId || '',
                            status: u.status,
                          });
                        }}
                      >
                        Editar
                      </button>
                      <button
                        className="btn-ghost px-2 py-1.5 text-xs"
                        onClick={async () => {
                          await api.patch(`/api/admin/users/${u.id}`, {
                            status: u.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE',
                          });
                          await load();
                        }}
                      >
                        {u.status === 'ACTIVE' ? 'Desactivar' : 'Activar'}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
              {visibleUsers.length === 0 && (
                <div className="px-4 py-10 text-center text-sm text-slate-500">
                  {users.length === 0 ? 'Aún no hay usuarios.' : 'Ningún usuario coincide con la búsqueda.'}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {tab === 'doctors' && (
        <div className="grid items-start gap-3 md:grid-cols-2">
          <div className="card overflow-hidden">
            <div className="space-y-2 border-b border-slate-100 p-3">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-sm font-semibold">Médicos</h2>
                <span className="text-xs text-slate-500">{visibleDoctors.length}</span>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <input className="input py-2" placeholder="Nombre del médico" value={newDoctor} onChange={(e) => setNewDoctor(e.target.value)} />
                <button
                  className="btn-primary shrink-0 px-3 py-2"
                  onClick={async () => {
                    if (!newDoctor.trim()) return;
                    setError('');
                    try {
                      await api.post('/api/admin/doctors', { name: newDoctor });
                      setNewDoctor('');
                      setMessage('Médico creado');
                      await load();
                    } catch (e) {
                      setError(e instanceof Error ? e.message : 'No se pudo crear');
                    }
                  }}
                >
                  Crear
                </button>
              </div>
            </div>
            <div className="max-h-[55vh] overflow-auto">
              {visibleDoctors.map((d) => (
                <div key={d.id} className="flex flex-col gap-2 border-b border-slate-100 px-3 py-2.5 sm:flex-row sm:items-center">
                  <span className="min-w-0 flex-1 truncate font-medium">{d.name}</span>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge status={d.active ? 'ACTIVE' : 'INACTIVE'} label={d.active ? 'Activo' : 'Inactivo'} />
                    <div className="flex shrink-0 gap-1">
                      <button
                        className="btn-secondary px-2 py-1.5 text-xs"
                        onClick={() => {
                          setEditingDoctor(d);
                          setEditDoctorName(d.name);
                        }}
                      >
                        Editar
                      </button>
                      <button
                        className="btn-ghost px-2 py-1.5 text-xs"
                        onClick={async () => {
                          await api.patch(`/api/admin/doctors/${d.id}`, { active: !d.active });
                          await load();
                        }}
                      >
                        {d.active ? 'Desactivar' : 'Activar'}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="card overflow-hidden">
            <div className="space-y-2 border-b border-slate-100 p-3">
              <h2 className="text-sm font-semibold">Mapeo Excel → médico</h2>
              <div className="grid gap-2 sm:grid-cols-2">
                <input className="input py-2" placeholder="Nombre exacto en Excel" value={newMapping.excelName} onChange={(e) => setNewMapping({ ...newMapping, excelName: e.target.value })} />
                <select className="input py-2" value={newMapping.doctorId} onChange={(e) => setNewMapping({ ...newMapping, doctorId: e.target.value })}>
                  <option value="">Médico interno…</option>
                  {doctors.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </div>
              <button
                className="btn-primary w-full sm:w-auto px-3 py-2"
                onClick={async () => {
                  if (!newMapping.excelName.trim() || !newMapping.doctorId) return;
                  setError('');
                  try {
                    await api.post('/api/admin/mappings', newMapping);
                    setNewMapping({ excelName: '', doctorId: '' });
                    setMessage('Mapeo guardado');
                    await load();
                  } catch (e) {
                    setError(e instanceof Error ? e.message : 'No se pudo guardar');
                  }
                }}
              >
                Guardar mapeo
              </button>
            </div>
            <div className="max-h-[45vh] overflow-auto px-3">
              {visibleMappings.map((m) => (
                <div key={m.id} className="border-b border-slate-100 py-2 text-sm">
                  <span className="font-medium">{m.excelName}</span>
                  <span className="text-slate-400"> → </span>
                  <span className="text-slate-600">{m.doctor?.name}</span>
                </div>
              ))}
              {visibleMappings.length === 0 && (
                <div className="py-8 text-center text-sm text-slate-500">Sin mapeos todavía.</div>
              )}
            </div>
          </div>
        </div>
      )}

      {tab === 'imports' && (
        <div className="card max-h-[70vh] overflow-auto">
          {imports.map((i) => (
            <div key={i.id} className="flex flex-col gap-2 border-b border-slate-100 px-3 py-2.5 sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{i.filename}</div>
                <div className="text-xs text-slate-500">
                  {new Date(i.uploadedAt).toLocaleString('es-MX')} · {i.uploadedBy?.name || '—'}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-slate-500">
                  {i.rowsDetected} filas · {i.createdCount} nuevos · {i.updatedCount} act. · {i.errorCount} err.
                </span>
                <Badge status={i.confirmed ? 'ATTENDED' : 'PENDING'} label={i.confirmed ? 'Confirmado' : 'Pendiente'} />
              </div>
            </div>
          ))}
          {imports.length === 0 && (
            <div className="px-4 py-10 text-center text-sm text-slate-500">No hay importaciones.</div>
          )}
        </div>
      )}

      {tab === 'closures' && (
        <div className="card max-h-[70vh] overflow-auto">
          {closures.map((c) => (
            <div key={c.id} className="flex flex-col gap-2 border-b border-slate-100 px-3 py-2.5 sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1">
                <div className="font-medium">{c.doctor?.name}</div>
                <div className="text-xs text-slate-500">
                  {String(c.date).slice(0, 10)} · {c.attendedCount + c.walkInCount} atendidos · {c.closedBy?.name || '—'}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold">{money(Number(c.totalAmount))}</span>
                <Badge status={c.status} label={c.status === 'CLOSED' ? 'Cerrado' : 'Abierto'} />
              </div>
            </div>
          ))}
          {closures.length === 0 && (
            <div className="px-4 py-10 text-center text-sm text-slate-500">No hay cierres registrados.</div>
          )}
        </div>
      )}

      {tab === 'audit' && (
        <div className="card max-h-[70vh] overflow-auto">
          {logs.map((l) => (
            <div key={l.id} className="flex flex-col gap-1 border-b border-slate-100 px-3 py-2.5 sm:flex-row sm:items-center sm:gap-3">
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{l.action}</div>
                <div className="truncate text-xs text-slate-500">
                  {l.user?.name || '—'} · {l.entityType}{l.entityId ? ` · ${l.entityId}` : ''}
                </div>
              </div>
              <span className="shrink-0 text-xs text-slate-500">
                {new Date(l.timestamp).toLocaleString('es-MX')}
              </span>
            </div>
          ))}
          {logs.length === 0 && (
            <div className="px-4 py-10 text-center text-sm text-slate-500">Sin eventos de auditoría.</div>
          )}
        </div>
      )}

      {editingUser && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-0 sm:items-center sm:p-4"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setEditingUser(null);
          }}
        >
          <div className="card max-h-[92vh] w-full max-w-md space-y-3 overflow-y-auto rounded-b-none p-5 sm:rounded-2xl sm:p-6">
            <h3 className="font-display text-xl font-semibold">Editar usuario</h3>
            <div>
              <label className="label">Nombre</label>
              <input className="input py-2" value={editUserForm.name} onChange={(e) => setEditUserForm({ ...editUserForm, name: e.target.value })} />
            </div>
            <div>
              <label className="label">Correo</label>
              <input className="input py-2" value={editUserForm.email} onChange={(e) => setEditUserForm({ ...editUserForm, email: e.target.value })} />
            </div>
            <div>
              <label className="label">Nueva contraseña</label>
              <input className="input py-2" type="password" value={editUserForm.password} onChange={(e) => setEditUserForm({ ...editUserForm, password: e.target.value })} placeholder="Opcional" />
            </div>
            <div>
              <label className="label">Rol</label>
              <select className="input py-2" value={editUserForm.role} onChange={(e) => setEditUserForm({ ...editUserForm, role: e.target.value })}>
                {ROLE_OPTIONS.map((role) => (
                  <option key={role} value={role}>{ROLE_LABELS[role]}</option>
                ))}
              </select>
            </div>
            {editUserForm.role === 'DOCTOR' && (
              <div>
                <label className="label">Médico relacionado</label>
                <select className="input py-2" value={editUserForm.doctorId} onChange={(e) => setEditUserForm({ ...editUserForm, doctorId: e.target.value })}>
                  <option value="">Sin médico</option>
                  {doctors.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </div>
            )}
            <div>
              <label className="label">Estatus</label>
              <select className="input py-2" value={editUserForm.status} onChange={(e) => setEditUserForm({ ...editUserForm, status: e.target.value })}>
                <option value="ACTIVE">Activo</option>
                <option value="INACTIVE">Inactivo</option>
              </select>
            </div>
            <div className="flex gap-2 pt-2">
              <button className="btn-secondary flex-1" onClick={() => setEditingUser(null)}>Cancelar</button>
              <button
                className="btn-primary flex-1"
                onClick={async () => {
                  const body: Record<string, unknown> = {
                    name: editUserForm.name,
                    email: editUserForm.email,
                    role: editUserForm.role,
                    doctorId: editUserForm.doctorId || null,
                    status: editUserForm.status,
                  };
                  if (editUserForm.password) body.password = editUserForm.password;
                  await api.patch(`/api/admin/users/${editingUser.id}`, body);
                  setEditingUser(null);
                  setMessage('Usuario actualizado');
                  await load();
                }}
              >
                Guardar
              </button>
            </div>
          </div>
        </div>
      )}

      {editingDoctor && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-0 sm:items-center sm:p-4"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setEditingDoctor(null);
          }}
        >
          <div className="card w-full max-w-md space-y-3 rounded-b-none p-5 sm:rounded-2xl sm:p-6">
            <h3 className="font-display text-xl font-semibold">Editar médico</h3>
            <input className="input py-2" value={editDoctorName} onChange={(e) => setEditDoctorName(e.target.value)} />
            <div className="flex gap-2 pt-2">
              <button className="btn-secondary flex-1" onClick={() => setEditingDoctor(null)}>Cancelar</button>
              <button
                className="btn-primary flex-1"
                onClick={async () => {
                  await api.patch(`/api/admin/doctors/${editingDoctor.id}`, { name: editDoctorName });
                  setEditingDoctor(null);
                  setMessage('Médico actualizado');
                  await load();
                }}
              >
                Guardar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
