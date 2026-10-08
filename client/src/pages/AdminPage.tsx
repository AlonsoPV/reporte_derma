import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { DemoDayLoader } from '../components/DemoDayLoader';

type Tab = 'users' | 'doctors' | 'imports' | 'closures' | 'audit';

export function AdminPage() {
  const [tab, setTab] = useState<Tab>('users');
  const [users, setUsers] = useState<any[]>([]);
  const [doctors, setDoctors] = useState<any[]>([]);
  const [mappings, setMappings] = useState<any[]>([]);
  const [imports, setImports] = useState<any[]>([]);
  const [closures, setClosures] = useState<any[]>([]);
  const [logs, setLogs] = useState<any[]>([]);
  const [message, setMessage] = useState('');

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
  }, [tab]);

  const tabs: Array<{ id: Tab; label: string }> = [
    { id: 'users', label: 'Usuarios' },
    { id: 'doctors', label: 'Doctores' },
    { id: 'imports', label: 'Importaciones' },
    { id: 'closures', label: 'Cierres' },
    { id: 'audit', label: 'Auditoría' },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-semibold">Administración</h1>
        <p className="text-slate-600">Usuarios, doctores, mapeos, importaciones, cierres y auditoría</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {tabs.map((t) => (
          <button key={t.id} className={tab === t.id ? 'btn-primary' : 'btn-secondary'} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      {message && <div className="rounded-xl bg-emerald-50 px-4 py-3 text-emerald-800">{message}</div>}

      <DemoDayLoader />

      {tab === 'users' && (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="card p-5 space-y-3">
            <h2 className="font-semibold">Crear usuario</h2>
            <input className="input" placeholder="Nombre" value={newUser.name} onChange={(e) => setNewUser({ ...newUser, name: e.target.value })} />
            <input className="input" placeholder="Correo" value={newUser.email} onChange={(e) => setNewUser({ ...newUser, email: e.target.value })} />
            <input className="input" type="password" placeholder="Contraseña" value={newUser.password} onChange={(e) => setNewUser({ ...newUser, password: e.target.value })} />
            <select className="input" value={newUser.role} onChange={(e) => setNewUser({ ...newUser, role: e.target.value })}>
              <option value="ADMIN">Administrador</option>
              <option value="DOCTOR">Doctor</option>
              <option value="RECEPTION">Recepción</option>
              <option value="SUPERVISOR">Supervisor</option>
              <option value="ACCOUNTING">Contabilidad</option>
            </select>
            <select className="input" value={newUser.doctorId} onChange={(e) => setNewUser({ ...newUser, doctorId: e.target.value })}>
              <option value="">Sin doctor relacionado</option>
              {doctors.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
            <button
              className="btn-primary"
              onClick={async () => {
                await api.post('/api/admin/users', { ...newUser, doctorId: newUser.doctorId || null });
                setMessage('Usuario creado');
                setNewUser({ name: '', email: '', password: '', role: 'DOCTOR', doctorId: '' });
                await load();
              }}
            >
              Crear
            </button>
          </div>
          <div className="card overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left text-slate-500">
                <tr>
                  <th className="px-4 py-3">Nombre</th>
                  <th className="px-4 py-3">Correo</th>
                  <th className="px-4 py-3">Rol</th>
                  <th className="px-4 py-3">Estatus</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className="border-t border-slate-100">
                    <td className="px-4 py-3">{u.name}</td>
                    <td className="px-4 py-3">{u.email}</td>
                    <td className="px-4 py-3">{u.role}</td>
                    <td className="px-4 py-3">{u.status}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1">
                        <button
                          className="btn-secondary"
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
                          className="btn-ghost"
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
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'doctors' && (
        <div className="space-y-4">
          <div className="card flex flex-wrap gap-2 p-5">
            <input className="input max-w-md" placeholder="Nombre del doctor" value={newDoctor} onChange={(e) => setNewDoctor(e.target.value)} />
            <button
              className="btn-primary"
              onClick={async () => {
                await api.post('/api/admin/doctors', { name: newDoctor });
                setNewDoctor('');
                setMessage('Doctor creado');
                await load();
              }}
            >
              Crear doctor
            </button>
          </div>
          <div className="card p-5">
            <h2 className="font-semibold">Doctores</h2>
            <ul className="mt-3 space-y-2 text-sm">
              {doctors.map((d) => (
                <li key={d.id} className="flex items-center justify-between border-b border-slate-100 py-2">
                  <span>{d.name} {d.active ? '' : '(inactivo)'}</span>
                  <div className="flex gap-1">
                    <button
                      className="btn-secondary"
                      onClick={() => {
                        setEditingDoctor(d);
                        setEditDoctorName(d.name);
                      }}
                    >
                      Editar
                    </button>
                    <button
                      className="btn-ghost"
                      onClick={async () => {
                        await api.patch(`/api/admin/doctors/${d.id}`, { active: !d.active });
                        await load();
                      }}
                    >
                      {d.active ? 'Desactivar' : 'Activar'}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
          <div className="card space-y-3 p-5">
            <h2 className="font-semibold">Mapeo nombre Excel → doctor</h2>
            <div className="flex flex-wrap gap-2">
              <input className="input max-w-sm" placeholder="Nombre exacto en Excel" value={newMapping.excelName} onChange={(e) => setNewMapping({ ...newMapping, excelName: e.target.value })} />
              <select className="input max-w-sm" value={newMapping.doctorId} onChange={(e) => setNewMapping({ ...newMapping, doctorId: e.target.value })}>
                <option value="">Doctor interno…</option>
                {doctors.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
              <button
                className="btn-primary"
                onClick={async () => {
                  await api.post('/api/admin/mappings', newMapping);
                  setNewMapping({ excelName: '', doctorId: '' });
                  setMessage('Mapeo guardado');
                  await load();
                }}
              >
                Guardar mapeo
              </button>
            </div>
            <ul className="text-sm">
              {mappings.map((m) => (
                <li key={m.id} className="border-b border-slate-100 py-2">
                  <strong>{m.excelName}</strong> → {m.doctor?.name}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {tab === 'imports' && (
        <div className="card overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-500">
              <tr>
                <th className="px-4 py-3">Archivo</th>
                <th className="px-4 py-3">Fecha</th>
                <th className="px-4 py-3">Usuario</th>
                <th className="px-4 py-3">Filas</th>
                <th className="px-4 py-3">Nuevos</th>
                <th className="px-4 py-3">Actualizados</th>
                <th className="px-4 py-3">Errores</th>
                <th className="px-4 py-3">Confirmado</th>
              </tr>
            </thead>
            <tbody>
              {imports.map((i) => (
                <tr key={i.id} className="border-t border-slate-100">
                  <td className="px-4 py-3">{i.filename}</td>
                  <td className="px-4 py-3">{new Date(i.uploadedAt).toLocaleString('es-MX')}</td>
                  <td className="px-4 py-3">{i.uploadedBy?.name}</td>
                  <td className="px-4 py-3">{i.rowsDetected}</td>
                  <td className="px-4 py-3">{i.createdCount}</td>
                  <td className="px-4 py-3">{i.updatedCount}</td>
                  <td className="px-4 py-3">{i.errorCount}</td>
                  <td className="px-4 py-3">{i.confirmed ? 'Sí' : 'No'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'closures' && (
        <div className="card overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-500">
              <tr>
                <th className="px-4 py-3">Fecha</th>
                <th className="px-4 py-3">Doctor</th>
                <th className="px-4 py-3">Total</th>
                <th className="px-4 py-3">Atendidos</th>
                <th className="px-4 py-3">Estado</th>
                <th className="px-4 py-3">Cerrado por</th>
              </tr>
            </thead>
            <tbody>
              {closures.map((c) => (
                <tr key={c.id} className="border-t border-slate-100">
                  <td className="px-4 py-3">{String(c.date).slice(0, 10)}</td>
                  <td className="px-4 py-3">{c.doctor?.name}</td>
                  <td className="px-4 py-3">{Number(c.totalAmount).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })}</td>
                  <td className="px-4 py-3">{c.attendedCount + c.walkInCount}</td>
                  <td className="px-4 py-3">{c.status}</td>
                  <td className="px-4 py-3">{c.closedBy?.name}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'audit' && (
        <div className="card overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-500">
              <tr>
                <th className="px-4 py-3">Fecha</th>
                <th className="px-4 py-3">Usuario</th>
                <th className="px-4 py-3">Acción</th>
                <th className="px-4 py-3">Entidad</th>
                <th className="px-4 py-3">ID</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((l) => (
                <tr key={l.id} className="border-t border-slate-100">
                  <td className="px-4 py-3 whitespace-nowrap">{new Date(l.timestamp).toLocaleString('es-MX')}</td>
                  <td className="px-4 py-3">{l.user?.name || '—'}</td>
                  <td className="px-4 py-3">{l.action}</td>
                  <td className="px-4 py-3">{l.entityType}</td>
                  <td className="px-4 py-3 font-mono text-xs">{l.entityId || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editingUser && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setEditingUser(null);
          }}
        >
          <div className="card w-full max-w-md space-y-3 p-6">
            <h3 className="font-display text-xl font-semibold">Editar usuario</h3>
            <input className="input" value={editUserForm.name} onChange={(e) => setEditUserForm({ ...editUserForm, name: e.target.value })} placeholder="Nombre" />
            <input className="input" value={editUserForm.email} onChange={(e) => setEditUserForm({ ...editUserForm, email: e.target.value })} placeholder="Correo" />
            <input className="input" type="password" value={editUserForm.password} onChange={(e) => setEditUserForm({ ...editUserForm, password: e.target.value })} placeholder="Nueva contraseña (opcional)" />
            <select className="input" value={editUserForm.role} onChange={(e) => setEditUserForm({ ...editUserForm, role: e.target.value })}>
              <option value="ADMIN">Administrador</option>
              <option value="DOCTOR">Doctor</option>
              <option value="RECEPTION">Recepción</option>
              <option value="SUPERVISOR">Supervisor</option>
              <option value="ACCOUNTING">Contabilidad</option>
            </select>
            <select className="input" value={editUserForm.doctorId} onChange={(e) => setEditUserForm({ ...editUserForm, doctorId: e.target.value })}>
              <option value="">Sin doctor relacionado</option>
              {doctors.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
            <select className="input" value={editUserForm.status} onChange={(e) => setEditUserForm({ ...editUserForm, status: e.target.value })}>
              <option value="ACTIVE">Activo</option>
              <option value="INACTIVE">Inactivo</option>
            </select>
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
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setEditingDoctor(null);
          }}
        >
          <div className="card w-full max-w-md space-y-3 p-6">
            <h3 className="font-display text-xl font-semibold">Editar doctor</h3>
            <input className="input" value={editDoctorName} onChange={(e) => setEditDoctorName(e.target.value)} />
            <div className="flex gap-2 pt-2">
              <button className="btn-secondary flex-1" onClick={() => setEditingDoctor(null)}>Cancelar</button>
              <button
                className="btn-primary flex-1"
                onClick={async () => {
                  await api.patch(`/api/admin/doctors/${editingDoctor.id}`, { name: editDoctorName });
                  setEditingDoctor(null);
                  setMessage('Doctor actualizado');
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
