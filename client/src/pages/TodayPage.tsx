import { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../auth/AuthContext';
import { Badge } from '../components/Badge';
import { KpiGrid, money } from '../components/KpiGrid';
import { formatDisplayDate, shiftDate, todayISO } from '../lib/utils';
import { AttendModal } from '../components/AttendModal';
import { WalkInModal } from '../components/WalkInModal';
import { CloseDayModal } from '../components/CloseDayModal';

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
};

type Attendance = {
  id: string;
  actualTime: string;
  patientName: string;
  treatment: string;
  amount: number | string;
  paymentMethod: string;
  origin: string;
  doctor?: { name: string };
};

type DayData = {
  date: string;
  kpis: {
    scheduled: number;
    attended: number;
    pending: number;
    cancelledOrNoShow: number;
    amount: number;
    walkIns: number;
  };
  appointments: Appointment[];
  attendances: Attendance[];
  isClosed: boolean;
  closure: { id: string; status: string } | null;
};

export function TodayPage() {
  const { user } = useAuth();
  const [date, setDate] = useState(todayISO());
  const [data, setData] = useState<DayData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<Appointment | null>(null);
  const [walkInOpen, setWalkInOpen] = useState(false);
  const [closeOpen, setCloseOpen] = useState(false);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get<DayData>(`/api/day?date=${date}`);
      setData(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cargar');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [date]);

  const pending = useMemo(
    () => data?.appointments.filter((a) => a.operationalStatus === 'PENDING') || [],
    [data]
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-semibold">Hoy</h1>
          <p className="text-slate-600 capitalize">
            {user?.role !== 'ADMIN' && user?.name ? `${user.name} · ` : ''}
            {formatDisplayDate(date)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button className="btn-secondary" onClick={() => setDate((d) => shiftDate(d, -1))}>
            ← Anterior
          </button>
          <button className="btn-secondary" onClick={() => setDate(todayISO())}>
            HOY
          </button>
          <button className="btn-secondary" onClick={() => setDate((d) => shiftDate(d, 1))}>
            Siguiente →
          </button>
        </div>
      </div>

      {data && (
        <KpiGrid
          items={[
            { label: 'Citas programadas', value: data.kpis.scheduled },
            { label: 'Atendidos', value: data.kpis.attended, accent: 'text-emerald-700' },
            { label: 'Pendientes', value: data.kpis.pending, accent: 'text-amber-700' },
            { label: 'Cancelados / no atendidos', value: data.kpis.cancelledOrNoShow },
            { label: 'Monto del día', value: money(data.kpis.amount), accent: 'text-brand-700' },
          ]}
        />
      )}

      <div className="flex flex-wrap gap-2">
        <button className="btn-primary" onClick={() => setWalkInOpen(true)} disabled={data?.isClosed}>
          + Paciente sin cita
        </button>
        <button className="btn-danger" onClick={() => setCloseOpen(true)} disabled={data?.isClosed}>
          {data?.isClosed ? 'Día cerrado' : 'Cerrar día'}
        </button>
      </div>

      {data?.isClosed && (
        <div className="rounded-2xl border border-brand-200 bg-brand-50 px-4 py-3 text-brand-900">
          <strong>Día cerrado.</strong> No se permiten más cambios. Un administrador debe reabrir el día para editar.
        </div>
      )}

      {error && <div className="rounded-xl bg-rose-50 px-4 py-3 text-rose-700">{error}</div>}
      {loading && <div className="text-slate-500">Cargando agenda…</div>}

      <section className="card overflow-hidden">
        <div className="border-b border-slate-100 px-5 py-4">
          <h2 className="text-lg font-semibold">Agenda del día</h2>
          <p className="text-sm text-slate-500">{pending.length} pendientes por atender</p>
        </div>
        <div className="divide-y divide-slate-100">
          {(data?.appointments || []).map((appt) => (
            <div key={appt.id} className="flex flex-wrap items-center justify-between gap-4 px-5 py-4">
              <div className="min-w-[220px]">
                <div className="text-2xl font-semibold tabular-nums text-brand-800">{appt.startTime}</div>
                <div className="mt-1 text-lg font-medium">{appt.patientName}</div>
                <div className="text-sm text-slate-500">{appt.phone || 'Sin teléfono'}</div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge status={appt.operationalStatus} />
                {appt.attendanceConfirmation && (
                  <Badge
                    status={appt.attendanceConfirmation.toUpperCase().includes('CONFIRM') ? 'CONFIRMADA' : 'PENDING'}
                    label={appt.attendanceConfirmation}
                  />
                )}
              </div>
              <div className="max-w-sm text-sm text-slate-600">
                {appt.notes ? `Notas: ${appt.notes}` : 'Sin notas'}
              </div>
              <div>
                {appt.operationalStatus === 'PENDING' ? (
                  <button
                    className="btn-primary"
                    disabled={data?.isClosed}
                    onClick={() => setSelected(appt)}
                  >
                    Atender
                  </button>
                ) : (
                  <span className="text-sm text-slate-400">—</span>
                )}
              </div>
            </div>
          ))}
          {!loading && data?.appointments.length === 0 && (
            <div className="px-5 py-10 text-center text-slate-500">No hay citas para este día.</div>
          )}
        </div>
      </section>

      <section className="card overflow-hidden">
        <div className="border-b border-slate-100 px-5 py-4">
          <h2 className="text-lg font-semibold">Pacientes atendidos</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-500">
              <tr>
                <th className="px-5 py-3 font-medium">Hora</th>
                <th className="px-5 py-3 font-medium">Paciente</th>
                <th className="px-5 py-3 font-medium">Tratamiento</th>
                <th className="px-5 py-3 font-medium">Monto</th>
                <th className="px-5 py-3 font-medium">Pago</th>
                <th className="px-5 py-3 font-medium">Origen</th>
              </tr>
            </thead>
            <tbody>
              {(data?.attendances || []).map((a) => (
                <tr key={a.id} className="border-t border-slate-100">
                  <td className="px-5 py-3 font-medium">{a.actualTime}</td>
                  <td className="px-5 py-3">{a.patientName}</td>
                  <td className="px-5 py-3">{a.treatment}</td>
                  <td className="px-5 py-3">{money(Number(a.amount))}</td>
                  <td className="px-5 py-3">{a.paymentMethod}</td>
                  <td className="px-5 py-3">{a.origin === 'WALK_IN' ? 'Sin cita' : 'Agendado'}</td>
                </tr>
              ))}
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
          onClose={() => setWalkInOpen(false)}
          onSaved={async () => {
            setWalkInOpen(false);
            await load();
          }}
        />
      )}

      {closeOpen && data && (
        <CloseDayModal
          date={date}
          doctorId={user?.doctorId}
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
