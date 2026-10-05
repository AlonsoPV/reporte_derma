import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../auth/AuthContext';
import { Badge } from '../components/Badge';
import { money } from '../components/KpiGrid';
import { todayISO } from '../lib/utils';
import { PAYMENT_LABELS, ORIGIN_LABELS } from '@shared/constants';

type Attendance = {
  id: string;
  actualTime: string;
  attendanceDate: string;
  patientName: string;
  treatment: string;
  amount: number | string;
  paymentMethod: keyof typeof PAYMENT_LABELS;
  origin: keyof typeof ORIGIN_LABELS;
  phone?: string | null;
  notes?: string | null;
  doctor?: { name: string };
};

export function AttendedPage() {
  const { user } = useAuth();
  const [from, setFrom] = useState(todayISO());
  const [to, setTo] = useState(todayISO());
  const [q, setQ] = useState('');
  const [doctorId, setDoctorId] = useState('');
  const [doctors, setDoctors] = useState<Array<{ id: string; name: string }>>([]);
  const [rows, setRows] = useState<Attendance[]>([]);
  const [selected, setSelected] = useState<Attendance | null>(null);

  useEffect(() => {
    if (user?.role === 'ADMIN') {
      api.get<{ doctors: Array<{ id: string; name: string }> }>('/api/admin/doctors').then((r) => setDoctors(r.doctors));
    }
  }, [user?.role]);

  const load = async () => {
    const params = new URLSearchParams({ from, to });
    if (q) params.set('q', q);
    if (doctorId) params.set('doctorId', doctorId);
    const data = await api.get<{ attendances: Attendance[] }>(`/api/attendances?${params}`);
    setRows(data.attendances);
  };

  useEffect(() => {
    load().catch(console.error);
  }, [from, to, doctorId]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-semibold">Pacientes atendidos</h1>
        <p className="text-slate-600">Historial de atenciones con origen agendado o sin cita</p>
      </div>

      <div className="card grid gap-3 p-4 md:grid-cols-5">
        <div>
          <label className="label">Desde</label>
          <input className="input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div>
          <label className="label">Hasta</label>
          <input className="input" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
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
        <div className={user?.role === 'ADMIN' ? '' : 'md:col-span-2'}>
          <label className="label">Buscar</label>
          <input className="input" placeholder="Nombre, teléfono, tratamiento" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="flex items-end">
          <button className="btn-primary w-full" onClick={() => load()}>Buscar</button>
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
              <th className="px-4 py-3">Pago</th>
              {user?.role === 'ADMIN' && <th className="px-4 py-3">Doctor</th>}
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
                <td className="px-4 py-3">{PAYMENT_LABELS[r.paymentMethod]}</td>
                {user?.role === 'ADMIN' && <td className="px-4 py-3">{r.doctor?.name}</td>}
                <td className="px-4 py-3"><Badge status={r.origin === 'WALK_IN' ? 'RESCHEDULED' : 'ATTENDED'} label={ORIGIN_LABELS[r.origin]} /></td>
                <td className="px-4 py-3"><button className="btn-ghost" onClick={() => setSelected(r)}>Detalle</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4">
          <div className="card w-full max-w-lg p-6">
            <h2 className="font-display text-2xl font-semibold">{selected.patientName}</h2>
            <div className="mt-4 space-y-2 text-sm">
              <div>Tratamiento: <strong>{selected.treatment}</strong></div>
              <div>Monto: <strong>{money(Number(selected.amount))}</strong></div>
              <div>Pago: {PAYMENT_LABELS[selected.paymentMethod]}</div>
              <div>Origen: {ORIGIN_LABELS[selected.origin]}</div>
              <div>Teléfono: {selected.phone || '—'}</div>
              <div>Notas: {selected.notes || '—'}</div>
            </div>
            <button className="btn-secondary mt-6 w-full" onClick={() => setSelected(null)}>Cerrar</button>
          </div>
        </div>
      )}
    </div>
  );
}
