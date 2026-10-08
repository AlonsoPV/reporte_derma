import { useState } from 'react';
import { api } from '../lib/api';

type LoadResult = {
  date: string;
  appointmentsCreated: number;
  attendancesCreated: number;
  doctors: Array<{ name: string; appointmentsCreated: number; attendancesCreated: number }>;
};

export function DemoDayLoader() {
  const [confirmed, setConfirmed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<LoadResult | null>(null);
  const [error, setError] = useState('');

  async function load() {
    if (!confirmed || loading) return;
    setLoading(true);
    setError('');
    setResult(null);
    try {
      setResult(await api.post<LoadResult>('/api/admin/demo-day', { confirmation: '2026-10-08' }));
      setConfirmed(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cargar la información demo.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="card space-y-3 p-5" aria-labelledby="demo-day-heading">
      <h2 id="demo-day-heading" className="font-semibold">Datos demo · 8 de octubre de 2026</h2>
      <p className="text-sm text-slate-600">
        Agrega 3 citas y 2 atenciones por cada uno de los tres médicos demo: 9 citas y 6 atenciones en total.
        No borra ni reemplaza registros y omite los datos demo que ya existen. Si hay un conflicto o un día cerrado,
        se cancela toda la carga.
      </p>
      <p className="text-sm text-slate-600">Aunque son ficticios, estos registros se incluirán en los conteos e ingresos de ese día.</p>
      <p className="text-sm font-medium text-slate-700">
        Se carga en la base de esta app. Para cargar producción, ejecuta esta acción desde la URL publicada,
        no desde la vista previa de Replit.
      </p>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" className="mt-1" checked={confirmed} disabled={loading}
          onChange={(e) => setConfirmed(e.target.checked)} />
        Confirmo agregar únicamente los datos ficticios del 8 de octubre de 2026 a esta base.
      </label>
      <button className="btn-primary disabled:cursor-not-allowed disabled:opacity-50"
        disabled={!confirmed || loading} onClick={() => void load()}>
        {loading ? 'Cargando datos demo…' : 'Cargar datos demo del 8 de octubre'}
      </button>
      {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      {result && (
        <div role="status" className="space-y-2 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900">
          <p>
            {result.appointmentsCreated === 0 && result.attendancesCreated === 0
              ? 'Los datos demo ya estaban cargados. No se crearon duplicados.'
              : `Carga completada: ${result.appointmentsCreated} citas y ${result.attendancesCreated} atenciones nuevas.`}
          </p>
          <ul>
            {result.doctors.map((doctor) => (
              <li key={doctor.name}>{doctor.name}: {doctor.appointmentsCreated} citas y {doctor.attendancesCreated} atenciones nuevas.</li>
            ))}
          </ul>
          <p>Consulta Hoy por doctor si la fecha actual es el 8 de octubre; en otra fecha, selecciona el 8 de octubre de 2026 en Agenda o Reportes.</p>
        </div>
      )}
    </section>
  );
}
