import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../lib/api';
import { Badge } from '../components/Badge';
import { DateQuickFilters } from '../components/DateQuickFilters';
import { AttendModal } from '../components/AttendModal';
import { WalkInModal } from '../components/WalkInModal';
import { CloseDayModal } from '../components/CloseDayModal';
import { money } from '../components/KpiGrid';
import { formatDisplayDate, todayISO } from '../lib/utils';
import { useAuth } from '../auth/AuthContext';
import { PAYMENT_LABELS, ORIGIN_LABELS } from '@shared/constants';

type Appointment = {
  id: string;
  startTime: string;
  patientName: string;
  phone?: string | null;
  email?: string | null;
  birthDate?: string | null;
  notes?: string | null;
  sourceStatus?: string | null;
  attendanceConfirmation?: string | null;
  operationalStatus: string;
  doctorId?: string | null;
  doctor?: { name: string } | null;
  externalAppointmentId?: string;
};

type Attendance = {
  id: string;
  actualTime: string;
  patientName: string;
  treatment: string;
  amount: number | string;
  paymentMethod: keyof typeof PAYMENT_LABELS;
  origin: keyof typeof ORIGIN_LABELS;
  notes?: string | null;
  doctor?: { name: string };
};

type DayData = {
  date: string;
  appointments: Appointment[];
  attendances: Attendance[];
  isClosed: boolean;
  closedDoctorIds?: string[];
};

