import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { money } from './KpiGrid';
import { NO_SHOW_REASONS, NO_SHOW_REASON_LABELS, type NoShowReason } from '@shared/constants';
import { AttendModal } from './AttendModal';
import { toTime24h } from '@shared/time';

type Pending = {
  id: string;
  patientName: string;
  startTime: string;
  phone?: string | null;
  email?: string | null;
  birthDate?: string | null;
  notes?: string | null;
  sourceStatus?: string | null;
  attendanceConfirmation?: string | null;
  operationalStatus?: string;
};

type Preview = {
  doctor: { name: string };
  date: string;
  pending: Pending[];
  scheduledCount: number;
  attendedCount: number;
  walkInCount: number;
  noShowCount: number;
  cancelledCount: number;
  rescheduledCount: number;
  totalAmount: number;
  cashAmount: number;
  cardAmount: number;
  transferAmount: number;
  otherAmount: number;
  treatmentsSnapshot: Record<string, number>;
};

export function CloseDayModal({
  date,
  doctorId,
  onClose,
  onClosed,
}: {
  date: string;
  doctorId?: string | null;
  onClose: () => void;
  onClosed: () => void;
}) {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [attendNow, setAttendNow] = useState<Pending | null>(null);
  const [reasonById, setReasonById] = useState<Record<string, NoShowReason>>({});
  const [notesById, setNotesById] = useState<Record<string, string>>({});

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const qs = new URLSearchParams({ date });
      if (doctorId) qs.set('doctorId', doctorId);
      const data = await api.get<Preview>(`/api/closures/preview?${qs}`);
      setPreview(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [date, doctorId]);

  const classify = async (appointmentId: string, status: 'NO_SHOW' | 'CANCELLED' | 'RESCHEDULED') => {
    const reason = reasonById[appointmentId] || 'NO_SE_PRESENTO';
    await api.post('/api/classify', {
      appointmentId,
      operationalStatus: status,
      reason,
      notes: notesById[appointmentId],
    });
    await load();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="card max-h-[92vh] w-full max-w-3xl overflow-y-auto">
        <div className="border-b border-slate-100 px-6 py-4">
          <h2 className="font-display text-2xl font-semibold">Cerrar día</h2>
          <p className="text-slate-500">{preview?.doctor?.name} · {date}</p>
        </div>

        <div className="space-y-5 px-6 py-5">
          {loading && <div>Cargando resumen…</div>}
          {error && <div className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>}

          {preview && preview.pending.length > 0 && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
              <div className="font-semibold text-amber-900">
                Confirma los {preview.pending.length} pacientes que no fueron atendidos. Aunque la agenda los marque como cancelados, este dato lo confirmas tú al cerrar el día.
              </div>
              <div className="mt-4 space-y-4">
                {preview.pending.map((p) => (
                  <div key={p.id} className="rounded-xl bg-white p-4">
                    <div className="font-medium">{toTime24h(p.startTime)} · {p.patientName}</div>
                    {p.sourceStatus && (
                      <div className="mt-1 text-sm text-slate-500">En la agenda: {p.sourceStatus}</div>
                    )}
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      <select
                        className="input"
                        value={reasonById[p.id] || 'NO_SE_PRESENTO'}
                        onChange={(e) => setReasonById((s) => ({ ...s, [p.id]: e.target.value as NoShowReason }))}
                      >
                        {NO_SHOW_REASONS.map((r) => (
                          <option key={r} value={r}>{NO_SHOW_REASON_LABELS[r]}</option>
                        ))}
                      </select>
                      <input
                        className="input"
                        placeholder="Observación (opcional)"
                        value={notesById[p.id] || ''}
                        onChange={(e) => setNotesById((s) => ({ ...s, [p.id]: e.target.value }))}
                      />
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button className="btn-secondary" onClick={() => classify(p.id, 'NO_SHOW')}>No se presentó</button>
                      <button className="btn-secondary" onClick={() => classify(p.id, 'CANCELLED')}>Canceló</button>
                      <button className="btn-secondary" onClick={() => classify(p.id, 'RESCHEDULED')}>Reagendó</button>
                      <button className="btn-primary" onClick={() => setAttendNow(p)}>Atender ahora</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {preview && preview.pending.length === 0 && (
            <div className="space-y-4">
              <div className="rounded-2xl bg-sand p-4">
                <h3 className="font-semibold">Resumen del día</h3>
                <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                  <div>Citas programadas: <strong>{preview.scheduledCount}</strong></div>
                  <div>Pacientes atendidos: <strong>{preview.attendedCount}</strong></div>
                  <div>Pacientes sin cita: <strong>{preview.walkInCount}</strong></div>
                  <div>No atendidos: <strong>{preview.noShowCount}</strong></div>
                  <div>Cancelados: <strong>{preview.cancelledCount}</strong></div>
                  <div>Reagendados: <strong>{preview.rescheduledCount}</strong></div>
                  <div className="sm:col-span-2 text-lg">Total cobrado: <strong>{money(preview.totalAmount)}</strong></div>
                </div>
              </div>
              <div className="card p-4">
                <div className="font-semibold">Tratamientos</div>
                <div className="mt-2 space-y-1 text-sm">
                  {Object.entries(preview.treatmentsSnapshot || {}).map(([t, c]) => (
                    <div key={t} className="flex justify-between"><span>{t}</span><strong>{c}</strong></div>
                  ))}
                  {Object.keys(preview.treatmentsSnapshot || {}).length === 0 && (
                    <div className="text-slate-500">Sin tratamientos</div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="flex gap-2 border-t border-slate-100 px-6 py-4">
          <button className="btn-secondary flex-1" onClick={onClose}>Cancelar</button>
          <button
            className="btn-danger flex-1"
            disabled={!preview || preview.pending.length > 0 || saving}
            onClick={async () => {
              setSaving(true);
              setError('');
              try {
                await api.post('/api/closures/close', { date, doctorId: doctorId || undefined });
                onClosed();
              } catch (e) {
                setError(e instanceof Error ? e.message : 'Error al cerrar');
              } finally {
                setSaving(false);
              }
            }}
          >
            {saving ? 'Cerrando…' : 'Confirmar cierre'}
          </button>
        </div>
      </div>

      {attendNow && (
        <AttendModal
          appointment={attendNow}
          onClose={() => setAttendNow(null)}
          onSaved={async () => {
            setAttendNow(null);
            await load();
          }}
        />
      )}
    </div>
  );
}
