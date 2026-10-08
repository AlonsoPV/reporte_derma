import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../auth/AuthContext';
import { Badge } from '../components/Badge';
import { money } from '../components/KpiGrid';
import { DateQuickFilters } from '../components/DateQuickFilters';
import { resolveDatePreset } from '../lib/utils';
import { canSeeAll, isReadOnlyRole, ORIGIN_LABELS } from '@shared/constants';

type Attendance = {
  id: string;
  actualTime: string;
  attendanceDate: string;
  patientName: string;
  treatment: string;
  amount: number | string;
  origin: keyof typeof ORIGIN_LABELS;
  phone?: string | null;
  email?: string | null;
  notes?: string | null;
  doctor?: { name: string };
  isDayClosed?: boolean;
};

export function AttendedPage() {
  const { user } = useAuth();
  const seesAll = canSeeAll(user?.role);
  const canEdit = !isReadOnlyRole(user?.role);
  const initialRange = resolveDatePreset('week');
  const [from, setFrom] = useState(initialRange.from);
  const [to, setTo] = useState(initialRange.to);
  const [q, setQ] = useState('');
  const [doctorId, setDoctorId] = useState('');
  const [doctors, setDoctors] = useState<Array<{ id: string; name: string }>>([]);
  const [rows, setRows] = useState<Attendance[]>([]);
  const [selected, setSelected] = useState<Attendance | null>(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    patientName: '',
    phone: '',
    email: '',
    actualTime: '',
    treatment: '',
    amount: '',
    notes: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (seesAll) {
      api.get<{ doctors: Array<{ id: string; name: string }> }>('/api/doctors').then((r) => setDoctors(r.doctors));
    }
  }, [seesAll]);

  const load = async () => {
    const params = new URLSearchParams({ from, to });
    if (q) params.set('q', q);
    if (seesAll && doctorId) params.set('doctorId', doctorId);
    const data = await api.get<{ attendances: Attendance[] }>(`/api/attendances?${params}`);
    setRows(data.attendances);
  };

  useEffect(() => {
    load().catch(console.error);
  }, [from, to, doctorId]);

  const openDetail = (r: Attendance, startEditing = false) => {
    setSelected(r);
    setEditing(canEdit && startEditing && !r.isDayClosed);
    setError('');
    setForm({
      patientName: r.patientName,
      phone: r.phone || '',
      email: r.email || '',
      actualTime: r.actualTime,
      treatment: r.treatment,
      amount: String(r.amount),
      notes: r.notes || '',
    });
  };

  const save = async () => {
    if (!selected) return;
    if (selected.isDayClosed) {
      setError('El día está cerrado. No se puede editar.');
      setEditing(false);
      return;
    }
    if (!form.patientName.trim() || !form.treatment.trim() || Number(form.amount) <= 0) {
      setError('Nombre, tratamiento y monto son obligatorios');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await api.patch(`/api/attendances/${selected.id}`, {
        patientName: form.patientName,
        phone: form.phone,
        email: form.email,
        actualTime: form.actualTime,
        treatment: form.treatment,
        amount: Number(form.amount),
        notes: form.notes,
      });
      setSelected(null);
      setEditing(false);
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
        <h1 className="font-display text-3xl font-semibold">Pacientes atendidos</h1>
        <p className="text-slate-600">
          {seesAll
            ? canEdit
              ? 'Histórico de toda la operación. Los días cerrados solo se consultan.'
              : 'Histórico de toda la operación. Solo consulta, sin editar.'
            : 'Solo tu histórico de atenciones. Los días cerrados no se pueden editar.'}
        </p>
      </div>

      <div className="card space-y-4 p-4">
        <DateQuickFilters
          from={from}
          to={to}
          onChange={({ from: f, to: t }) => {
            setFrom(f);
            setTo(t);
          }}
        />
        <div className="grid gap-3 md:grid-cols-5">
          <div>
            <label className="label">Desde</label>
            <input className="input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <label className="label">Hasta</label>
            <input className="input" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          {seesAll && (
            <div>
              <label className="label">Doctor</label>
              <select className="input" value={doctorId} onChange={(e) => setDoctorId(e.target.value)}>
                <option value="">Todos</option>
                {doctors.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
          )}
          <div className={seesAll ? '' : 'md:col-span-2'}>
            <label className="label">Buscar</label>
            <input className="input" placeholder="Nombre, teléfono, tratamiento" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <div className="flex items-end">
            <button className="btn-primary w-full" onClick={() => load()}>Buscar</button>
          </div>
        </div>
      </div>

      <div className="card overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-500">
            <tr>
              <th className="px-4 py-3">Fecha</th>
              <th className="px-4 py-3">Hora</th>
              <th className="px-4 py-3">Paciente</th>
              <th className="px-4 py-3">Tratamiento</th>
              <th className="px-4 py-3">Monto</th>
              {seesAll && <th className="px-4 py-3">Doctor</th>}
              <th className="px-4 py-3">Origen</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-slate-100">
                <td className="px-4 py-3">{String(r.attendanceDate).slice(0, 10)}</td>
                <td className="px-4 py-3">{r.actualTime}</td>
                <td className="px-4 py-3 font-medium">{r.patientName}</td>
                <td className="px-4 py-3">{r.treatment}</td>
                <td className="px-4 py-3">{money(Number(r.amount))}</td>
                {seesAll && <td className="px-4 py-3">{r.doctor?.name}</td>}
                <td className="px-4 py-3"><Badge status={r.origin === 'WALK_IN' ? 'RESCHEDULED' : 'ATTENDED'} label={ORIGIN_LABELS[r.origin]} /></td>
                <td className="px-4 py-3">
                  <div className="flex gap-1">
                    <button className="btn-ghost" onClick={() => openDetail(r, false)}>Ver</button>
                    {r.isDayClosed ? (
                      <span className="self-center text-xs font-semibold text-brand-700">Cerrado</span>
                    ) : canEdit ? (
                      <button className="btn-secondary" onClick={() => openDetail(r, true)}>Editar</button>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td className="px-4 py-10 text-center text-slate-500" colSpan={seesAll ? 8 : 7}>
                  No hay atenciones en este periodo.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4">
          <div className="card max-h-[90vh] w-full max-w-lg overflow-y-auto p-6">
            <div className="flex items-start justify-between gap-3">
              <h2 className="font-display text-2xl font-semibold">
                {editing ? 'Editar atención' : selected.patientName}
              </h2>
              {canEdit && !editing && !selected.isDayClosed && (
                <button className="btn-primary" onClick={() => setEditing(true)}>Editar</button>
              )}
            </div>

            {selected.isDayClosed && (
              <div className="mt-3 rounded-xl border border-brand-200 bg-brand-50 px-3 py-2 text-sm text-brand-900">
                Día cerrado. Solo consulta. Un administrador debe reabrir el día para editar.
              </div>
            )}

            {!editing ? (
              <div className="mt-4 space-y-2 text-sm">
                <div>Tratamiento: <strong>{selected.treatment}</strong></div>
                <div>Monto: <strong>{money(Number(selected.amount))}</strong></div>
                <div>Hora: {selected.actualTime}</div>
                <div>Origen: {ORIGIN_LABELS[selected.origin]}</div>
                <div>Teléfono: {selected.phone || '—'}</div>
                <div>Correo: {selected.email || '—'}</div>
                <div>Notas: {selected.notes || '—'}</div>
              </div>
            ) : (
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
                    <input className="input" type="time" value={form.actualTime} onChange={(e) => setForm({ ...form, actualTime: e.target.value })} />
                  </div>
                </div>
                <div>
                  <label className="label">Correo</label>
                  <input className="input" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
                </div>
                <div>
                  <label className="label">Tratamiento *</label>
                  <input className="input" value={form.treatment} onChange={(e) => setForm({ ...form, treatment: e.target.value })} />
                </div>
                <div>
                  <label className="label">Monto *</label>
                  <input className="input" type="number" min="0.01" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
                </div>
                <div>
                  <label className="label">Observaciones</label>
                  <textarea className="input min-h-[80px]" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
                </div>
                {error && <div className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>}
              </div>
            )}

            <div className="mt-6 flex gap-2">
              <button
                className="btn-secondary flex-1"
                onClick={() => {
                  setSelected(null);
                  setEditing(false);
                  setError('');
                }}
              >
                Cerrar
              </button>
              {editing && (
                <button className="btn-primary flex-1" disabled={saving} onClick={save}>
                  {saving ? 'Guardando…' : 'Guardar cambios'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
