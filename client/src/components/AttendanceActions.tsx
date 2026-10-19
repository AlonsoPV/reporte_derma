import { useState } from 'react';
import { api } from '../lib/api';
import { formatDisplayDate } from '../lib/utils';
import { money } from './KpiGrid';
import { RecipeEditor, type RecipeLine } from './RecipeEditor';
import { PROCEDURES } from '@shared/constants';
import { toTime24h } from '@shared/time';

export type EditableAttendance = {
  id: string;
  actualTime: string;
  attendanceDate?: string;
  patientName: string;
  phone?: string | null;
  email?: string | null;
  treatment: string;
  amount: number | string;
  notes?: string | null;
  origin?: string;
  doctorId?: string | null;
  doctor?: { name: string } | null;
  recipe?: RecipeLine[];
};

export function attendanceDayClosed(
  attendance: { doctorId?: string | null },
  data: { isClosed?: boolean; closedDoctorIds?: string[] } | null,
) {
  if (!data) return false;
  if (attendance.doctorId && data.closedDoctorIds) {
    return data.closedDoctorIds.includes(attendance.doctorId);
  }
  return Boolean(data.isClosed);
}

export function AttendanceRowActions({
  canMutate,
  closed,
  onEdit,
  onDelete,
}: {
  canMutate: boolean;
  closed: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  if (!canMutate) {
    return closed ? (
      <span className="shrink-0 text-xs font-semibold text-brand-700">Cerrado</span>
    ) : null;
  }
  return (
    <span className="flex shrink-0 gap-1">
      <button type="button" className="btn-ghost px-2 py-1.5 text-xs" onClick={onEdit}>
        Editar
      </button>
      <button type="button" className="btn-ghost px-2 py-1.5 text-xs text-rose-700" onClick={onDelete}>
        Borrar
      </button>
    </span>
  );
}

export function mergeAttendanceRow<T extends { id: string }>(
  rows: T[],
  updated: Partial<EditableAttendance> & { id: string },
): T[] {
  const patch = {
    ...updated,
    ...(updated.amount !== undefined ? { amount: Number(updated.amount) } : {}),
  };
  return rows.map((row) => (row.id === updated.id ? { ...row, ...patch } : row));
}

type DayWithAttendances = {
  attendances: Array<{ id: string; amount: number | string }>;
  kpis: { amount: number; attended?: number };
};

export function overlayAttendanceOnDay<T extends DayWithAttendances>(
  data: T,
  updated: Partial<EditableAttendance> & { id: string },
): T {
  const attendances = mergeAttendanceRow(data.attendances, updated);
  const amount = attendances.reduce((sum, row) => sum + Number(row.amount), 0);
  return { ...data, attendances, kpis: { ...data.kpis, amount } };
}

export function removeAttendanceFromDay<T extends DayWithAttendances>(data: T, id: string): T {
  const attendances = data.attendances.filter((row) => row.id !== id);
  const amount = attendances.reduce((sum, row) => sum + Number(row.amount), 0);
  return {
    ...data,
    attendances,
    kpis: { ...data.kpis, attended: attendances.length, amount },
  };
}

export function AttendanceEditModal({
  attendance,
  onClose,
  onSaved,
}: {
  attendance: EditableAttendance;
  onClose: () => void;
  onSaved: (updated: EditableAttendance) => void | Promise<void>;
}) {
  const [form, setForm] = useState({
    patientName: attendance.patientName,
    phone: attendance.phone || '',
    email: attendance.email || '',
    actualTime: toTime24h(attendance.actualTime),
    treatment: attendance.treatment,
    amount: String(attendance.amount),
    notes: attendance.notes || '',
  });
  const [recipe, setRecipe] = useState<RecipeLine[]>(attendance.recipe || []);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const dateIso = String(attendance.attendanceDate || '').slice(0, 10);

  const parsedAmount = Number(String(form.amount).replace(/,/g, '').trim());

  const save = async () => {
    if (!form.patientName.trim() || !form.treatment.trim() || !(parsedAmount > 0)) {
      setError('Nombre, procedimiento y monto son obligatorios');
      return;
    }
    if (!form.actualTime) {
      setError('La hora de atención es obligatoria');
      return;
    }
    if (recipe.some((line) => !line.usage.trim() || !line.recommendation.trim())) {
      setError('La forma de uso y la recomendación no pueden quedar vacías.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const body = {
        patientName: form.patientName.trim(),
        phone: form.phone,
        email: form.email,
        actualTime: toTime24h(form.actualTime) || form.actualTime,
        treatment: form.treatment.trim(),
        amount: parsedAmount,
        notes: form.notes,
        recipe: recipe.map(({ category, productName, usage, recommendation }) => ({
          category,
          productName,
          usage,
          recommendation,
        })),
      };
      let saved: EditableAttendance = { ...attendance, ...body };
      try {
        const res = await api.put<{ attendance: EditableAttendance }>(`/api/attendances/${attendance.id}`, body);
        if (res?.attendance) saved = { ...saved, ...res.attendance, ...body, recipe: res.attendance.recipe ?? recipe };
      } catch (first) {
        const status = first instanceof Error && 'status' in first ? Number((first as Error & { status?: number }).status) : 0;
        if (status !== 404 && status !== 405) throw first;
        const res = await api.patch<{ attendance: EditableAttendance }>(`/api/attendances/${attendance.id}`, body);
        if (res?.attendance) saved = { ...saved, ...res.attendance, ...body, recipe: res.attendance.recipe ?? recipe };
      }
      await onSaved(saved);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !saving) onClose();
      }}
    >
      <div className="card flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden p-0 [&_.input]:text-base sm:[&_.input]:text-sm">
        <h2 className="font-display px-4 pt-5 text-2xl font-semibold sm:px-6 sm:pt-6">Editar atención</h2>
        <p className="px-4 text-sm text-slate-500 sm:px-6">Puedes corregir el procedimiento, el monto y la receta.</p>
        <div className="mt-4 min-h-0 flex-1 space-y-3 overflow-y-auto px-4 sm:px-6">
          <div>
            <label className="label">Paciente *</label>
            <input className="input" value={form.patientName} onChange={(e) => setForm({ ...form, patientName: e.target.value })} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label">Teléfono</label>
              <input className="input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </div>
            <div>
              <label className="label">Hora *</label>
              <input className="input" type="time" value={form.actualTime} onChange={(e) => setForm({ ...form, actualTime: e.target.value })} />
            </div>
          </div>
          <div>
            <label className="label">Correo</label>
            <input className="input" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>
          <div>
            <label className="label">Procedimiento *</label>
            <select className="input" value={form.treatment} onChange={(e) => setForm({ ...form, treatment: e.target.value })}>
              {!PROCEDURES.includes(form.treatment as (typeof PROCEDURES)[number]) && form.treatment && (
                <option value={form.treatment}>{form.treatment}</option>
              )}
              {PROCEDURES.map((name) => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Monto *</label>
            <input className="input" type="number" min="0.01" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
          </div>
          <div>
            <label className="label">Observaciones</label>
            <textarea className="input min-h-[80px]" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>
          <RecipeEditor
            lines={recipe}
            onChange={setRecipe}
            context={{
              patientName: form.patientName,
              phone: form.phone,
              doctorName: attendance.doctor?.name,
              dateLabel: /^\d{4}-\d{2}-\d{2}$/.test(dateIso) ? formatDisplayDate(dateIso) : '',
            }}
          />
          {error && <div className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>}
        </div>
        <div className="mt-4 flex gap-2 border-t border-slate-100 px-4 py-4 sm:px-6">
          <button type="button" className="btn-secondary flex-1" disabled={saving} onClick={onClose}>Cancelar</button>
          <button type="button" className="btn-primary flex-1" disabled={saving} onClick={() => void save()}>
            {saving ? 'Guardando…' : 'Guardar cambios'}
          </button>
        </div>
      </div>
    </div>
  );
}

export function AttendanceDeleteModal({
  attendance,
  onClose,
  onDeleted,
}: {
  attendance: EditableAttendance;
  onClose: () => void;
  onDeleted: () => void | Promise<void>;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const remove = async () => {
    setSaving(true);
    setError('');
    try {
      await api.delete(`/api/attendances/${attendance.id}`);
      await onDeleted();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al borrar');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !saving) onClose();
      }}
    >
      <div className="card w-full max-w-md p-6">
        <h2 className="font-display text-2xl font-semibold">Borrar atención</h2>
        <p className="mt-2 text-sm text-slate-600">
          Se eliminará <strong>{attendance.patientName}</strong> · {attendance.treatment} · {money(Number(attendance.amount))}.
          Si era la última atención de esa cita, el paciente vuelve a Por atender.
        </p>
        {error && <div className="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>}
        <div className="mt-6 flex gap-2">
          <button className="btn-secondary flex-1" disabled={saving} onClick={onClose}>Cancelar</button>
          <button className="btn-danger flex-1" disabled={saving} onClick={() => void remove()}>
            {saving ? 'Borrando…' : 'Borrar'}
          </button>
        </div>
      </div>
    </div>
  );
}
