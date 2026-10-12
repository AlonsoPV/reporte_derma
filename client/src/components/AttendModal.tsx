import { useState } from 'react';
import { api } from '../lib/api';
import { nowTime } from '../lib/utils';
import { Badge } from './Badge';
import { ProcedureLinesEditor, type ProcedureLine } from './ProcedureLines';
import { huliAgendaStatus } from '@shared/huli';
import { toTime24h } from '@shared/time';

type Appointment = {
  id: string;
  patientName: string;
  phone?: string | null;
  email?: string | null;
  birthDate?: string | null;
  startTime: string;
  notes?: string | null;
  sourceStatus?: string | null;
  attendanceConfirmation?: string | null;
  operationalStatus?: string | null;
};

export function AttendModal({
  appointment,
  onClose,
  onSaved,
}: {
  appointment: Appointment;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [actualTime, setActualTime] = useState(nowTime());
  const [lines, setLines] = useState<ProcedureLine[]>([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState<'attend' | 'noshow' | null>(null);

  const submit = async () => {
    if (!lines.length) {
      setError('Agrega al menos una atención.');
      return;
    }
    setSaving('attend');
    setError('');
    try {
      await api.post('/api/attend', {
        appointmentId: appointment.id,
        actualTime,
        items: lines.map((line) => ({
          treatment: line.treatment,
          amount: Number(line.amount),
          notes: line.notes || undefined,
        })),
      });
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al guardar');
    } finally {
      setSaving(null);
    }
  };

  const huli = huliAgendaStatus(
    appointment.sourceStatus,
    appointment.attendanceConfirmation,
    appointment.operationalStatus,
  );

  const markNoShow = async () => {
    setSaving('noshow');
    setError('');
    try {
      await api.post('/api/classify', {
        appointmentId: appointment.id,
        operationalStatus: 'NO_SHOW',
        reason: 'NO_SE_PRESENTO',
      });
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo marcar como no se presentó');
    } finally {
      setSaving(null);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-stretch justify-end bg-ink/40 p-0 sm:items-center sm:justify-center sm:p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="card flex h-full w-full max-w-xl flex-col overflow-hidden sm:h-auto sm:max-h-[90vh]">
        <div className="border-b border-slate-100 px-6 py-4">
          <h2 className="font-display text-2xl font-semibold">Registrar atención</h2>
          <p className="text-slate-500">Puedes agregar varios procedimientos. Cada uno se guarda como un renglón en Atendidos.</p>
        </div>
        <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
          <div className="rounded-2xl bg-sand p-4">
            <div className="text-lg font-semibold">{appointment.patientName}</div>
            <div className="mt-2 grid gap-1 text-sm text-slate-600">
              <div>Teléfono: {appointment.phone || '—'}</div>
              <div>Correo: {appointment.email || '—'}</div>
              <div>Hora programada: {toTime24h(appointment.startTime)}</div>
              <div className="flex flex-wrap items-center gap-2">
                <span>Estado Huli:</span>
                {huli ? <Badge status={huli.status} label={huli.label} /> : <span>—</span>}
              </div>
              <div>Notas: {appointment.notes || '—'}</div>
            </div>
          </div>

          <div>
            <label className="label">Hora real de atención *</label>
            <input className="input" type="time" value={actualTime} onChange={(e) => setActualTime(e.target.value)} />
          </div>

          <ProcedureLinesEditor lines={lines} onChange={setLines} />

          {error && <div className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>}
        </div>
        <div className="flex flex-wrap gap-2 border-t border-slate-100 px-6 py-4">
          <button className="btn-secondary min-w-[6.5rem] flex-1" onClick={onClose} disabled={Boolean(saving)}>Cancelar</button>
          <button
            type="button"
            className="btn min-w-[7.5rem] flex-1 bg-slate-100 text-slate-800 hover:bg-slate-200"
            onClick={() => void markNoShow()}
            disabled={Boolean(saving)}
          >
            {saving === 'noshow' ? 'Guardando…' : 'No se presentó'}
          </button>
          <button
            className="btn-primary min-w-[8rem] flex-1"
            disabled={Boolean(saving) || lines.length === 0}
            onClick={() => void submit()}
          >
            {saving === 'attend' ? 'Guardando…' : 'Pasar a atendidos'}
          </button>
        </div>
      </div>
    </div>
  );
}
