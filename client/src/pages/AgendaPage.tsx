import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../lib/api';
import { Badge } from '../components/Badge';
import { AttendModal } from '../components/AttendModal';
import { WalkInModal } from '../components/WalkInModal';
import { CloseDayModal } from '../components/CloseDayModal';
import { money } from '../components/KpiGrid';
import { formatDisplayDate, todayISO } from '../lib/utils';
import { useAuth } from '../auth/AuthContext';
import { canSeeAll, isReadOnlyRole, ORIGIN_LABELS } from '@shared/constants';

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
  const seesAll = canSeeAll(user?.role);
  const canEdit = !isReadOnlyRole(user?.role);
  const date = todayISO();
  const [searchParams] = useSearchParams();
  const [doctorId, setDoctorId] = useState(seesAll ? searchParams.get('doctorId') || '' : '');
  const [q, setQ] = useState('');
  const [doctors, setDoctors] = useState<Array<{ id: string; name: string }>>([]);
  const [data, setData] = useState<DayData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<Appointment | null>(null);
  const [walkInOpen, setWalkInOpen] = useState(false);
  const [closeOpen, setCloseOpen] = useState(false);
  const [listFilter, setListFilter] = useState<'pending' | 'other' | 'all'>('pending');

  const closeDoctorId = seesAll ? doctorId : user?.doctorId || '';
  const canClose = canEdit && Boolean(closeDoctorId);
  const dayLocked = Boolean(data?.isClosed);

  useEffect(() => {
    if (seesAll) {
      api.get<{ doctors: Array<{ id: string; name: string }> }>('/api/doctors').then((r) => setDoctors(r.doctors));
    }
  }, [seesAll]);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const qs = new URLSearchParams({ date });
      if (seesAll && doctorId) qs.set('doctorId', doctorId);
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
  }, [doctorId]);

  const matchesQuery = (value: string | null | undefined) => {
    if (!q.trim()) return true;
    return (value || '').toLowerCase().includes(q.trim().toLowerCase());
  };

  const agendaPool = useMemo(() => {
    const query = q.trim().toLowerCase();
    return (data?.appointments || [])
      .filter((a) => {
        if (a.operationalStatus === 'ATTENDED') return false;
        if (!query) return true;
        return [a.patientName, a.phone, a.externalAppointmentId, a.doctor?.name, a.notes]
          .some((value) => (value || '').toLowerCase().includes(query));
      })
      .sort((a, b) => a.startTime.localeCompare(b.startTime));
  }, [data, q]);

  const scheduled = useMemo(() => {
    return agendaPool.filter((a) => {
      if (listFilter === 'pending') return a.operationalStatus === 'PENDING';
      if (listFilter === 'other') return a.operationalStatus !== 'PENDING';
      return true;
    });
  }, [agendaPool, listFilter]);

  const pendingCount = agendaPool.filter((a) => a.operationalStatus === 'PENDING').length;

  const attended = useMemo(() => {
    return (data?.attendances || []).filter(
      (a) => matchesQuery(a.patientName) || matchesQuery(a.treatment)
    );
  }, [data, q]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold sm:text-3xl">Hoy</h1>
          <p className="text-sm text-slate-600">
            {seesAll
              ? `Toda la operación · ${formatDisplayDate(date)}`
              : `${user?.name || 'Tu agenda'} · ${formatDisplayDate(date)}`}
          </p>
        </div>
        <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:flex-wrap sm:items-center">
          {seesAll && (
            <select
              className="input col-span-2 w-full sm:w-auto sm:min-w-[200px]"
              value={doctorId}
              onChange={(e) => setDoctorId(e.target.value)}
              aria-label="Doctor"
            >
              <option value="">Todos los doctores</option>
              {doctors.map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          )}
          <input
            className="input col-span-2 sm:w-52"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar paciente…"
          />
          {canEdit && (
            <>
              <button
                className="btn-primary"
                disabled={dayLocked}
                onClick={() => setWalkInOpen(true)}
              >
                + Sin cita
              </button>
              <button
                className="btn-danger"
                disabled={!canClose || dayLocked}
                title={!canClose ? 'Selecciona un doctor para cerrar el día' : undefined}
                onClick={() => setCloseOpen(true)}
              >
                {dayLocked ? 'Día cerrado' : 'Cerrar día'}
              </button>
            </>
          )}
        </div>
      </div>

      {data?.isClosed && (
        <div className="rounded-2xl border border-brand-200 bg-brand-50 px-4 py-3 text-brand-900">
          <strong>Día cerrado.</strong> No se permiten más cambios. Un administrador debe reabrir el día para editar.
        </div>
      )}
      {canEdit && seesAll && !doctorId && (
        <p className="text-sm text-slate-500">Selecciona un doctor para cerrar su día.</p>
      )}

      {error && <div className="rounded-xl bg-rose-50 px-4 py-3 text-rose-700">{error}</div>}
      {loading && <div className="text-slate-500">Cargando tablero…</div>}

      <div className="grid items-start gap-4 md:grid-cols-2">
        <section className="card flex max-h-[70vh] flex-col overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-3 py-3">
            <div>
              <h2 className="font-semibold">Por atender</h2>
              <p className="text-xs text-slate-500">{pendingCount} pendientes · toca la fila para capturar</p>
            </div>
            <div className="flex flex-wrap rounded-xl bg-slate-100 p-1 text-xs font-semibold">
              {([
                ['pending', `Pendientes ${pendingCount}`],
                ['other', `Otros ${agendaPool.length - pendingCount}`],
                ['all', 'Todos'],
              ] as const).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  className={listFilter === id ? 'rounded-lg bg-white px-2.5 py-1 text-brand-800 shadow-sm' : 'rounded-lg px-2.5 py-1 text-slate-500'}
                  onClick={() => setListFilter(id)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-auto">
            {scheduled.map((r) => {
              const locked = data?.closedDoctorIds?.includes(r.doctorId || '') || data?.isClosed;
              const canAttend = canEdit && r.operationalStatus === 'PENDING' && !locked;
              return (
                <button
                  key={r.id}
                  type="button"
                  disabled={!canAttend}
                  className="flex w-full items-center gap-3 border-t border-slate-100 px-3 py-2.5 text-left enabled:hover:bg-brand-50/70 disabled:cursor-default"
                  onClick={() => setSelected(r)}
                >
                  <span className="w-12 shrink-0 text-base font-semibold tabular-nums text-brand-800">{r.startTime}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{r.patientName}</span>
                    <span className="block truncate text-xs text-slate-500">
                      {[seesAll ? r.doctor?.name : null, r.phone, r.notes].filter(Boolean).join(' · ') || 'Sin notas'}
                    </span>
                  </span>
                  {canAttend ? (
                    <span className="btn-primary shrink-0 px-3 py-1.5">Atender</span>
                  ) : locked && r.operationalStatus === 'PENDING' ? (
                    <span className="shrink-0 text-xs font-semibold text-brand-700">Cerrado</span>
                  ) : (
                    <Badge status={r.operationalStatus} />
                  )}
                </button>
              );
            })}
            {!loading && scheduled.length === 0 && (
              <div className="px-4 py-10 text-center text-sm text-slate-500">No hay pacientes en este filtro.</div>
            )}
          </div>
        </section>

        <section className="flex max-h-[70vh] flex-col overflow-hidden rounded-2xl border-2 border-emerald-200 bg-white shadow-soft">
          <div className="flex items-center justify-between gap-3 border-b border-emerald-100 bg-emerald-50/70 px-3 py-3">
            <div>
              <h2 className="font-semibold text-emerald-900">Atendidos hoy</h2>
              <p className="text-xs text-emerald-800/80">Procedimiento y monto del día</p>
            </div>
            <span className="rounded-full bg-white px-3 py-1 text-sm font-semibold text-emerald-800">{attended.length}</span>
          </div>
          <div className="min-h-0 flex-1 overflow-auto">
            {attended.map((a) => (
              <div key={a.id} className="flex items-center gap-3 border-t border-slate-100 px-3 py-2.5">
                <span className="w-12 shrink-0 text-sm font-semibold tabular-nums">{a.actualTime}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{a.patientName}</span>
                  <span className="block truncate text-xs text-slate-500">
                    {[a.treatment, seesAll ? a.doctor?.name : null, ORIGIN_LABELS[a.origin], a.notes].filter(Boolean).join(' · ')}
                  </span>
                </span>
                <span className="shrink-0 text-sm font-semibold text-emerald-800">{money(Number(a.amount))}</span>
              </div>
            ))}
            {!loading && attended.length === 0 && (
              <div className="px-4 py-10 text-center text-sm text-emerald-800/70">Aún no hay pacientes atendidos.</div>
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
          initialDoctorId={doctorId || undefined}
          onClose={() => setWalkInOpen(false)}
          onSaved={async () => {
            setWalkInOpen(false);
            await load();
          }}
        />
      )}
      {canEdit && closeOpen && (
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
