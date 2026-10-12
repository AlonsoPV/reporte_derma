import { useState } from 'react';
import { PROCEDURES } from '@shared/constants';
import { money } from './KpiGrid';

export type ProcedureLine = {
  id: string;
  treatment: string;
  amount: string;
  notes: string;
};

export function ProcedureLinesEditor({
  lines,
  onChange,
}: {
  lines: ProcedureLine[];
  onChange: (lines: ProcedureLine[]) => void;
}) {
  const [treatment, setTreatment] = useState('');
  const [amount, setAmount] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');

  const add = () => {
    if (!treatment) {
      setError('Selecciona un procedimiento.');
      return;
    }
    if (!amount || Number(amount) <= 0) {
      setError('El monto debe ser mayor a 0.');
      return;
    }
    onChange([...lines, { id: crypto.randomUUID(), treatment, amount, notes }]);
    setTreatment('');
    setAmount('');
    setNotes('');
    setError('');
  };

  const total = lines.reduce((sum, line) => sum + Number(line.amount || 0), 0);

  return (
    <div className="space-y-3">
      <div className="rounded-2xl border border-slate-200 p-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label">Procedimiento *</label>
            <select className="input" value={treatment} onChange={(e) => setTreatment(e.target.value)}>
              <option value="">Seleccionar…</option>
              {PROCEDURES.map((name) => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Monto *</label>
            <input
              className="input"
              type="number"
              min="0.01"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>
        </div>
        <div className="mt-3">
          <label className="label">Notas de esta atención</label>
          <input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Opcional" />
        </div>
        {error && <div className="mt-2 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>}
        <button type="button" className="btn-primary mt-3 w-full sm:w-auto" onClick={add}>
          Agregar
        </button>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200">
        <div className="border-b border-slate-100 bg-slate-50 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
          Atenciones de este paciente
        </div>
        {lines.length === 0 ? (
          <div className="px-3 py-6 text-center text-sm text-slate-500">Aún no hay atenciones. Elige procedimiento, monto y pulsa Agregar.</div>
        ) : (
          <ul>
            {lines.map((line) => (
              <li key={line.id} className="flex items-start gap-3 border-t border-slate-100 px-3 py-2.5">
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">{line.treatment}</span>
                  {line.notes ? <span className="block truncate text-xs text-slate-500">{line.notes}</span> : null}
                </span>
                <span className="shrink-0 text-sm font-semibold">{money(Number(line.amount))}</span>
                <button
                  type="button"
                  className="btn-ghost shrink-0 px-2 py-1 text-xs text-rose-700"
                  onClick={() => onChange(lines.filter((item) => item.id !== line.id))}
                >
                  Quitar
                </button>
              </li>
            ))}
            <li className="flex items-center justify-between border-t border-slate-200 bg-sand px-3 py-2.5 text-sm font-semibold">
              <span>Total</span>
              <span>{money(total)}</span>
            </li>
          </ul>
        )}
      </div>
    </div>
  );
}
