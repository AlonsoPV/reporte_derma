import { useEffect, useState } from 'react';
import { api } from '../lib/api';

type Result = {
  applied: boolean;
  counts: { appointments: number; attendances: number; closures: number; users: number; doctors: number };
  preserved: { demoAppointments: number; mixedClosures: number; demoUsers: number; protectedAdmin: boolean };
  actorDeleted: boolean;
};
const confirmation = 'BORRAR DEMO Y CUENTAS';

export function DemoCleanup() {
  const [preview, setPreview] = useState<Result | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    api.get<Result>('/api/admin/demo-cleanup').then(setPreview)
      .catch((e) => setError(e instanceof Error ? e.message : 'No se pudo revisar la información demo.'));
  }, []);
  async function remove() {
    if (input !== confirmation || busy) return;
    setBusy(true);
    setError('');
    try {
      const response = await api.post<Result>('/api/admin/demo-cleanup', { confirmation: input });
      setResult(response);
      setInput('');
      if (!response.actorDeleted) {
        setPreview(await api.get<Result>('/api/admin/demo-cleanup'));
        window.dispatchEvent(new Event('demo-cleanup-complete'));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo eliminar la información demo.');
    } finally { setBusy(false); }
  }
  return (
    <section className="card space-y-3 p-5" aria-labelledby="demo-cleanup-title">
      <h2 id="demo-cleanup-title" className="font-semibold">Eliminar información demo</h2>
      <p className="text-sm text-slate-600">
        Elimina citas y atenciones marcadas como demo, cierres exclusivamente demo y cuentas y médicos de prueba sin datos reales.
        Conserva los registros no marcados, los cierres mixtos, las cuentas vinculadas a información real y al menos un administrador activo.
        La auditoría se conserva.
      </p>
      <p className="text-sm font-medium">Afecta la base de esta app. Para limpiar producción, usa la URL publicada; la vista previa limpia desarrollo.</p>
      {preview && <p className="text-sm">
        Por eliminar: {preview.counts.appointments} citas, {preview.counts.attendances} atenciones,
        {' '}{preview.counts.closures} cierres, {preview.counts.users} cuentas y {preview.counts.doctors} médicos.
        {' '}Se conservarán {preview.preserved.demoUsers} cuentas demo protegidas.
      </p>}
      <label className="block text-sm">
        Confirma la eliminación escribiendo <strong>{confirmation}</strong>
        <input className="input mt-2" value={input} onChange={(e) => setInput(e.target.value)} disabled={busy || result?.actorDeleted}
          autoComplete="off" spellCheck={false} />
      </label>
      <button className="btn-primary disabled:cursor-not-allowed disabled:opacity-50"
        disabled={!preview || input !== confirmation || busy || result?.actorDeleted}
        onClick={() => void remove()}>{busy ? 'Eliminando…' : 'Eliminar demo y cuentas de prueba'}</button>
      {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      {result && <div role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900">
        <p>Eliminación completada: {result.counts.appointments} citas, {result.counts.attendances} atenciones,
          {' '}{result.counts.closures} cierres, {result.counts.users} cuentas y {result.counts.doctors} médicos.</p>
        <p>Se conservaron {result.preserved.demoUsers} cuentas demo protegidas y los datos no marcados como demo.</p>
        {result.actorDeleted && <p>Tu cuenta demo también se eliminó. <a className="underline" href="/login">Ingresar con una cuenta conservada</a>.</p>}
      </div>}
    </section>
  );
}
