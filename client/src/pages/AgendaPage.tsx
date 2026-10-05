import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../lib/api';
import { Badge } from '../components/Badge';
import { todayISO } from '../lib/utils';
import { useAuth } from '../auth/AuthContext';
import { STATUS_LABELS, type OperationalStatus } from '@shared/constants';

type Appointment = {
  id: string;
  appointmentDate: string;
  startTime: string;
  endTime?: string | null;
  patientName: string;
  phone?: string | null;
  email?: string | null;
  operationalStatus: string;
  attendanceConfirmation?: string | null;
  externalAppointmentId: string;
  notes?: string | null;
  doctorId?: string | null;
  doctor?: { name: string } | null;
};

export function AgendaPage() {
  const { user } = useAuth();
  const [params] = useSearchParams();
  const [date, setDate] = useState(params.get('date') || todayISO());
  const [doctorId, setDoctorId] = useState(params.get('doctorId') || '');
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  const [doctors, setDoctors] = useState<Array<{ id: string; name: string }>>([]);
  const [rows, setRows] = useState<Appointment[]>([]);
  const [selected, setSelected] = useState<Appointment | null>(null);
  const [form, setForm] = useState({
    patientName: '',
    phone: '',
    email: '',
    startTime: '',
    notes: '',
    attendanceConfirmation: '',
    operationalStatus: 'PENDING',
    doctorId: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (user?.role === 'ADMIN') {
      api.get<{ doctors: Array<{ id: string; name: string }> }>('/api/admin/doctors').then((r) => setDoctors(r.doctors));
    }
  }, [user?.role]);

  const load = async () => {
    const qs = new URLSearchParams();
    if (date) qs.set('date', date);
    if (doctorId) qs.set('doctorId', doctorId);
    if (status) qs.set('status', status);
    if (q) qs.set('q', q);
    const data = await api.get<{ appointments: Appointment[] }>(`/api/appointments?${qs}`);
    setRows(data.appointments);
  };

  useEffect(() => {
    load().catch(console.error);
  }, [date, doctorId, status]);

  const openEdit = (r: Appointment) => {
    setSelected(r);
    setError('');
    setForm({
      patientName: r.patientName,
      phone: r.phone || '',
      email: r.email || '',
      startTime: r.startTime,
      notes: r.notes || '',
      attendanceConfirmation: r.attendanceConfirmation || '',
      operationalStatus: r.operationalStatus,
      doctorId: r.doctorId || '',
    });
  };

  const save = async () => {
    if (!selected) return;
    if (!form.patientName.trim() || !form.startTime) {
      setError('Nombre y hora son obligatorios');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await api.patch(`/api/appointments/${selected.id}`, {
        patientName: form.patientName,
        phone: form.phone,
        email: form.email,
        startTime: form.startTime,
        notes: form.notes,
        attendanceConfirmation: form.attendanceConfirmation,
        operationalStatus: form.operationalStatus,
        doctorId: user?.role === 'ADMIN' ? form.doctorId || null : undefined,
      });
      setSelected(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-semibold">Agenda</h1>
        <p className="text-slate-600">Citas programadas con estado operativo interno</p>
      </div>

      <div className="card grid gap-3 p-4 md:grid-cols-5">
        <div>
          <label className="label">Fecha</label>
          <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        {user?.role === 'ADMIN' && (
          <div>
            <label className="label">Doctor</label>
            <select className="input" value={doctorId} onChange={(e) => setDoctorId(e.target.value)}>
              <option value="">Todos</option>
              {doctors.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </div>
        )}
        <div>
          <label className="label">Estado</label>
          <select className="input" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">Todos</option>
            <option value="PENDING">Pendiente</option>
            <option value="ATTENDED">Atendido</option>
            <option value="NO_SHOW">No atendido</option>
            <option value="CANCELLED">Cancelado</option>
            <option value="RESCHEDULED">Reagendado</option>
          </select>
        </div>
        <div>
          <label className="label">Buscar</label>
          <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nombre, teléfono, ID cita" />
        </div>
        <div className="flex items-end">
          <button className="btn-primary w-full" onClick={() => load()}>Filtrar</button>
        </div>
      </div>

      <div className="card overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-500">
            <tr>
              <th className="px-4 py-3">Hora</th>
              <th className="px-4 py-3">Paciente</th>
              <th className="px-4 py-3">Teléfono</th>
              {user?.role === 'ADMIN' && <th className="px-4 py-3">Doctor</th>}
              <th className="px-4 py-3">Estado</th>
              <th className="px-4 py-3">Asistencia</th>
              <th className="px-4 py-3">ID cita</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-slate-100">
                <td className="px-4 py-3 font-medium">{r.startTime}</td>
                <td className="px-4 py-3">{r.patientName}</td>
                <td className="px-4 py-3">{r.phone || '—'}</td>
                {user?.role === 'ADMIN' && <td className="px-4 py-3">{r.doctor?.name || 'Sin mapear'}</td>}
                <td className="px-4 py-3"><Badge status={r.operationalStatus} /></td>
                <td className="px-4 py-3">{r.attendanceConfirmation || '—'}</td>
                <td className="px-4 py-3 font-mono text-xs">{r.externalAppointmentId}</td>
                <td className="px-4 py-3">
                  <button className="btn-secondary" onClick={() => openEdit(r)}>Editar</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4">
          <div className="card max-h-[90vh] w-full max-w-lg overflow-y-auto p-6">
            <h2 className="font-display text-2xl font-semibold">Editar cita</h2>
            <p className="mt-1 text-sm text-slate-500">ID: {selected.externalAppointmentId}</p>
            <div className="mt-4 space-y-3">
              <div>
                <label className="label">Paciente *</label>
                <input className="input" value={form.patientName} onChange={(e) => setForm({ ...form, patientName: e.target.value })} />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="label">Teléfono</label>
                  <input className="input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
                </div>
                <div>
                  <label className="label">Hora *</label>
                  <input className="input" type="time" value={form.startTime} onChange={(e) => setForm({ ...form, startTime: e.target.value })} />
                </div>
              </div>
              <div>
                <label className="label">Correo</label>
                <input className="input" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </div>
              {user?.role === 'ADMIN' && (
                <div>
                  <label className="label">Doctor</label>
                  <select className="input" value={form.doctorId} onChange={(e) => setForm({ ...form, doctorId: e.target.value })}>
                    <option value="">Sin asignar</option>
                    {doctors.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                </div>
              )}
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="label">Estado operativo</label>
                  <select className="input" value={form.operationalStatus} onChange={(e) => setForm({ ...form, operationalStatus: e.target.value })}>
                    {(Object.keys(STATUS_LABELS) as OperationalStatus[]).map((s) => (
                      <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label">Asistencia Huli</label>
                  <input className="input" value={form.attendanceConfirmation} onChange={(e) => setForm({ ...form, attendanceConfirmation: e.target.value })} />
                </div>
              </div>
              <div>
                <label className="label">Notas</label>
                <textarea className="input min-h-[80px]" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
              </div>
              {error && <div className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>}
            </div>
            <div className="mt-6 flex gap-2">
              <button className="btn-secondary flex-1" onClick={() => setSelected(null)}>Cancelar</button>
              <button className="btn-primary flex-1" disabled={saving} onClick={save}>
                {saving ? 'Guardando…' : 'Guardar cambios'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
