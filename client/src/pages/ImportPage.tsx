import { useState } from 'react';
import { api } from '../lib/api';

type PreviewSummary = {
  rowsDetected: number;
  newCount: number;
  existingCount: number;
  updatedCount: number;
  cancelledCount: number;
  errorCount: number;
  doctorsDetected: string[];
  unmappedDoctors: string[];
  errors: Array<{ row: number; message: string }>;
  missingColumns: string[];
};

export function ImportPage() {
  const [file, setFile] = useState<File | null>(null);
  const [importId, setImportId] = useState<string | null>(null);
  const [summary, setSummary] = useState<PreviewSummary | null>(null);
  const [filename, setFilename] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const preview = async () => {
    if (!file) return;
    setLoading(true);
    setError('');
    setDone(false);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await api.post<{ importId: string; filename: string; summary: PreviewSummary }>(
        '/api/imports/preview',
        form
      );
      setImportId(res.importId);
      setFilename(res.filename);
      setSummary(res.summary);
    } catch (e) {
      const err = e as Error & { data?: { missingColumns?: string[] } };
      setError(err.message);
      if (err.data?.missingColumns?.length) {
        setError(`${err.message}: ${err.data.missingColumns.join(', ')}`);
      }
      setSummary(null);
      setImportId(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-semibold">Importar Excel (Huli)</h1>
        <p className="text-slate-600">Vista previa antes de confirmar. Upsert por ID cita.</p>
      </div>

      <div className="card space-y-4 p-6">
        <div>
          <label className="label">Archivo .xlsx</label>
          <input
            className="input"
            type="file"
            accept=".xlsx,.xls"
            onChange={(e) => {
              setFile(e.target.files?.[0] || null);
              setSummary(null);
              setImportId(null);
              setDone(false);
            }}
          />
        </div>
        <button className="btn-primary" disabled={!file || loading} onClick={preview}>
          {loading ? 'Analizando…' : 'Analizar archivo'}
        </button>
        {error && <div className="rounded-xl bg-rose-50 px-4 py-3 text-rose-700">{error}</div>}
        {done && <div className="rounded-xl bg-emerald-50 px-4 py-3 text-emerald-800">Importación confirmada correctamente.</div>}
      </div>

      {summary && (
        <div className="card space-y-5 p-6">
          <div>
            <h2 className="text-lg font-semibold">Vista previa — {filename}</h2>
            <p className="text-sm text-slate-500">Revisa los totales antes de confirmar</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {[
              ['Filas', summary.rowsDetected],
              ['Nuevas', summary.newCount],
              ['Existentes', summary.existingCount],
              ['Actualizadas', summary.updatedCount],
              ['Canceladas', summary.cancelledCount],
              ['Errores', summary.errorCount],
            ].map(([label, value]) => (
              <div key={String(label)} className="rounded-2xl bg-sand p-4">
                <div className="text-xs uppercase text-slate-500">{label}</div>
                <div className="mt-1 text-2xl font-semibold">{value}</div>
              </div>
            ))}
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <h3 className="font-medium">Doctores detectados</h3>
              <ul className="mt-2 space-y-1 text-sm text-slate-700">
                {summary.doctorsDetected.map((d) => <li key={d}>• {d}</li>)}
              </ul>
            </div>
            <div>
              <h3 className="font-medium text-amber-800">Sin mapear</h3>
              {summary.unmappedDoctors.length === 0 ? (
                <p className="mt-2 text-sm text-slate-500">Todos los doctores están mapeados</p>
              ) : (
                <ul className="mt-2 space-y-1 text-sm text-amber-800">
                  {summary.unmappedDoctors.map((d) => <li key={d}>• {d}</li>)}
                </ul>
              )}
              <p className="mt-2 text-xs text-slate-500">Las filas se importarán igual; puedes mapear después en Administración.</p>
            </div>
          </div>

          {summary.errors.length > 0 && (
            <div className="rounded-xl bg-rose-50 p-4 text-sm text-rose-800">
              {summary.errors.slice(0, 10).map((e) => (
                <div key={`${e.row}-${e.message}`}>Fila {e.row}: {e.message}</div>
              ))}
            </div>
          )}

          <div className="flex gap-2">
            <button
              className="btn-secondary"
              onClick={async () => {
                if (!importId) return;
                await api.post(`/api/imports/cancel/${importId}`);
                setSummary(null);
                setImportId(null);
              }}
            >
              Cancelar
            </button>
            <button
              className="btn-primary"
              onClick={async () => {
                if (!importId) return;
                setLoading(true);
                try {
                  await api.post(`/api/imports/confirm/${importId}`);
                  setDone(true);
                  setSummary(null);
                  setImportId(null);
                } catch (e) {
                  setError(e instanceof Error ? e.message : 'Error al confirmar');
                } finally {
                  setLoading(false);
                }
              }}
            >
              Confirmar importación
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
