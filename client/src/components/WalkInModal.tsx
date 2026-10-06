import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { nowTime } from '../lib/utils';
import { useAuth } from '../auth/AuthContext';

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
  const [treatment, setTreatment] = useState('');
  const [amount, setAmount] = useState('');
  const [notes, setNotes] = useState('');
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4">
      <div className="card max-h-[90vh] w-full max-w-xl overflow-y-auto">
        <div className="border-b border-slate-100 px-6 py-4">
          <h2 className="font-display text-2xl font-semibold">Paciente nuevo</h2>
          <p className="text-slate-500">No estaba agendado. Se registra directo en Atendidos.</p>
        </div>
        <form
          className="space-y-4 px-6 py-5"
          onSubmit={async (e) => {
            e.preventDefault();
            setSaving(true);
            setError('');
            try {
              await api.post('/api/walk-in', {
                patientName,
                phone,
                email,
                birthDate: birthDate || undefined,
                actualTime,
                treatment,
                amount: Number(amount),
                notes,
                attendanceDate: date,
                doctorId: user?.role === 'ADMIN' ? doctorId : undefined,
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
          <div>
            <label className="label">Procedimiento *</label>
            <input className="input" value={treatment} onChange={(e) => setTreatment(e.target.value)} placeholder="Consulta, Botox, Láser…" required />
          </div>
          <div>
            <label className="label">Monto a cobrar *</label>
            <input className="input" type="number" min="0.01" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} required />
          </div>
          <div>
            <label className="label">Notas</label>
            <textarea className="input min-h-[80px]" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          {error && <div className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>}
          <div className="flex gap-2 pt-2">
            <button type="button" className="btn-secondary flex-1" onClick={onClose}>Cancelar</button>
            <button className="btn-primary flex-1" disabled={saving}>{saving ? 'Guardando…' : 'Agregar a atendidos'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
