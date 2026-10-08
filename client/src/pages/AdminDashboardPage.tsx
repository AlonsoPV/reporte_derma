import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { KpiGrid, money } from '../components/KpiGrid';
import { Badge } from '../components/Badge';
import { todayISO, shiftDate, formatDisplayDate } from '../lib/utils';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { isReadOnlyRole } from '@shared/constants';

type AdminDash = {
  date: string;
  kpis: {
    patientsToday: number;
    attended: number;
    pending: number;
    noShow: number;
    amount: number;
    ticketAvg: number;
  };
  byDoctor: Array<{
    doctor: { id: string; name: string };
    scheduled: number;
    attended: number;
    pending: number;
    amount: number;
    ticketAvg: number;
    closureStatus: string;
    closureId: string | null;
  }>;
};

export function AdminDashboardPage() {
  const { user } = useAuth();
  const canEdit = !isReadOnlyRole(user?.role);
  const [date, setDate] = useState(todayISO());
  const [data, setData] = useState<AdminDash | null>(null);
  const [reopenId, setReopenId] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');

  const load = async () => {
    const res = await api.get<AdminDash>(`/api/reports/dashboard-admin?date=${date}`);
    setData(res);
  };

  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, [date]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-semibold">Dashboard administrativo</h1>
          <p className="text-slate-600">{formatDisplayDate(date)}</p>
        </div>
        <div className="flex gap-2">
          <button className="btn-secondary" onClick={() => setDate((d) => shiftDate(d, -1))}>←</button>
          <button className="btn-secondary" onClick={() => setDate(todayISO())}>HOY</button>
          <button className="btn-secondary" onClick={() => setDate((d) => shiftDate(d, 1))}>→</button>
        </div>
      </div>

      {error && <div className="rounded-xl bg-rose-50 px-4 py-3 text-rose-700">{error}</div>}

      {data && (
        <KpiGrid
          items={[
            { label: 'Pacientes hoy', value: data.kpis.patientsToday },
            { label: 'Atendidos', value: data.kpis.attended, accent: 'text-emerald-700' },
            { label: 'Pendientes', value: data.kpis.pending, accent: 'text-amber-700' },
            { label: 'No atendidos', value: data.kpis.noShow },
            { label: 'Ingresos', value: money(data.kpis.amount), accent: 'text-brand-700' },
            { label: 'Ticket prom.', value: money(data.kpis.ticketAvg), accent: 'text-brand-700' },
          ]}
        />
      )}

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Resultado por doctor</h2>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {(data?.byDoctor || []).map((row) => (
            <article key={row.doctor.id} className="card flex flex-col gap-3 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="truncate font-semibold">{row.doctor.name}</h3>
                  <p className="mt-1 text-sm text-slate-500">
                    {row.pending} pendientes · {row.attended} atendidos · {row.scheduled} agendados
                  </p>
                </div>
                <Badge status={row.closureStatus} label={row.closureStatus === 'CLOSED' ? 'Cerrado' : 'Abierto'} />
              </div>
              <div className="flex items-end justify-between gap-3">
                <div>
                  <div className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Ingresos</div>
                  <div className="text-xl font-semibold text-brand-800">{money(row.amount)}</div>
                  <div className="text-xs text-slate-500">Ticket {money(row.ticketAvg)}</div>
                </div>
                <div className="flex flex-wrap justify-end gap-2">
                  <Link className="btn-secondary" to={`/agenda?doctorId=${row.doctor.id}`}>Agenda</Link>
                  {canEdit && row.closureStatus === 'CLOSED' && row.closureId && (
                    <button className="btn-secondary" onClick={() => setReopenId(row.closureId)}>Reabrir</button>
                  )}
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      {reopenId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4">
          <div className="card w-full max-w-md p-6">
            <h3 className="font-display text-xl font-semibold">Reabrir día</h3>
            <p className="mt-1 text-sm text-slate-600">Se registrará en auditoría.</p>
            <textarea className="input mt-4 min-h-[100px]" placeholder="Motivo *" value={reason} onChange={(e) => setReason(e.target.value)} />
            <div className="mt-4 flex gap-2">
              <button className="btn-secondary flex-1" onClick={() => { setReopenId(null); setReason(''); }}>Cancelar</button>
              <button
                className="btn-primary flex-1"
                onClick={async () => {
                  await api.post('/api/closures/reopen', { closureId: reopenId, reason });
                  setReopenId(null);
                  setReason('');
                  await load();
                }}
              >
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
