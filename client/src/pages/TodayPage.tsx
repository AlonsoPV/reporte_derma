import { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../auth/AuthContext';
import { Badge } from '../components/Badge';
import { KpiGrid, money } from '../components/KpiGrid';
import { formatDisplayDate, todayISO } from '../lib/utils';
import { canSeeAll, isReadOnlyRole } from '@shared/constants';
import { isOnAgenda, isPendingOnAgenda } from '@shared/match';
import { huliAgendaStatus } from '@shared/huli';
import { compareTimes, toTime24h } from '@shared/time';
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
  isAttended?: boolean;
  attendance?: { id: string } | null;
};

type Attendance = {
  id: string;
  actualTime: string;
  patientName: string;
  treatment: string;
  amount: number | string;
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
  const canEdit = !isReadOnlyRole(user?.role);
  const date = todayISO();
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
    load().catch(console.error);
  }, []);

  const agenda = useMemo(
    () => (data?.appointments || [])
      .filter(isOnAgenda)
      .sort((a, b) => compareTimes(a.startTime, b.startTime) || a.patientName.localeCompare(b.patientName, 'es')),
    [data]
  );
  const pending = useMemo(
    () => agenda.filter(isPendingOnAgenda),
    [agenda]
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-semibold">Hoy</h1>
          <p className="text-slate-600 capitalize">
            {!canSeeAll(user?.role) && user?.name ? `${user.name} · ` : ''}
            {formatDisplayDate(date)}
          </p>
          <p className="mt-1 text-sm text-slate-500">
            {canEdit
              ? 'Solo para atender a los pacientes de hoy. El histórico está en Atendidos.'
              : 'Consulta de los pacientes de hoy. El histórico está en Atendidos.'}
          </p>
        </div>
      </div>

      {data && (
        <KpiGrid
          items={[
            { label: 'Citas programadas', value: data.kpis.scheduled },
            { label: 'Atendidos', value: data.kpis.attended, accent: 'text-emerald-700' },
            { label: 'Pendientes', value: data.kpis.pending, accent: 'text-amber-700' },
            { label: 'Monto del día', value: money(data.kpis.amount), accent: 'text-brand-700' },
          ]}
        />
      )}

      {canEdit && (
        <div className="flex flex-wrap gap-2">
          <button className="btn-primary" onClick={() => setWalkInOpen(true)} disabled={data?.isClosed}>
            + Paciente sin cita
          </button>
          <button className="btn-danger" onClick={() => setCloseOpen(true)} disabled={data?.isClosed}>
            {data?.isClosed ? 'Día cerrado' : 'Cerrar día'}
          </button>
        </div>
      )}

      {data?.isClosed && (
        <div className="rounded-2xl border border-brand-200 bg-brand-50 px-4 py-3 text-brand-900">
          <strong>Día cerrado.</strong> No se permiten más cambios. Un administrador debe reabrir el día para editar.
        </div>
      )}

      {error && <div className="rounded-xl bg-rose-50 px-4 py-3 text-rose-700">{error}</div>}
      {loading && <div className="text-slate-500">Cargando agenda…</div>}

      <div className="grid items-start gap-4 md:grid-cols-2">
        <section className="card flex max-h-[70vh] flex-col overflow-hidden">
          <div className="border-b border-slate-100 px-3 py-3">
            <h2 className="font-semibold">Por atender</h2>
            <p className="text-xs text-slate-500">{pending.length} pendientes · toca la fila para capturar</p>
          </div>
          <div className="min-h-0 flex-1 overflow-auto">
            {pending.map((appt) => {
              const canAttend = canEdit && !data?.isClosed;
              const huli = huliAgendaStatus(appt.sourceStatus, appt.attendanceConfirmation);
              return (
                <button
                  key={appt.id}
                  type="button"
                  disabled={!canAttend}
                  className="flex w-full items-center gap-3 border-t border-slate-100 px-3 py-2.5 text-left enabled:hover:bg-brand-50/70 disabled:cursor-default"
                  onClick={() => setSelected(appt)}
                >
                  <span className="w-14 shrink-0 text-base font-semibold tabular-nums text-brand-800">{toTime24h(appt.startTime)}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{appt.patientName || '—'}</span>
                    <span className="block truncate text-xs text-slate-500">
                      {[appt.phone, appt.notes].filter(Boolean).join(' · ') || 'Sin notas'}
                    </span>
                  </span>
                  {huli && <Badge status={huli.status} label={huli.label} className="shrink-0" />}
                  {canAttend ? (
                    <span className="btn-primary shrink-0 px-3 py-1.5">Atender</span>
                  ) : data?.isClosed ? (
                    <span className="shrink-0 text-xs font-semibold text-brand-700">Cerrado</span>
                  ) : null}
                </button>
              );
            })}
            {!loading && pending.length === 0 && (
              <div className="px-4 py-10 text-center text-sm text-slate-500">No hay pacientes pendientes.</div>
            )}
          </div>
        </section>

        <section className="flex max-h-[70vh] flex-col overflow-hidden rounded-2xl border-2 border-emerald-200 bg-white shadow-soft">
          <div className="border-b border-emerald-100 bg-emerald-50/70 px-3 py-3">
            <h2 className="font-semibold text-emerald-900">Atendidos de hoy</h2>
            <p className="text-xs text-emerald-800/80">El histórico de otros días está en Atendidos.</p>
          </div>
          <div className="min-h-0 flex-1 overflow-auto">
            {(data?.attendances || []).map((a) => (
              <div key={a.id} className="flex items-center gap-3 border-t border-slate-100 px-3 py-2.5">
                <span className="w-14 shrink-0 text-sm font-semibold tabular-nums">{toTime24h(a.actualTime)}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{a.patientName}</span>
                  <span className="block truncate text-xs text-slate-500">
                    {a.treatment} · {a.origin === 'WALK_IN' ? 'Sin cita' : 'Agendado'}
                  </span>
                </span>
                <span className="shrink-0 text-sm font-semibold text-emerald-800">{money(Number(a.amount))}</span>
              </div>
            ))}
            {!loading && (data?.attendances || []).length === 0 && (
              <div className="px-4 py-10 text-center text-sm text-emerald-800/70">Aún no hay pacientes atendidos hoy.</div>
            )}
          </div>
        </section>
      </div>

      {canEdit && selected && (
        <AttendModal
          appointment={selected}
          onClose={() => setSelected(null)}
          onSaved={async () => {
            setSelected(null);
            await load();
          }}
        />
      )}

      {canEdit && walkInOpen && (
        <WalkInModal
          date={date}
          onClose={() => setWalkInOpen(false)}
          onSaved={async () => {
            setWalkInOpen(false);
            await load();
          }}
        />
      )}

      {canEdit && closeOpen && data && (
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
