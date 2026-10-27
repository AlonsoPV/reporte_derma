import { useEffect, useMemo, useRef, useState } from 'react';
import { RECIPE_BRANDS, RECIPE_CATALOG, findRecipeProduct, productsInCategory } from '@shared/recipes';
import { downloadRecipePdf, recipePdfFile, shareRecipeFile, shareRecipePdf } from '../lib/recipePdf';

export type RecipeLine = {
  id: string;
  category: string;
  productName: string;
  usage: string;
  recommendation: string;
};

export type RecipeContext = {
  patientName: string;
  phone?: string | null;
  doctorName?: string | null;
  dateLabel: string;
};

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function printRecipe(context: RecipeContext, lines: RecipeLine[]) {
  const items = lines.map((line) => `
    <article>
      <p class="category">${escapeHtml(line.category)}</p>
      <h2>${escapeHtml(line.productName)}</h2>
      <p><strong>Forma de uso.</strong> ${escapeHtml(line.usage)}</p>
      <p>${escapeHtml(line.recommendation)}</p>
    </article>
  `).join('');
  const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <title>Receta ${escapeHtml(context.patientName || 'paciente')}</title>
  <style>
    body { font-family: Georgia, "Times New Roman", serif; color: #1c2b33; margin: 32px; }
    header { border-bottom: 2px solid #1f6f6a; padding-bottom: 12px; margin-bottom: 20px; }
    h1 { font-size: 22px; margin: 0 0 8px; }
    .meta { margin: 0; font-size: 14px; line-height: 1.5; }
    article { break-inside: avoid; margin: 0 0 16px; }
    .category { margin: 0; font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; color: #5c6b73; }
    h2 { margin: 2px 0 6px; font-size: 16px; }
    p { margin: 0 0 6px; font-size: 14px; line-height: 1.45; }
  </style>
</head>
<body>
  <header>
    <h1>Recomendaciones</h1>
    <p class="meta">Paciente: ${escapeHtml(context.patientName || '—')}<br />
    Fecha: ${escapeHtml(context.dateLabel)}${context.doctorName ? `<br />Doctor: ${escapeHtml(context.doctorName)}` : ''}</p>
  </header>
  ${items}
</body>
</html>`;
  const frame = document.createElement('iframe');
  frame.setAttribute('title', 'Receta');
  frame.style.position = 'fixed';
  frame.style.right = '0';
  frame.style.bottom = '0';
  frame.style.width = '0';
  frame.style.height = '0';
  frame.style.border = '0';
  document.body.appendChild(frame);
  const doc = frame.contentDocument;
  if (!doc) {
    frame.remove();
    return;
  }
  doc.open();
  doc.write(html);
  doc.close();
  const run = () => {
    frame.contentWindow?.focus();
    frame.contentWindow?.print();
    window.setTimeout(() => frame.remove(), 1000);
  };
  if (frame.contentWindow?.document.readyState === 'complete') run();
  else frame.onload = run;
}

export function RecipeEditor({
  lines,
  onChange,
  context,
}: {
  lines: RecipeLine[];
  onChange: (lines: RecipeLine[]) => void;
  context: RecipeContext;
}) {
  const [category, setCategory] = useState('');
  const [brand, setBrand] = useState('');
  const [productName, setProductName] = useState('');
  const [error, setError] = useState('');
  const [shareNote, setShareNote] = useState('');
  const [sharing, setSharing] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const readyFile = useRef<File | null>(null);

  const shareTitle = `Recomendaciones ${context.patientName || ''}`.trim();
  const shareText = context.phone
    ? `Recomendaciones para ${context.patientName || 'el paciente'}. Tel. ${context.phone}`
    : `Recomendaciones para ${context.patientName || 'el paciente'}`;

  useEffect(() => {
    let cancelled = false;
    readyFile.current = null;
    if (!lines.length) return;
    void recipePdfFile(context, lines).then((file) => {
      if (!cancelled) readyFile.current = file;
    }).catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [lines, context.patientName, context.phone, context.doctorName, context.dateLabel]);

  const products = useMemo(() => productsInCategory(category, brand), [category, brand]);

  const chooseCategory = (next: string) => {
    setCategory(next);
    setProductName('');
    setError('');
  };

  const chooseBrand = (next: string) => {
    setBrand(next);
    setProductName('');
    setError('');
  };

  const chooseProduct = (next: string) => {
    setProductName(next);
    setError('');
  };

  const updateLine = (id: string, patch: Partial<Pick<RecipeLine, 'usage' | 'recommendation'>>) => {
    onChange(lines.map((line) => (line.id === id ? { ...line, ...patch } : line)));
  };

  const add = () => {
    const product = findRecipeProduct(category, productName);
    if (!category || !product) {
      setError('Elige categoría y producto.');
      return;
    }
    if (lines.some((line) => line.category === category && line.productName === product.name)) {
      setError('Ese producto ya está en la receta.');
      return;
    }
    onChange([
      ...lines,
      {
        id: crypto.randomUUID(),
        category,
        productName: product.name,
        usage: product.usage,
        recommendation: product.recommendation,
      },
    ]);
    setProductName('');
    setError('');
  };

  return (
    <div className="space-y-3 rounded-2xl border border-slate-200 p-3">
      <div>
        <div className="text-sm font-semibold text-ink">Receta</div>
        <p className="text-xs text-slate-500">Opcional. El producto trae su uso y su recomendación. Se ajustan después de agregarlo.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label className="label">Marca</label>
          <select className="input" value={brand} onChange={(e) => chooseBrand(e.target.value)} aria-label="Marca">
            <option value="">Todas</option>
            {RECIPE_BRANDS.map((name) => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Categoría</label>
          <select className="input" value={category} onChange={(e) => chooseCategory(e.target.value)}>
            <option value="">Seleccionar…</option>
            {RECIPE_CATALOG.map((entry) => (
              <option key={entry.category} value={entry.category}>{entry.category}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Producto</label>
          <select className="input" value={productName} onChange={(e) => chooseProduct(e.target.value)} disabled={!category}>
            <option value="">Seleccionar…</option>
            {products.map((product) => (
              <option key={product.name} value={product.name}>{product.name}</option>
            ))}
          </select>
        </div>
      </div>
      {error && <div className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>}
      <button type="button" className="btn-secondary w-full" onClick={add}>
        Agregar a la receta
      </button>

      {lines.length > 0 && (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <div className="border-b border-slate-100 px-3 py-3">
            <h3 className="font-display text-lg font-semibold">Recomendaciones</h3>
            <p className="mt-1 text-sm leading-5 text-slate-600">
              <span className="block truncate">{context.patientName || 'Paciente sin nombre'}</span>
              <span className="block">{context.dateLabel}</span>
              {context.doctorName ? <span className="block truncate">{context.doctorName}</span> : null}
            </p>
          </div>
          <div className="divide-y divide-slate-100">
            {lines.map((line) => {
              const editing = editingId === line.id;
              return (
                <div key={line.id} className="px-3 py-3">
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{line.category}</div>
                      <div className="truncate font-semibold leading-5">{line.productName}</div>
                    </div>
                    <button
                      type="button"
                      className="btn-ghost shrink-0 whitespace-nowrap px-2 py-1 text-xs"
                      onClick={() => setEditingId(editing ? null : line.id)}
                    >
                      {editing ? 'Listo' : 'Ajustar'}
                    </button>
                    <button
                      type="button"
                      className="btn-ghost shrink-0 whitespace-nowrap px-2 py-1 text-xs text-rose-700"
                      onClick={() => {
                        if (editingId === line.id) setEditingId(null);
                        onChange(lines.filter((item) => item.id !== line.id));
                      }}
                    >
                      Quitar
                    </button>
                  </div>
                  {editing ? (
                    <div className="mt-2 grid gap-2">
                      <div>
                        <label className="label">Forma de uso</label>
                        <textarea
                          className="input min-h-[4.5rem] text-base sm:text-sm"
                          value={line.usage}
                          onChange={(e) => updateLine(line.id, { usage: e.target.value })}
                        />
                      </div>
                      <div>
                        <label className="label">Recomendación</label>
                        <textarea
                          className="input min-h-[4.5rem] text-base sm:text-sm"
                          value={line.recommendation}
                          onChange={(e) => updateLine(line.id, { recommendation: e.target.value })}
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="mt-1 space-y-1 text-sm leading-5 text-slate-700">
                      <p><span className="font-semibold">Uso.</span> {line.usage}</p>
                      <p>{line.recommendation}</p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <div className="grid grid-cols-1 gap-2 border-t border-slate-100 p-3 sm:grid-cols-3">
            <button type="button" className="btn-secondary w-full" onClick={() => printRecipe(context, lines)} disabled={sharing}>Imprimir</button>
            <button
              type="button"
              className="btn-secondary w-full"
              disabled={sharing}
              onClick={() => {
                setShareNote('');
                void downloadRecipePdf(context, lines)
                  .then(() => setShareNote('PDF guardado en descargas.'))
                  .catch(() => setShareNote('No se pudo guardar el PDF.'));
              }}
            >
              Guardar PDF
            </button>
            <button
              type="button"
              className="btn-primary w-full"
              disabled={sharing}
              onClick={() => {
                setShareNote('');
                setSharing(true);
                const file = readyFile.current;
                const done = (result: 'shared' | 'downloaded') => {
                  setSharing(false);
                  setShareNote(
                    result === 'shared'
                      ? 'Elige WhatsApp para enviar el PDF. Lo escrito se conserva al volver.'
                      : context.phone
                        ? `Se descargó el PDF. En WhatsApp adjúntalo al chat ${context.phone}. Lo escrito sigue aquí.`
                        : 'Se descargó el PDF. Ábrelo en WhatsApp y adjúntalo al chat. Lo escrito sigue aquí.',
                  );
                };
                const fail = (shareError: unknown) => {
                  if (shareError instanceof Error && shareError.name === 'AbortError') {
                    setSharing(false);
                    return;
                  }
                  void downloadRecipePdf(context, lines).then(() => done('downloaded')).catch(() => {
                    setSharing(false);
                    setShareNote('No se pudo compartir el PDF.');
                  });
                };
                if (file) {
                  void shareRecipeFile(file, shareTitle, shareText).then(done).catch(fail);
                  return;
                }
                void shareRecipePdf(context, lines, shareText).then(done).catch(fail);
              }}
            >
              {sharing ? 'Preparando PDF…' : 'WhatsApp'}
            </button>
          </div>
          {shareNote && <p className="px-3 pb-3 text-xs text-slate-500">{shareNote}</p>}
        </div>
      )}
    </div>
  );
}
