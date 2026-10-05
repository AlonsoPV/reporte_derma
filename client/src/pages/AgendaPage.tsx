import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../lib/api';
import { Badge } from '../components/Badge';
import { todayISO } from '../lib/utils';
import { useAuth } from '../auth/AuthContext';

type Appointment = {
  id: string;
  appointmentDate: string;
  startTime: string;
  patientName: string;
  phone?: string | null;
  operationalStatus: string;
  attendanceConfirmation?: string | null;
  externalAppointmentId: string;
  notes?: string | null;
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
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