export function AgendaPage() {
  const { user } = useAuth();
  const [params] = useSearchParams();
  const isAdmin = user?.role === 'ADMIN';
  const [date, setDate] = useState(params.get('date') || todayISO());
  const [doctorId, setDoctorId] = useState(isAdmin ? params.get('doctorId') || '' : '');
  const [q, setQ] = useState('');
  const [doctors, setDoctors] = useState<Array<{ id: string; name: string }>>([]);
  const [data, setData] = useState<DayData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<Appointment | null>(null);
  const [walkInOpen, setWalkInOpen] = useState(false);
  const [closeOpen, setCloseOpen] = useState(false);

  const isToday = date === todayISO();
  const closeDoctorId = user?.role === 'ADMIN' ? doctorId : user?.doctorId || '';
  const canClose = Boolean(closeDoctorId);
  const dayLocked = Boolean(data?.isClosed);

  useEffect(() => {
    if (user?.role === 'ADMIN') {
      api.get<{ doctors: Array<{ id: string; name: string }> }>('/api/admin/doctors').then((r) => setDoctors(r.doctors));
    }
  }, [user?.role]);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const qs = new URLSearchParams({ date });
      if (user?.role === 'ADMIN' && doctorId) qs.set('doctorId', doctorId);
      const res = await api.get<DayData>(`/api/day?${qs}`);
      setData(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cargar');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load().catch(console.error);
  }, [date, doctorId]);

  const matchesQuery = (value: string | null | undefined) => {
    if (!q.trim()) return true;
    return (value || '').toLowerCase().includes(q.trim().toLowerCase());
  };

  const scheduled = useMemo(() => {
    return (data?.appointments || []).filter((a) => {
      if (a.operationalStatus === 'ATTENDED') return false;
      return matchesQuery(a.patientName) || matchesQuery(a.phone) || matchesQuery(a.externalAppointmentId);
    });
  }, [data, q]);

  const attended = useMemo(() => {
    return (data?.attendances || []).filter(
      (a) => matchesQuery(a.patientName) || matchesQuery(a.treatment)
    );
  }, [data, q]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-semibold">
          {isToday ? 'Tablero para el día de hoy' : 'Agenda'}
        </h1>
        <p className="capitalize text-slate-600">
          {user?.role !== 'ADMIN' && user?.name ? `${user.name} · ` : ''}
          {formatDisplayDate(date)}
        </p>
      </div>

      <div className="card space-y-4 p-4">
        <DateQuickFilters mode="single" date={date} onChange={setDate} />
        <div className="grid gap-3 md:grid-cols-4">
          <div>
            <label className="label">Fecha</label>
            <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          {user?.role === 'ADMIN' && (
            <div>
              <label className="label">Doctor</label>
              <select className="input" value={doctorId} onChange={(e) => setDoctorId(e.target.value)}>
                <option value="">Todos</option>
                {doctors.map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            </div>
          )}
          <div className={user?.role === 'ADMIN' ? 'md:col-span-2' : 'md:col-span-3'}>
            <label className="label">Buscar</label>
            <input
              className="input"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Nombre, teléfono, ID cita"
            />
          </div>
        </div>
      </div>

      {data?.isClosed && (
        <div className="rounded-2xl border border-brand-200 bg-brand-50 px-4 py-3 text-brand-900">
          <strong>Día cerrado.</strong> No se permiten más cambios. Un administrador debe reabrir el día para editar.
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          className="btn-primary"
          disabled={dayLocked}
          onClick={() => setWalkInOpen(true)}
        >
          + Paciente nuevo
        </button>
        <button
          className="btn-danger"
          disabled={!canClose || dayLocked}
          title={!canClose ? 'Selecciona un doctor para cerrar el día' : undefined}
          onClick={() => setCloseOpen(true)}
        >
          {dayLocked ? 'Día cerrado' : 'Cerrar día'}
        </button>
        {user?.role === 'ADMIN' && !doctorId && (
          <span className="self-center text-sm text-slate-500">Selecciona un doctor para cerrar su día</span>
        )}
      </div>

      {error && <div className="rounded-xl bg-rose-50 px-4 py-3 text-rose-700">{error}</div>}
      {loading && <div className="text-slate-500">Cargando tablero…</div>}

      <section className="card overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold">Agendados</h2>
            <p className="text-sm text-slate-500">Selecciona un paciente, captura procedimiento, notas y monto</p>
          </div>
          <span className="rounded-full bg-amber-50 px-3 py-1 text-sm font-semibold text-amber-800">
            {scheduled.length}
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-500">
              <tr>
                <th className="px-4 py-3">Hora</th>
                <th className="px-4 py-3">Paciente</th>
                <th className="px-4 py-3">Teléfono</th>
                {user?.role === 'ADMIN' && <th className="px-4 py-3">Doctor</th>}
                <th className="px-4 py-3">Estado</th>
                <th className="px-4 py-3">Asistencia</th>
                <th className="px-4 py-3">Notas</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {scheduled.map((r) => {
                const locked = data?.closedDoctorIds?.includes(r.doctorId || '') || data?.isClosed;
                const canAttend = r.operationalStatus === 'PENDING' && !locked;
                return (
                <tr
                  key={r.id}
                  className={canAttend ? 'cursor-pointer border-t border-slate-100 hover:bg-brand-50/60' : 'border-t border-slate-100'}
                  onClick={() => {
                    if (canAttend) setSelected(r);
                  }}
                >
                  <td className="px-4 py-3 font-semibold tabular-nums text-brand-800">{r.startTime}</td>
                  <td className="px-4 py-3 font-medium">{r.patientName}</td>
                  <td className="px-4 py-3">{r.phone || '—'}</td>
                  {user?.role === 'ADMIN' && <td className="px-4 py-3">{r.doctor?.name || 'Sin mapear'}</td>}
                  <td className="px-4 py-3"><Badge status={r.operationalStatus} /></td>
                  <td className="px-4 py-3">{r.attendanceConfirmation || '—'}</td>
                  <td className="max-w-[220px] truncate px-4 py-3 text-slate-500">{r.notes || '—'}</td>
                  <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                    {r.operationalStatus === 'PENDING' ? (
                      locked ? (
                        <span className="text-xs font-semibold text-brand-700">Cerrado</span>
                      ) : (
                        <button className="btn-primary" onClick={() => setSelected(r)}>
                          Seleccionar
                        </button>
                      )
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                </tr>
                );
              })}
              {!loading && scheduled.length === 0 && (
                <tr>
                  <td className="px-4 py-10 text-center text-slate-500" colSpan={8}>
                    No hay pacientes agendados pendientes para este día.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border-2 border-emerald-200 bg-white shadow-soft">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-emerald-100 bg-emerald-50/70 px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold text-emerald-900">Atendidos</h2>
            <p className="text-sm text-emerald-800/80">Procedimiento, notas y monto cobrado del día</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-white px-3 py-1 text-sm font-semibold text-emerald-800">
              {attended.length}
            </span>
            <button
              className="btn-primary"
              disabled={dayLocked}
              onClick={() => setWalkInOpen(true)}
            >
              + Paciente nuevo
            </button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-500">
              <tr>
                <th className="px-4 py-3">Hora</th>
                <th className="px-4 py-3">Paciente</th>
                <th className="px-4 py-3">Procedimiento</th>
                <th className="px-4 py-3">Monto</th>
                <th className="px-4 py-3">Pago</th>
                {user?.role === 'ADMIN' && <th className="px-4 py-3">Doctor</th>}
                <th className="px-4 py-3">Origen</th>
                <th className="px-4 py-3">Notas</th>
              </tr>
            </thead>
            <tbody>
              {attended.map((a) => (
                <tr key={a.id} className="border-t border-slate-100">
                  <td className="px-4 py-3 font-medium">{a.actualTime}</td>
                  <td className="px-4 py-3 font-medium">{a.patientName}</td>
                  <td className="px-4 py-3">{a.treatment}</td>
                  <td className="px-4 py-3">{money(Number(a.amount))}</td>
                  <td className="px-4 py-3">{PAYMENT_LABELS[a.paymentMethod]}</td>
                  {user?.role === 'ADMIN' && <td className="px-4 py-3">{a.doctor?.name}</td>}
                  <td className="px-4 py-3">{ORIGIN_LABELS[a.origin]}</td>
                  <td className="max-w-[220px] truncate px-4 py-3 text-slate-500">{a.notes || '—'}</td>
                </tr>
              ))}
              {!loading && attended.length === 0 && (
                <tr>
                  <td className="px-4 py-12 text-center text-emerald-800/70" colSpan={8}>
                    Aún no hay pacientes atendidos.
                    <div className="mt-1 text-sm">Selecciona uno de Agendados o agrega un paciente nuevo.</div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {selected && (
        <AttendModal
          appointment={selected}
          onClose={() => setSelected(null)}
          onSaved={async () => {
            setSelected(null);
            await load();
          }}
        />
      )}
      {walkInOpen && (
        <WalkInModal
          date={date}
          initialDoctorId={doctorId || undefined}
          onClose={() => setWalkInOpen(false)}
          onSaved={async () => {
            setWalkInOpen(false);
            await load();
          }}
        />
      )}
      {closeOpen && (
        <CloseDayModal
          date={date}
          doctorId={closeDoctorId}
          onClose={() => setCloseOpen(false)}
          onClosed={async () => {
            setCloseOpen(false);
            await load();
          }}
        />
      )}
    </div>
  );
}
