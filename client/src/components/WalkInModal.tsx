import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { nowTime } from '../lib/utils';
import { useAuth } from '../auth/AuthContext';
import { ProcedureLinesEditor, type ProcedureLine, type RecipeLine } from './ProcedureLines';
import { formatDisplayDate } from '../lib/utils';

export function WalkInModal({
  date,
  onClose,
  onSaved,
  initialDoctorId,
}: {
  date: string;
  onClose: () => void;
  onSaved: () => void;
  initialDoctorId?: string;
}) {
  const { user } = useAuth();
  const [patientName, setPatientName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [actualTime, setActualTime] = useState(nowTime());
  const [lines, setLines] = useState<ProcedureLine[]>([]);
  const [recipe, setRecipe] = useState<RecipeLine[]>([]);
  const [doctorId, setDoctorId] = useState(initialDoctorId || user?.doctorId || '');
  const [doctors, setDoctors] = useState<Array<{ id: string; name: string }>>([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (user?.role === 'ADMIN') {
      api.get<{ doctors: Array<{ id: string; name: string }> }>('/api/admin/doctors').then((r) => {
        setDoctors(r.doctors);
        setDoctorId((current) => current || initialDoctorId || r.doctors[0]?.id || '');
      }).catch(() => undefined);
    }
  }, [user?.role, initialDoctorId]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-stretch justify-end bg-ink/40 p-0 sm:items-center sm:justify-center sm:p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="card flex h-full w-full max-w-xl flex-col overflow-hidden sm:h-auto sm:max-h-[90vh] [&_.input]:text-base sm:[&_.input]:text-sm">
        <div className="border-b border-slate-100 px-4 py-4 sm:px-6">
          <h2 className="font-display text-2xl font-semibold">Paciente nuevo</h2>
          <p className="text-sm text-slate-500 sm:text-base">No estaba agendado. El monto y la receta se capturan aquí.</p>
        </div>
        <form
          id="walk-in-form"
          className="flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:px-6 sm:py-5"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!lines.length) {
              setError('Agrega al menos una atención.');
              return;
            }
            if (recipe.some((line) => !line.usage.trim() || !line.recommendation.trim())) {
              setError('La forma de uso y la recomendación no pueden quedar vacías.');
              return;
            }
            setSaving(true);
            setError('');
            try {
              await api.post('/api/walk-in', {
                patientName,
                phone,
                email,
                birthDate: birthDate || undefined,
                actualTime,
                attendanceDate: date,
                doctorId: user?.role === 'ADMIN' ? doctorId : undefined,
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
              onSaved();
            } catch (err) {
              setError(err instanceof Error ? err.message : 'Error');
            } finally {
              setSaving(false);
            }
          }}
        >
          {user?.role === 'ADMIN' && (
            <div>
              <label className="label">Doctor *</label>
              <select className="input" value={doctorId} onChange={(e) => setDoctorId(e.target.value)} required>
                <option value="">Seleccionar…</option>
                {doctors.map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label className="label">Nombre *</label>
            <input className="input" value={patientName} onChange={(e) => setPatientName(e.target.value)} required autoFocus />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label">Teléfono</label>
              <input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
            <div>
              <label className="label">Correo</label>
              <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label">Fecha de nacimiento</label>
              <input className="input" type="date" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} />
            </div>
            <div>
              <label className="label">Hora de atención *</label>
              <input className="input" type="time" value={actualTime} onChange={(e) => setActualTime(e.target.value)} required />
            </div>
          </div>
          <ProcedureLinesEditor
            lines={lines}
            onChange={setLines}
            recipe={recipe}
            onRecipeChange={setRecipe}
            recipeContext={{
              patientName,
              phone,
              doctorName: doctors.find((doctor) => doctor.id === doctorId)?.name || user?.name,
              dateLabel: formatDisplayDate(date),
            }}
          />
          {error && <div className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>}
        </form>
        <div className="grid grid-cols-1 gap-2 border-t border-slate-100 px-4 py-3 sm:grid-cols-2 sm:px-6 sm:py-4">
          <button type="button" className="btn-secondary w-full" onClick={onClose}>Cancelar</button>
          <button type="submit" form="walk-in-form" className="btn-primary w-full" disabled={saving || lines.length === 0}>
            {saving ? 'Guardando…' : 'Agregar a atendidos'}
          </button>
        </div>
      </div>
    </div>
  );
}
