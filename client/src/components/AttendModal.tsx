import { useState } from 'react';
import { api } from '../lib/api';
import { nowTime } from '../lib/utils';

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
  const [treatment, setTreatment] = useState('');
  const [amount, setAmount] = useState('');
  const [notes, setNotes] = useState(appointment.notes || '');
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    setSaving(true);
    setError('');
    try {
      await api.post('/api/attend', {
        appointmentId: appointment.id,
        actualTime,
        treatment,
        amount: Number(amount),
        notes,
      });
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al guardar');
      setConfirming(false);
    } finally {
      setSaving(false);
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
          <p className="text-slate-500">Captura procedimiento, notas y monto. El paciente pasará a Atendidos.</p>
        </div>
        <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
          <div className="rounded-2xl bg-sand p-4">
            <div className="text-lg font-semibold">{appointment.patientName}</div>
            <div className="mt-2 grid gap-1 text-sm text-slate-600">
              <div>Teléfono: {appointment.phone || '—'}</div>
              <div>Correo: {appointment.email || '—'}</div>
              <div>Hora programada: {appointment.startTime}</div>
              <div>Estado Huli: {appointment.sourceStatus || '—'}</div>
              <div>Asistencia: {appointment.attendanceConfirmation || '—'}</div>
              <div>Notas: {appointment.notes || '—'}</div>
            </div>
          </div>

          {!confirming ? (
            <>
              <div>
                <label className="label">Hora real de atención *</label>
                <input className="input" type="time" value={actualTime} onChange={(e) => setActualTime(e.target.value)} />
              </div>
              <div>
                <label className="label">Procedimiento *</label>
                <input className="input" value={treatment} onChange={(e) => setTreatment(e.target.value)} placeholder="Consulta, Botox, Láser…" autoFocus />
              </div>
              <div>
                <label className="label">Monto a cobrar *</label>
                <input className="input" type="number" min="0.01" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
              </div>
              <div>
                <label className="label">Notas</label>
                <textarea className="input min-h-[90px]" value={notes} onChange={(e) => setNotes(e.target.value)} />
              </div>
            </>
          ) : (
            <div className="rounded-2xl border border-brand-200 bg-brand-50 p-4">
              <div className="font-semibold">Confirmar atención</div>
              <div className="mt-3 space-y-1 text-sm">
                <div>Paciente: <strong>{appointment.patientName}</strong></div>
                <div>Procedimiento: <strong>{treatment}</strong></div>
                <div>Monto a cobrar: <strong>${amount}</strong></div>
              </div>
            </div>
          )}

          {error && <div className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>}
        </div>
        <div className="flex gap-2 border-t border-slate-100 px-6 py-4">
          <button className="btn-secondary flex-1" onClick={onClose} disabled={saving}>Cancelar</button>
          {!confirming ? (
            <button
              className="btn-primary flex-1"
              onClick={() => {
                if (!treatment.trim() || !amount || Number(amount) <= 0) {
                  setError('Procedimiento y monto son obligatorios');
                  return;
                }
                setError('');
                setConfirming(true);
              }}
            >
              Pasar a atendidos
            </button>
          ) : (
            <button className="btn-primary flex-1" onClick={submit} disabled={saving}>
              {saving ? 'Guardando…' : 'Confirmar'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
