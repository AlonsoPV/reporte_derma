import { useEffect, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { api } from '../lib/api';
import { useAuth } from '../auth/AuthContext';
import { KpiGrid, money } from '../components/KpiGrid';
import { DateQuickFilters } from '../components/DateQuickFilters';
import { todayISO } from '../lib/utils';
import { ATTENDANCE_ORIGINS, ORIGIN_LABELS, canSeeAll } from '@shared/constants';

type Report = {
  summary: {
    scheduled: number;
    attended: number;
    walkIns: number;
    noShows: number;
    cancelled: number;
    attendanceRate: number;
    totalAmount: number;
    ticketAvg: number;
  };
  byDoctor: Array<{ doctorId: string; name: string; attended: number; amount: number }>;
  byTreatment: Array<{ treatment: string; count: number; amount: number }>;
  byPayment: Array<{ method: string; label: string; amount: number }>;
  byDay: Array<{ date: string; count: number }>;
  detail: Array<{
    id: string;
    date: string;
    time: string;
    patientName: string;
    doctor: string;
    treatment: string;
    amount: number;
    paymentLabel: string;
    originLabel: string;
    statusLabel: string;
  }>;
};

export function ReportsPage() {
  const { user } = useAuth();
  const seesAll = canSeeAll(user?.role);
  const [from, setFrom] = useState(todayISO());
  const [to, setTo] = useState(todayISO());
  const [doctorId, setDoctorId] = useState('');
  const [treatment, setTreatment] = useState('');
  const [origin, setOrigin] = useState('');
  const [doctors, setDoctors] = useState<Array<{ id: string; name: string }>>([]);
  const [report, setReport] = useState<Report | null>(null);

  useEffect(() => {
    if (seesAll) {
      api.get<{ doctors: Array<{ id: string; name: string }> }>('/api/doctors').then((r) => setDoctors(r.doctors));
    }
  }, [seesAll]);

  const load = async () => {
    const params = new URLSearchParams({ from, to });
    if (seesAll && doctorId) params.set('doctorId', doctorId);
    if (treatment) params.set('treatment', treatment);
    if (origin) params.set('origin', origin);
    const data = await api.get<Report>(`/api/reports/summary?${params}`);
    setReport(data);
  };

  useEffect(() => {
    load().catch(console.error);
  }, [from, to, doctorId]);

  const exportExcel = async () => {
    const params = new URLSearchParams({ from, to });
    if (seesAll && doctorId) params.set('doctorId', doctorId);
    if (treatment) params.set('treatment', treatment);
    if (origin) params.set('origin', origin);
    const res = await fetch(`/api/reports/export?${params}`, { credentials: 'include' });
    if (!res.ok) {
      alert('Error al exportar');
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `reporte_${from}_${to}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-semibold">Reportes</h1>
          <p className="text-slate-600">
            {seesAll
              ? 'Resumen de toda la operación y detalle exportable'
              : 'Solo tu resumen y detalle exportable'}
          </p>
        </div>
        <button className="btn-primary" onClick={exportExcel}>Exportar Excel</button>
      </div>

      <div className="card space-y-4 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <DateQuickFilters
            from={from}
            to={to}
            onChange={({ from: f, to: t }) => {
              setFrom(f);
              setTo(t);
            }}
          />
          <button className="btn-secondary" onClick={() => load()}>Aplicar filtros</button>
        </div>
        <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-6">
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
          <div>
            <label className="label">Tratamiento</label>
            <input className="input" value={treatment} onChange={(e) => setTreatment(e.target.value)} placeholder="Opcional" />
          </div>
          <div>
            <label className="label">Origen</label>
            <select className="input" value={origin} onChange={(e) => setOrigin(e.target.value)}>
              <option value="">Todos</option>
              {ATTENDANCE_ORIGINS.map((o) => <option key={o} value={o}>{ORIGIN_LABELS[o]}</option>)}
            </select>
          </div>
        </div>
      </div>

      {report && (
        <>
          <KpiGrid
            items={[
              { label: 'Agendados', value: report.summary.scheduled },
              { label: 'Atendidos', value: report.summary.attended },
              { label: 'Sin cita', value: report.summary.walkIns },
              { label: 'No atendidos / cancelados', value: `${report.summary.noShows} / ${report.summary.cancelled}` },
              { label: 'Ingresos / ticket', value: `${money(report.summary.totalAmount)} · ${money(report.summary.ticketAvg)}` },
            ]}
          />
          <div className="text-sm text-slate-600">Tasa de asistencia: <strong>{report.summary.attendanceRate.toFixed(1)}%</strong></div>

          <div className="card p-4">
              <h3 className="mb-3 font-semibold">Pacientes atendidos por día</h3>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={report.byDay}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                    <YAxis allowDecimals={false} />
                    <Tooltip />
                    <Bar dataKey="count" fill="#246464" radius={[8, 8, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
          </div>

          <div className={`grid gap-4 ${seesAll ? 'lg:grid-cols-2' : ''}`}>
            {seesAll && (
            <div className="card p-4">
              <h3 className="mb-3 font-semibold">Ingresos por doctor</h3>
              <div className="space-y-2 text-sm">
                {report.byDoctor.map((d) => (
                  <div key={d.doctorId} className="flex justify-between border-b border-slate-100 py-2">
                    <span>{d.name} · {d.attended} atenciones</span>
                    <strong>{money(d.amount)}</strong>
                  </div>
                ))}
              </div>
            </div>
            )}
            <div className="card p-4">
              <h3 className="mb-3 font-semibold">Tratamientos más realizados</h3>
              <div className="space-y-2 text-sm">
                {report.byTreatment.slice(0, 8).map((t) => (
                  <div key={t.treatment} className="flex justify-between border-b border-slate-100 py-2">
                    <span>{t.treatment} · {t.count}</span>
                    <strong>{money(t.amount)}</strong>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="card overflow-x-auto">
            <div className="border-b border-slate-100 px-4 py-3 font-semibold">Detalle</div>
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left text-slate-500">
                <tr>
                  <th className="px-4 py-3">Fecha</th>
                  <th className="px-4 py-3">Hora</th>
                  <th className="px-4 py-3">Paciente</th>
                  {seesAll && <th className="px-4 py-3">Doctor</th>}
                  <th className="px-4 py-3">Tratamiento</th>
                  <th className="px-4 py-3">Monto</th>
                  <th className="px-4 py-3">Origen</th>
                </tr>
              </thead>
              <tbody>
                {report.detail.map((r) => (
                  <tr key={r.id} className="border-t border-slate-100">
                    <td className="px-4 py-3">{r.date}</td>
                    <td className="px-4 py-3">{r.time}</td>
                    <td className="px-4 py-3">{r.patientName}</td>
                    {seesAll && <td className="px-4 py-3">{r.doctor}</td>}
                    <td className="px-4 py-3">{r.treatment}</td>
                    <td className="px-4 py-3">{money(r.amount)}</td>
                    <td className="px-4 py-3">{r.originLabel}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
