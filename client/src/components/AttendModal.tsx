import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { clearDraft, draftForAppointment, saveDraft } from '../lib/attendanceDraft';
import { nowTime } from '../lib/utils';
import { Badge } from './Badge';
import { ProcedureLinesEditor, type ProcedureLine, type RecipeLine } from './ProcedureLines';
import { huliAgendaStatus } from '@shared/huli';
import { toTime24h } from '@shared/time';
import { formatDisplayDate, todayISO } from '../lib/utils';

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
  doctor?: { name: string } | null;
};

export function AttendModal({
  appointment,
  onClose,
  onSaved,
  date,
}: {
  appointment: Appointment;
  onClose: () => void;
  onSaved: () => void;
  date?: string;
}) {
  const stored = draftForAppointment(appointment.id);
  const [actualTime, setActualTime] = useState(stored?.actualTime || nowTime());
  const [lines, setLines] = useState<ProcedureLine[]>(stored?.lines || []);
  const [recipe, setRecipe] = useState<RecipeLine[]>(stored?.recipe || []);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState<'attend' | 'noshow' | null>(null);

  const submit = async () => {
    if (!lines.length) {
      setError('Agrega al menos una atención.');
      return;
    }
    if (recipe.some((line) => !line.usage.trim() || !line.recommendation.trim())) {
      setError('La forma de uso y la recomendación no pueden quedar vacías.');
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
        recipe: recipe.map(({ category, productName, usage, recommendation }) => ({
          category,
          productName,
          usage,
          recommendation,
        })),
      });
      clearDraft();
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al guardar');
    } finally {
      setSaving(null);
    }
  };

  useEffect(() => {
    const flush = () => {
      if (!lines.length && !recipe.length) return;
      saveDraft({
        kind: 'attend',
        date: date || todayISO(),
        appointmentId: appointment.id,
        actualTime,
        patientName: appointment.patientName,
        phone: appointment.phone || '',
        lines,
        recipe,
      });
    };
    flush();
    window.addEventListener('pagehide', flush);
    return () => window.removeEventListener('pagehide', flush);
  }, [actualTime, lines, recipe, appointment.id, appointment.patientName, appointment.phone, date]);

  const dismiss = () => {
    clearDraft();
    onClose();
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
      clearDraft();
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
        if (e.target === e.currentTarget) dismiss();
      }}
    >
      <div className="card flex h-full w-full max-w-xl flex-col overflow-hidden sm:h-auto sm:max-h-[90vh] [&_.input]:text-base sm:[&_.input]:text-sm">
        <div className="border-b border-slate-100 px-4 py-4 sm:px-6">
          <h2 className="font-display text-2xl font-semibold">Registrar atención</h2>
          <p className="text-sm text-slate-500 sm:text-base">Primero el procedimiento y el monto. La receta va debajo y es opcional.</p>
        </div>
        <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:px-6 sm:py-5">
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

          <ProcedureLinesEditor
            lines={lines}
            onChange={setLines}
            recipe={recipe}
            onRecipeChange={setRecipe}
            recipeContext={{
              patientName: appointment.patientName,
              phone: appointment.phone,
              doctorName: appointment.doctor?.name,
              dateLabel: formatDisplayDate(date || todayISO()),
            }}
          />

          {error && <div className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>}
        </div>
        <div className="grid grid-cols-2 gap-2 border-t border-slate-100 px-4 py-3 sm:px-6 sm:py-4">
          <button className="btn-secondary w-full" onClick={dismiss} disabled={Boolean(saving)}>Cancelar</button>
          <button
            type="button"
            className="btn w-full bg-slate-100 text-slate-800 hover:bg-slate-200"
            onClick={() => void markNoShow()}
            disabled={Boolean(saving)}
          >
            {saving === 'noshow' ? 'Guardando…' : 'No se presentó'}
          </button>
          <button
            className="btn-primary col-span-2 w-full"
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
